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
    .select('provider_token, provider_refresh_token, token_expires_at')
    .eq('id', userId)
    .single()

  if (!data?.provider_token) return null

  const token = data.provider_token as string

  // Token still valid (with 5-min buffer) — return immediately
  if (data.token_expires_at) {
    const expiresAt = new Date(data.token_expires_at).getTime()
    if (expiresAt > Date.now() + 5 * 60 * 1000) return token
  } else {
    return token
  }

  // Token appears expired — attempt refresh if Google secrets are available
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

  if (!data.provider_refresh_token || !clientId || !clientSecret) {
    // No way to refresh — return the stored token and let the YouTube API
    // reject with a clear error rather than failing silently here
    return token
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: data.provider_refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  const tokens = await res.json()
  if (!tokens.access_token) return token  // refresh failed — return stored token as fallback

  await supabase.from('profiles').update({
    provider_token: tokens.access_token,
    token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
  }).eq('id', userId)

  return tokens.access_token as string
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
