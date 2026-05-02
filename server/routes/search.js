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
  const { q, channelId, order = 'date' } = req.query
  if (!q) return res.status(400).json({ error: 'Query required' })

  try {
    const youtube = getYouTubeClient(req.session.userId)
    const params = {
      part: 'snippet',
      q,
      type: 'video',
      maxResults: 24,
      order,
    }
    if (channelId) params.channelId = channelId

    const response = await youtube.search.list(params)
    res.json(response.data.items)
  } catch (err) {
    console.error('Search error:', err)
    res.status(500).json({ error: 'Search failed' })
  }
})

export default router
