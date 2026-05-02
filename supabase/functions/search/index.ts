import { handleCors, json, err } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/auth.ts'
import { getProviderToken, ytGet } from '../_shared/youtube.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { user } = await requireAuth(req)
    const token = await getProviderToken(user.id, serviceClient())
    if (!token) return err('YouTube not connected', 401)

    const url = new URL(req.url)
    const q = url.searchParams.get('q')
    if (!q) return err('Query required', 400)

    const params: Record<string, string> = {
      part: 'snippet',
      q,
      type: 'video',
      maxResults: '24',
      order: url.searchParams.get('order') ?? 'date',
    }
    const channelId = url.searchParams.get('channelId')
    if (channelId) params.channelId = channelId

    const data = await ytGet('search', token, params)
    if (data.error) return err(data.error.message)
    return json(data.items ?? [])
  } catch (e) {
    return err(e.message)
  }
})
