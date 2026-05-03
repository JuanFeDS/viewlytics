import { handleCors, json, err } from '../_shared/cors.ts'
import { requireAuth, serviceClient } from '../_shared/auth.ts'
import { getProviderToken, ytGetAll } from '../_shared/youtube.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const url = new URL(req.url)
  const segments = url.pathname.split('/').filter(Boolean).slice(3)

  try {
    const { user, supabase } = await requireAuth(req)

    // ── Category routes ────────────────────────────────────────────────

    if (segments[0] === 'categories') {
      if (req.method === 'DELETE' && segments[1]) {
        await supabase.from('subscription_categories').delete().eq('id', segments[1])
        return json({ ok: true })
      }
      if (req.method === 'POST' && segments[2] === 'assign' && segments[3]) {
        await supabase.from('subscription_category_map').upsert(
          { user_id: user.id, subscription_id: segments[3], category_id: Number(segments[1]) },
          { onConflict: 'user_id,subscription_id,category_id', ignoreDuplicates: true }
        )
        return json({ ok: true })
      }
      if (req.method === 'DELETE' && segments[2] === 'assign' && segments[3]) {
        await supabase.from('subscription_category_map')
          .delete()
          .eq('user_id', user.id)
          .eq('subscription_id', segments[3])
          .eq('category_id', segments[1])
        return json({ ok: true })
      }
      if (req.method === 'POST') {
        const { name, color } = await req.json()
        if (!name) return err('Name required', 400)
        const { data, error } = await supabase
          .from('subscription_categories')
          .insert({ user_id: user.id, name, color: color ?? '#6366f1' })
          .select()
          .single()
        if (error) return err(error.message)
        return json(data)
      }
      const { data } = await supabase.from('subscription_categories').select('*').eq('user_id', user.id)
      return json(data ?? [])
    }

    // ── Main subscriptions list ────────────────────────────────────────

    const token = await getProviderToken(user.id, serviceClient())
    if (!token) return err('YouTube not connected', 401)

    const [subscriptions, categoriesRes, mappingsRes] = await Promise.all([
      ytGetAll('subscriptions', token, { part: 'snippet', mine: 'true', maxResults: '50' }),
      supabase.from('subscription_categories').select('*').eq('user_id', user.id),
      supabase.from('subscription_category_map').select('*').eq('user_id', user.id),
    ])

    return json({
      subscriptions,
      categories: categoriesRes.data ?? [],
      mappings: mappingsRes.data ?? [],
    })
  } catch (e) {
    return err(e.message)
  }
})
