import { handleCors, json, err } from '../_shared/cors.ts'
import { requireAuth, serviceClient } from '../_shared/auth.ts'
import { getProviderToken, ytGetAll, ytGet } from '../_shared/youtube.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { user } = await requireAuth(req)
    const token = await getProviderToken(user.id, serviceClient())
    if (!token) return err('YouTube not connected', 401)

    const url = new URL(req.url)
    const segments = url.pathname.split('/').filter(Boolean)
    // segments: ['functions', 'v1', 'playlists', ...rest]
    const rest = segments.slice(3)

    // GET /playlists/:playlistId/items
    if (rest.length === 2 && rest[1] === 'items') {
      const items = await ytGetAll('playlistItems', token, {
        part: 'snippet,contentDetails',
        playlistId: rest[0],
        maxResults: '50',
      })
      return json(items)
    }

    // GET /playlists
    const playlists = await ytGetAll('playlists', token, {
      part: 'snippet,contentDetails',
      mine: 'true',
      maxResults: '50',
    })
    return json(playlists)
  } catch (e) {
    return err(e.message)
  }
})
