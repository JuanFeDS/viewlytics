import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, serviceClient } from '../_shared/auth.ts'
import { getProviderToken, ytGetAll, ytGet } from '../_shared/youtube.ts'

const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000

function buildCategoryStat(cat: any, chs: any[]) {
  return {
    id: cat.id,
    name: cat.name,
    color: cat.color,
    channelCount: chs.length,
    activeChannels: chs.filter(c => c.recentVideos > 0).length,
    engagedChannels: chs.filter(c => c.engagementScore > 0).length,
    ghostChannels: chs.filter(c => c.recentVideos > 0 && c.engagementScore === 0).length,
    totalPending: chs.reduce((s, c) => s + c.pendingCount, 0),
    totalWatched: chs.reduce((s, c) => s + c.watchedCount, 0),
    totalFavorites: chs.reduce((s, c) => s + c.favoritesCount, 0),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const send = (controller: ReadableStreamDefaultController, payload: unknown) => {
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`))
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { user, supabase } = await requireAuth(req)

        const forceRefresh = new URL(req.url).searchParams.get('refresh') === '1'
        const cacheKey = `ch_${user.id}`
        const cached = cache.get(cacheKey)

        if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL) {
          send(controller, { progress: 100, message: 'Listo', result: cached.data })
          return controller.close()
        }

        const token = await getProviderToken(user.id, serviceClient())
        if (!token) {
          send(controller, { progress: -1, message: 'YouTube no conectado', error: 'no_token' })
          return controller.close()
        }

        const since90 = new Date()
        since90.setDate(since90.getDate() - 90)

        // Step 1 — subscriptions
        send(controller, { progress: 5, message: 'Obteniendo suscripciones...' })
        const subscriptions = await ytGetAll('subscriptions', token, {
          part: 'snippet', mine: 'true', maxResults: '50',
        })
        const channelIds = subscriptions.map((s: any) => s.snippet.resourceId.channelId)
        send(controller, { progress: 15, message: `${subscriptions.length} canales encontrados. Cargando info...` })

        // Step 2 — uploads playlist IDs
        const uploadsMap: Record<string, string> = {}
        for (let i = 0; i < channelIds.length; i += 50) {
          const batch = channelIds.slice(i, i + 50)
          const r = await ytGet('channels', token, {
            part: 'contentDetails', id: batch.join(','), maxResults: '50',
          })
          ;(r.items ?? []).forEach((ch: any) => {
            uploadsMap[ch.id] = ch.contentDetails.relatedPlaylists.uploads
          })
        }
        send(controller, { progress: 25, message: 'Analizando actividad de los últimos 90 días...' })

        // Step 3 — recent videos per channel
        const activityMap: Record<string, number> = {}
        const BATCH = 8
        const totalBatches = Math.ceil(channelIds.length / BATCH)

        for (let i = 0; i < channelIds.length; i += BATCH) {
          const batch = channelIds.slice(i, i + BATCH)
          await Promise.all(batch.map(async (chId: string) => {
            const plId = uploadsMap[chId]
            if (!plId) { activityMap[chId] = 0; return }
            try {
              const r = await ytGet('playlistItems', token, {
                part: 'contentDetails', playlistId: plId, maxResults: '50',
              })
              activityMap[chId] = (r.items ?? []).filter((item: any) => {
                const pub = item.contentDetails.videoPublishedAt
                return pub && new Date(pub) >= since90
              }).length
            } catch { activityMap[chId] = 0 }
          }))

          const progress = 25 + Math.round(((Math.floor(i / BATCH) + 1) / totalBatches) * 60)
          send(controller, { progress, message: `Analizando canales (${Math.min(i + BATCH, channelIds.length)}/${channelIds.length})...` })
        }

        // Step 4 — DB cross-reference
        send(controller, { progress: 90, message: 'Cruzando con tu historial...' })

        const [catRes, mapRes, pendingRes, favRes] = await Promise.all([
          supabase.from('subscription_categories').select('*'),
          supabase.from('subscription_category_map').select('*'),
          supabase.from('pending_videos').select('watched_at, videos(channel_id, channel_title)'),
          supabase.from('favorite_videos').select('videos(channel_id, channel_title)'),
        ])

        const categories = catRes.data ?? []
        const mappings = mapRes.data ?? []

        const pendingMap: Record<string, { pending: number; watched: number }> = {}
        ;(pendingRes.data ?? []).forEach((row: any) => {
          const key = row.videos?.channel_id ?? row.videos?.channel_title
          if (!key) return
          if (!pendingMap[key]) pendingMap[key] = { pending: 0, watched: 0 }
          if (row.watched_at) pendingMap[key].watched++
          else pendingMap[key].pending++
        })

        const favMap: Record<string, number> = {}
        ;(favRes.data ?? []).forEach((row: any) => {
          const key = row.videos?.channel_id ?? row.videos?.channel_title
          if (key) favMap[key] = (favMap[key] ?? 0) + 1
        })

        const channels = subscriptions.map((sub: any) => {
          const chId = sub.snippet.resourceId.channelId
          const title = sub.snippet.title
          const eng = pendingMap[chId] ?? { pending: 0, watched: 0 }
          const favCount = favMap[chId] ?? 0
          const recentVideos = activityMap[chId] ?? 0
          const chCategories = mappings
            .filter((m: any) => m.subscription_id === sub.id)
            .map((m: any) => categories.find((c: any) => c.id === m.category_id))
            .filter(Boolean)

          return {
            id: sub.id, channelId: chId, title,
            thumbnail: sub.snippet.thumbnails?.default?.url,
            recentVideos,
            pendingCount: eng.pending,
            watchedCount: eng.watched,
            favoritesCount: favCount,
            categories: chCategories,
            engagementScore: eng.pending + eng.watched * 2 + favCount * 3,
          }
        })

        const uncategorized = channels.filter((ch: any) => ch.categories.length === 0)
        const categoryStats = [
          ...categories.map((cat: any) =>
            buildCategoryStat(cat, channels.filter((ch: any) => ch.categories.some((c: any) => c.id === cat.id)))
          ),
          ...(uncategorized.length > 0
            ? [buildCategoryStat({ id: null, name: 'Sin categoría', color: '#9ca3af' }, uncategorized)]
            : []),
        ]

        const data = { channels, categoryStats, fetchedAt: new Date().toISOString() }
        cache.set(cacheKey, { data, ts: Date.now() })
        send(controller, { progress: 100, message: '¡Listo!', result: data })
        controller.close()
      } catch (e) {
        const controller2 = controller
        send(controller2, { progress: -1, message: 'Error al cargar los datos', error: e.message })
        controller2.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})
