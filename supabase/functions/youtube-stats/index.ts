import { handleCors, json, err } from '../_shared/cors.ts'
import { requireAuth, serviceClient } from '../_shared/auth.ts'
import { getProviderToken, ytGet, ytGetAll } from '../_shared/youtube.ts'

const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL = 30 * 60 * 1000

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { user } = await requireAuth(req)
    const cacheKey = `yt_${user.id}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) return json(cached.data)

    const token = await getProviderToken(user.id, serviceClient())
    if (!token) return err('YouTube not connected', 401)

    const channelRes = await ytGet('channels', token, {
      part: 'contentDetails,statistics,snippet',
      mine: 'true',
    })
    const myChannel = channelRes.items?.[0]
    const likesPlaylistId = myChannel?.contentDetails?.relatedPlaylists?.likes
    const watchLaterPlaylistId = myChannel?.contentDetails?.relatedPlaylists?.watchLater

    let likesTotal = 0
    let topLikedChannels: unknown[] = []

    if (likesPlaylistId) {
      const items = await ytGetAll('playlistItems', token, {
        part: 'snippet',
        playlistId: likesPlaylistId,
        maxResults: '50',
      }, 4)

      const likeCountRes = await ytGet('playlistItems', token, {
        part: 'id',
        playlistId: likesPlaylistId,
        maxResults: '1',
      })
      likesTotal = likeCountRes.pageInfo?.totalResults ?? items.length

      const channelMap: Record<string, { title: string; count: number }> = {}
      items.forEach((item: any) => {
        const id = item.snippet?.videoOwnerChannelId
        const title = item.snippet?.videoOwnerChannelTitle
        if (!id) return
        if (!channelMap[id]) channelMap[id] = { title, count: 0 }
        channelMap[id].count++
      })
      topLikedChannels = Object.values(channelMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    }

    let watchLaterTotal: number | null = null
    if (watchLaterPlaylistId) {
      try {
        const r = await ytGet('playlistItems', token, {
          part: 'id',
          playlistId: watchLaterPlaylistId,
          maxResults: '1',
        })
        watchLaterTotal = r.pageInfo?.totalResults ?? null
      } catch { /* inaccessible */ }
    }

    const data = {
      likesTotal,
      topLikedChannels,
      watchLaterTotal,
      ownChannel: myChannel ? {
        title: myChannel.snippet?.title,
        subscribers: myChannel.statistics?.subscriberCount ?? null,
        views: myChannel.statistics?.viewCount ?? null,
        videoCount: myChannel.statistics?.videoCount ?? null,
      } : null,
    }

    cache.set(cacheKey, { data, ts: Date.now() })
    return json(data)
  } catch (e) {
    return err(e.message)
  }
})
