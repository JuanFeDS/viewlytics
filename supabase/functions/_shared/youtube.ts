const YT_BASE = 'https://www.googleapis.com/youtube/v3'

export async function ytGet(endpoint: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${YT_BASE}/${endpoint}`)
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

export async function ytGetAll(
  endpoint: string,
  token: string,
  params: Record<string, string> = {},
  maxPages = 10
) {
  const items: unknown[] = []
  let pageToken: string | undefined

  for (let i = 0; i < maxPages; i++) {
    const p = pageToken ? { ...params, pageToken } : params
    const data = await ytGet(endpoint, token, p)
    if (data.error) throw new Error(data.error.message)
    items.push(...(data.items ?? []))
    pageToken = data.nextPageToken
    if (!pageToken) break
  }

  return items
}

export async function getProviderToken(userId: string, supabase: ReturnType<typeof import('./auth.ts').serviceClient>) {
  const { data } = await supabase
    .from('profiles')
    .select('provider_token')
    .eq('id', userId)
    .single()
  return data?.provider_token as string | null
}

export async function upsertChannelAndVideo(
  supabase: ReturnType<typeof import('./auth.ts').serviceClient>,
  video: {
    video_id: string
    title: string
    channel_id: string
    channel_title?: string
    thumbnail_url?: string
    duration?: string
  }
) {
  if (video.channel_id) {
    await supabase.from('channels').upsert(
      { channel_id: video.channel_id, name: video.channel_title ?? '' },
      { onConflict: 'channel_id', ignoreDuplicates: true }
    )
  }

  await supabase.from('videos').upsert(
    {
      video_id: video.video_id,
      title: video.title,
      channel_id: video.channel_id,
      channel_title: video.channel_title,
      thumbnail_url: video.thumbnail_url,
      duration: video.duration,
    },
    { onConflict: 'video_id', ignoreDuplicates: true }
  )
}
