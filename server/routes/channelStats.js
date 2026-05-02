import { Router } from 'express'
import { google } from 'googleapis'
import db from '../db/database.js'
import requireAuth from '../middleware/requireAuth.js'

const router = Router()

// 60-min in-memory cache per user
const cache = new Map()

function getYouTubeClient(userId) {
  const user = db.prepare('SELECT access_token, refresh_token FROM users WHERE id = ?').get(userId)
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  oauth2Client.setCredentials({ access_token: user.access_token, refresh_token: user.refresh_token })
  return google.youtube({ version: 'v3', auth: oauth2Client })
}

async function fetchAllSubscriptions(youtube) {
  const items = []
  let pageToken
  do {
    const r = await youtube.subscriptions.list({ part: 'snippet', mine: true, maxResults: 50, pageToken })
    items.push(...r.data.items)
    pageToken = r.data.nextPageToken
  } while (pageToken)
  return items
}

async function fetchUploadsPlaylistIds(youtube, channelIds) {
  const map = {}
  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50)
    const r = await youtube.channels.list({ part: 'contentDetails', id: batch.join(','), maxResults: 50 })
    r.data.items.forEach(ch => { map[ch.id] = ch.contentDetails.relatedPlaylists.uploads })
  }
  return map
}

async function countRecentVideos(youtube, playlistId, since) {
  try {
    const r = await youtube.playlistItems.list({ part: 'contentDetails', playlistId, maxResults: 50 })
    return r.data.items.filter(item => {
      const pub = item.contentDetails.videoPublishedAt
      return pub && new Date(pub) >= since
    }).length
  } catch { return 0 }
}

function buildCategoryStat(cat, chs) {
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

// SSE streaming endpoint
router.get('/stream', requireAuth, async (req, res) => {
  const uid = req.session.userId
  const forceRefresh = req.query.refresh === '1'
  const cacheKey = `ch_${uid}`
  const cached = cache.get(cacheKey)

  // Serve from cache immediately if fresh
  if (!forceRefresh && cached && Date.now() - cached.ts < 60 * 60 * 1000) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.write(`data: ${JSON.stringify({ progress: 100, message: 'Listo', result: cached.data })}\n\n`)
    return res.end()
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`)

  try {
    const youtube = getYouTubeClient(uid)
    const since90 = new Date()
    since90.setDate(since90.getDate() - 90)

    // Step 1 — subscriptions
    send({ progress: 5, message: 'Obteniendo suscripciones...' })
    const subscriptions = await fetchAllSubscriptions(youtube)
    const channelIds = subscriptions.map(s => s.snippet.resourceId.channelId)
    send({ progress: 15, message: `${subscriptions.length} canales encontrados. Cargando info...` })

    // Step 2 — uploads playlist IDs
    const uploadsMap = await fetchUploadsPlaylistIds(youtube, channelIds)
    send({ progress: 25, message: 'Analizando actividad de los últimos 90 días...' })

    // Step 3 — recent videos per channel, with live progress
    const activityMap = {}
    const BATCH = 8
    const totalBatches = Math.ceil(channelIds.length / BATCH)

    for (let i = 0; i < channelIds.length; i += BATCH) {
      const batch = channelIds.slice(i, i + BATCH)
      await Promise.all(batch.map(async chId => {
        const plId = uploadsMap[chId]
        activityMap[chId] = plId ? await countRecentVideos(youtube, plId, since90) : 0
      }))

      const batchIndex = Math.floor(i / BATCH) + 1
      const progress = 25 + Math.round((batchIndex / totalBatches) * 60)
      const processed = Math.min(i + BATCH, channelIds.length)
      send({ progress, message: `Analizando canales (${processed}/${channelIds.length})...` })
    }

    // Step 4 — DB cross-reference
    send({ progress: 90, message: 'Cruzando con tu historial...' })

    const categories = db.prepare('SELECT * FROM subscription_categories WHERE user_id = ?').all(uid)
    const mappings = db.prepare('SELECT * FROM subscription_category_map WHERE user_id = ?').all(uid)

    const pendingRows = db.prepare(`
      SELECT channel_id, channel_title,
        SUM(CASE WHEN watched_at IS NULL THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN watched_at IS NOT NULL THEN 1 ELSE 0 END) as watched
      FROM pending_videos WHERE user_id = ? GROUP BY COALESCE(channel_id, channel_title)
    `).all(uid)

    const favRows = db.prepare(`
      SELECT channel_id, channel_title, COUNT(*) as count
      FROM favorite_videos WHERE user_id = ? GROUP BY COALESCE(channel_id, channel_title)
    `).all(uid)

    const pendingMap = {}
    pendingRows.forEach(r => { if (r.channel_id) pendingMap[r.channel_id] = r; else pendingMap[r.channel_title] = r })
    const favMap = {}
    favRows.forEach(r => { if (r.channel_id) favMap[r.channel_id] = r.count; else favMap[r.channel_title] = r.count })

    const channels = subscriptions.map(sub => {
      const chId = sub.snippet.resourceId.channelId
      const title = sub.snippet.title
      const eng = pendingMap[chId] || pendingMap[title] || { pending: 0, watched: 0 }
      const favCount = favMap[chId] ?? favMap[title] ?? 0
      const recentVideos = activityMap[chId] ?? 0
      const chCategories = mappings
        .filter(m => m.subscription_id === sub.id)
        .map(m => categories.find(c => c.id === m.category_id))
        .filter(Boolean)

      return {
        id: sub.id, channelId: chId, title,
        thumbnail: sub.snippet.thumbnails?.default?.url,
        recentVideos,
        pendingCount: eng.pending || 0,
        watchedCount: eng.watched || 0,
        favoritesCount: favCount,
        categories: chCategories,
        engagementScore: (eng.pending || 0) + (eng.watched || 0) * 2 + favCount * 3,
      }
    })

    const uncategorized = channels.filter(ch => ch.categories.length === 0)
    const categoryStats = [
      ...categories.map(cat => buildCategoryStat(cat, channels.filter(ch => ch.categories.some(c => c.id === cat.id)))),
      ...(uncategorized.length > 0 ? [buildCategoryStat({ id: null, name: 'Sin categoría', color: '#9ca3af' }, uncategorized)] : []),
    ]

    const data = { channels, categoryStats, fetchedAt: new Date().toISOString() }
    cache.set(cacheKey, { data, ts: Date.now() })

    send({ progress: 100, message: '¡Listo!', result: data })
    res.end()
  } catch (err) {
    console.error('Channel stats SSE error:', err)
    send({ progress: -1, message: 'Error al cargar los datos', error: err.message })
    res.end()
  }
})

export default router
