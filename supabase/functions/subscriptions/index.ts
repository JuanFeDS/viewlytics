import { handleCors, json, err } from '../_shared/cors.ts'
import { requireAuth, serviceClient } from '../_shared/auth.ts'
import { getProviderToken, ytGetAll, ytGet } from '../_shared/youtube.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { user, supabase } = await requireAuth(req)
    const url = new URL(req.url)
    const segments = url.pathname.split('/').filter(Boolean).slice(3)
    // e.g. [] | ['categories'] | ['categories','5'] | ['categories','5','assign','UCxxx']
    //          | ['channel','UCxxx','recent']

    // ── Category routes ────────────────────────────────────────────────

    if (segments[0] === 'categories') {
      // DELETE /categories/:id
      if (req.method === 'DELETE' && segments[1]) {
        await supabase.from('subscription_categories').delete().eq('id', segments[1])
        return json({ ok: true })
      }
      // POST /categories/:catId/assign/:subId
      if (req.method === 'POST' && segments[2] === 'assign' && segments[3]) {
        await supabase.from('subscription_category_map').upsert(
          { user_id: user.id, subscription_id: segments[3], category_id: Number(segments[1]) },
          { onConflict: 'user_id,subscription_id,category_id', ignoreDuplicates: true }
        )
        return json({ ok: true })
      }
      // DELETE /categories/:catId/assign/:subId
      if (req.method === 'DELETE' && segments[2] === 'assign' && segments[3]) {
        await supabase.from('subscription_category_map')
          .delete()
          .eq('user_id', user.id)
          .eq('subscription_id', segments[3])
          .eq('category_id', segments[1])
        return json({ ok: true })
      }
      // POST /categories
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
      // GET /categories
      const { data } = await supabase.from('subscription_categories').select('*').eq('user_id', user.id)
      return json(data ?? [])
    }

    // ── Channel recent videos ──────────────────────────────────────────

    if (segments[0] === 'channel' && segments[2] === 'recent') {
      const channelId = segments[1]
      if (!channelId) return err('Missing channelId', 400)
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '5'), 10)

      const apiKey = Deno.env.get('YOUTUBE_API_KEY')
      if (!apiKey) return err('YouTube API key not configured', 500)

      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
      searchUrl.searchParams.set('key', apiKey)
      searchUrl.searchParams.set('channelId', channelId)
      searchUrl.searchParams.set('part', 'snippet')
      searchUrl.searchParams.set('order', 'date')
      searchUrl.searchParams.set('type', 'video')
      searchUrl.searchParams.set('maxResults', String(limit))

      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), 8000)
      let searchData: any
      try {
        const searchRes = await fetch(searchUrl.toString(), { signal: abort.signal })
        clearTimeout(timer)
        if (!searchRes.ok) return err(`YouTube API error: ${searchRes.status}`, 502)
        searchData = await searchRes.json()
      } catch (e) {
        clearTimeout(timer)
        return err(`YouTube API unavailable: ${e.message}`, 502)
      }
      if (searchData.error) return err(searchData.error.message, 502)

      const items = searchData.items ?? []
      const videos = items.map((item: any) => ({
        videoId: item.id?.videoId ?? '',
        title: item.snippet?.title ?? '',
        thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
        publishedAt: item.snippet?.publishedAt ?? '',
      })).filter((v: any) => v.videoId)

      return json({
        channel: { id: channelId, title: items[0]?.snippet?.channelTitle ?? '' },
        videos,
      })
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
