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
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '5'), 10)

      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), 8000)
      let xml: string
      try {
        const feedRes = await fetch(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
          { signal: abort.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        clearTimeout(timer)
        if (!feedRes.ok) return err(`Feed error: ${feedRes.status}`, 400)
        xml = await feedRes.text()
        if (!xml.includes('<feed')) return err('Feed returned invalid response', 502)
      } catch (e) {
        clearTimeout(timer)
        return err(`Feed unavailable: ${e.message}`, 502)
      }

      const beforeEntries = xml.split('<entry>')[0]
      const channelTitle = beforeEntries.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
        ?? beforeEntries.match(/<title>(.*?)<\/title>/)?.[1]
        ?? ''

      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
        .slice(0, limit)
        .map(([, e]) => ({
          videoId: e.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] ?? '',
          title: e.match(/<media:title><!\[CDATA\[([\s\S]*?)\]\]><\/media:title>/)?.[1]
            ?? e.match(/<media:title>(.*?)<\/media:title>/)?.[1] ?? '',
          thumbnail: e.match(/<media:thumbnail url="([^"]+)"/)?.[1] ?? '',
          publishedAt: e.match(/<published>(.*?)<\/published>/)?.[1] ?? '',
        }))
        .filter(v => v.videoId)

      if (entries.length === 0) return json({ channel: { id: channelId, title: channelTitle }, videos: [] })

      const token = await getProviderToken(user.id, serviceClient())
      let vidMap: Record<string, any> = {}
      if (token) {
        const videoIds = entries.map(e => e.videoId).join(',')
        const vidData = await ytGet('videos', token, { part: 'contentDetails,statistics', id: videoIds })
        ;(vidData.items ?? []).forEach((v: any) => { vidMap[v.id] = v })
      }

      const videos = entries.map(e => {
        const vid = vidMap[e.videoId] ?? {}
        return {
          videoId: e.videoId,
          title: e.title,
          thumbnail: e.thumbnail,
          publishedAt: e.publishedAt,
          duration: vid.contentDetails?.duration,
          viewCount: vid.statistics?.viewCount,
        }
      })

      return json({
        channel: { id: channelId, title: channelTitle, thumbnail: '', description: '' },
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
