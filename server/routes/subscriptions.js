import { Router } from 'express'
import { google } from 'googleapis'
import db from '../db/database.js'
import requireAuth from '../middleware/requireAuth.js'

const router = Router()

function getYouTubeClient(userId) {
  const user = db.prepare('SELECT access_token, refresh_token FROM users WHERE id = ?').get(userId)
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  oauth2Client.setCredentials({
    access_token: user.access_token,
    refresh_token: user.refresh_token,
  })
  return google.youtube({ version: 'v3', auth: oauth2Client })
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const youtube = getYouTubeClient(req.session.userId)
    const subscriptions = []
    let pageToken

    do {
      const response = await youtube.subscriptions.list({
        part: 'snippet',
        mine: true,
        maxResults: 50,
        pageToken,
      })
      subscriptions.push(...response.data.items)
      pageToken = response.data.nextPageToken
    } while (pageToken)

    const categories = db.prepare('SELECT * FROM subscription_categories WHERE user_id = ?').all(req.session.userId)
    const mappings = db.prepare('SELECT * FROM subscription_category_map WHERE user_id = ?').all(req.session.userId)

    res.json({ subscriptions, categories, mappings })
  } catch (err) {
    console.error('Subscriptions error:', err)
    res.status(500).json({ error: 'Failed to fetch subscriptions' })
  }
})

router.get('/categories', requireAuth, (req, res) => {
  const categories = db.prepare('SELECT * FROM subscription_categories WHERE user_id = ?').all(req.session.userId)
  res.json(categories)
})

router.post('/categories', requireAuth, (req, res) => {
  const { name, color } = req.body
  if (!name) return res.status(400).json({ error: 'Name required' })
  const result = db.prepare('INSERT INTO subscription_categories (user_id, name, color) VALUES (?, ?, ?)')
    .run(req.session.userId, name, color || '#6366f1')
  res.json({ id: result.lastInsertRowid, name, color: color || '#6366f1' })
})

router.delete('/categories/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM subscription_categories WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.session.userId)
  res.json({ ok: true })
})

router.post('/categories/:categoryId/assign/:subscriptionId', requireAuth, (req, res) => {
  const { categoryId, subscriptionId } = req.params
  db.prepare('INSERT OR IGNORE INTO subscription_category_map (subscription_id, category_id, user_id) VALUES (?, ?, ?)')
    .run(subscriptionId, categoryId, req.session.userId)
  res.json({ ok: true })
})

router.delete('/categories/:categoryId/assign/:subscriptionId', requireAuth, (req, res) => {
  const { categoryId, subscriptionId } = req.params
  db.prepare('DELETE FROM subscription_category_map WHERE subscription_id = ? AND category_id = ? AND user_id = ?')
    .run(subscriptionId, categoryId, req.session.userId)
  res.json({ ok: true })
})

router.get('/channel/:channelId/recent', requireAuth, async (req, res) => {
  try {
    const youtube = getYouTubeClient(req.session.userId)
    const limit = Math.min(parseInt(req.query.limit) || 5, 10)

    // Get uploads playlist ID
    const chRes = await youtube.channels.list({
      part: 'contentDetails,snippet',
      id: req.params.channelId,
    })
    const channel = chRes.data.items?.[0]
    if (!channel) return res.status(404).json({ error: 'Channel not found' })

    const uploadsId = channel.contentDetails.relatedPlaylists.uploads

    // Get recent videos
    const plRes = await youtube.playlistItems.list({
      part: 'snippet,contentDetails',
      playlistId: uploadsId,
      maxResults: limit,
    })

    const plItems = (plRes.data.items ?? []).filter(i => i.contentDetails?.videoId)
    console.log(`[recent] channel=${req.params.channelId} uploadsId=${uploadsId} plItems=${plItems.length}`)

    // Get video durations in one batch call
    const vidMap = {}
    if (plItems.length > 0) {
      const videoIds = plItems.map(i => i.contentDetails.videoId).join(',')
      const vidRes = await youtube.videos.list({ part: 'contentDetails,statistics', id: videoIds })
      ;(vidRes.data.items ?? []).forEach(v => { vidMap[v.id] = v })
    }

    const videos = plItems.map(item => {
      const vid = vidMap[item.contentDetails.videoId] || {}
      return {
        videoId: item.contentDetails.videoId,
        title: item.snippet?.title,
        thumbnail: item.snippet?.thumbnails?.medium?.url,
        publishedAt: item.contentDetails.videoPublishedAt,
        duration: vid.contentDetails?.duration,
        viewCount: vid.statistics?.viewCount,
      }
    })

    res.json({
      channel: {
        id: channel.id,
        title: channel.snippet.title,
        thumbnail: channel.snippet.thumbnails?.default?.url,
        description: channel.snippet.description,
      },
      videos,
    })
  } catch (err) {
    console.error('Channel recent videos error:', err)
    res.status(500).json({ error: 'Failed to fetch channel videos' })
  }
})

export default router
