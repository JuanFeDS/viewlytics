export function isoToSeconds(iso) {
  if (!iso) return 0
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0)
}

export function parseDuration(iso) {
  if (!iso) return null
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return null
  const h = parseInt(m[1] || 0)
  const min = parseInt(m[2] || 0)
  const sec = String(parseInt(m[3] || 0)).padStart(2, '0')
  return h > 0 ? `${h}:${String(min).padStart(2, '0')}:${sec}` : `${min}:${sec}`
}

export function formatViews(n) {
  if (!n) return null
  const num = parseInt(n)
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`
  return String(num)
}

export function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days} días`
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem`
  if (days < 365) return `Hace ${Math.floor(days / 30)} meses`
  return `Hace ${Math.floor(days / 365)} años`
}

// --- YouTube Data API v3 fetch utilities ---

/** Returns a map of videoId → { title, thumbnail_url, channel_title } for the given IDs. */
export async function fetchVideoSnippets(apiKey, videoIds) {
  if (!videoIds.length) return {}
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('id', videoIds.join(','))
  url.searchParams.set('part', 'snippet')
  const data = await fetch(url.toString()).then(r => r.json()).catch(() => ({ items: [] }))
  return Object.fromEntries(
    (data.items ?? []).map(item => [item.id, {
      title: item.snippet?.title,
      thumbnail_url: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
      channel_title: item.snippet?.channelTitle,
    }])
  )
}

/**
 * Fetches recent videos for a channel.
 * Returns normalized { video_id, title, channel_title, thumbnail_url, publishedAt, duration }[].
 */
export async function fetchChannelVideos(apiKey, channelId, { maxResults = 50, excludeVideoId = null, signal } = {}) {
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
  searchUrl.searchParams.set('key', apiKey)
  searchUrl.searchParams.set('channelId', channelId)
  searchUrl.searchParams.set('part', 'snippet')
  searchUrl.searchParams.set('order', 'date')
  searchUrl.searchParams.set('type', 'video')
  searchUrl.searchParams.set('maxResults', String(maxResults))

  const searchData = await fetch(searchUrl.toString(), signal ? { signal } : undefined).then(r => r.json())
  if (searchData.error) throw new Error(searchData.error.message)

  const candidates = (searchData.items ?? [])
    .filter(item => item.id?.videoId && item.id.videoId !== excludeVideoId)
    .map(item => ({
      video_id: item.id.videoId,
      title: item.snippet?.title ?? '',
      channel_title: item.snippet?.channelTitle ?? '',
      thumbnail_url: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
      publishedAt: item.snippet?.publishedAt ?? '',
    }))

  if (!candidates.length) return []

  const ids = candidates.map(v => v.video_id).join(',')
  const detailsData = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&id=${ids}&part=contentDetails`,
    signal ? { signal } : undefined
  ).then(r => r.json()).catch(() => ({ items: [] }))

  const durationMap = Object.fromEntries(
    (detailsData.items ?? []).map(i => [i.id, i.contentDetails?.duration ?? ''])
  )
  return candidates.map(v => ({ ...v, duration: durationMap[v.video_id] ?? '' }))
}

/** Resolves a channelId from a videoId (1 quota unit). Returns null if not found. */
export async function resolveChannelId(apiKey, videoId) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&id=${videoId}&part=snippet`)
  const data = await res.json()
  return data.items?.[0]?.snippet?.channelId ?? null
}
