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
    const playlists = []
    let pageToken

    do {
      const response = await youtube.playlists.list({
        part: 'snippet,contentDetails',
        mine: true,
        maxResults: 50,
        pageToken,
      })
      playlists.push(...response.data.items)
      pageToken = response.data.nextPageToken
    } while (pageToken)

    res.json(playlists)
  } catch (err) {
    console.error('Playlists error:', err)
    res.status(500).json({ error: 'Failed to fetch playlists' })
  }
})

router.get('/:playlistId/items', requireAuth, async (req, res) => {
  try {
    const youtube = getYouTubeClient(req.session.userId)
    const items = []
    let pageToken

    do {
      const response = await youtube.playlistItems.list({
        part: 'snippet,contentDetails',
        playlistId: req.params.playlistId,
        maxResults: 50,
        pageToken,
      })
      items.push(...response.data.items)
      pageToken = response.data.nextPageToken
    } while (pageToken)

    res.json(items)
  } catch (err) {
    console.error('Playlist items error:', err)
    res.status(500).json({ error: 'Failed to fetch playlist items' })
  }
})

export default router
