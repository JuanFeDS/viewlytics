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
      const token = await getProviderToken(user.id, serviceClient())
      if (!token) return err('YouTube not connected', 401)

      const channelId = segments[1]
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '5'), 10)

      const chData = await ytGet('channels', token, {
        part: 'contentDetails,snippet',
        id: channelId,
      })
      const channel = chData.items?.[0]
      if (!channel) return err('Channel not found', 404)

      const uploadsId = channel.contentDetails.relatedPlaylists.uploads
      const plData = await ytGet('playlistItems', token, {
        part: 'snippet,contentDetails',
        playlistId: uploadsId,
        maxResults: String(limit),
      })

      const plItems = (plData.items ?? []).filter((i: any) => i.contentDetails?.videoId)
      let vidMap: Record<string, any> = {}

      if (plItems.length > 0) {
        const videoIds = plItems.map((i: any) => i.contentDetails.videoId).join(',')
        const vidData = await ytGet('videos', token, { part: 'contentDetails,statistics', id: videoIds })
        ;(vidData.items ?? []).forEach((v: any) => { vidMap[v.id] = v })
      }

      const videos = plItems.map((item: any) => {
        const vid = vidMap[item.contentDetails.videoId] ?? {}
        return {
          videoId: item.contentDetails.videoId,
          title: item.snippet?.title,
          thumbnail: item.snippet?.thumbnails?.medium?.url,
          publishedAt: item.contentDetails.videoPublishedAt,
          duration: vid.contentDetails?.duration,
          viewCount: vid.statistics?.viewCount,
        }
      })

      return json({
        channel: {
          id: channel.id,
          title: channel.snippet.title,
          thumbnail: channel.snippet.thumbnails?.default?.url,
          description: channel.snippet.description,
        },
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
