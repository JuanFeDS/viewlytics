import { Router } from 'express'
import { google } from 'googleapis'
import db from '../db/database.js'
import requireAuth from '../middleware/requireAuth.js'

const router = Router()
const cache = new Map()
const CACHE_TTL = 30 * 60 * 1000

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

router.get('/', requireAuth, async (req, res) => {
  const uid = req.session.userId
  const cacheKey = `yt_${uid}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data)

  try {
    const youtube = getYouTubeClient(uid)

    // Own channel — needed for playlist IDs and channel stats
    const channelRes = await youtube.channels.list({
      part: 'contentDetails,statistics,snippet',
      mine: true,
    })
    const myChannel = channelRes.data.items?.[0]
    const likesPlaylistId = myChannel?.contentDetails?.relatedPlaylists?.likes
    const watchLaterPlaylistId = myChannel?.contentDetails?.relatedPlaylists?.watchLater

    // Liked videos — up to 200 for channel analysis
    let likesTotal = 0
    let topLikedChannels = []
    if (likesPlaylistId) {
      const items = []
      let pageToken
      let pages = 0
      do {
        const r = await youtube.playlistItems.list({
          part: 'snippet',
          playlistId: likesPlaylistId,
          maxResults: 50,
          pageToken,
        })
        if (pages === 0) likesTotal = r.data.pageInfo?.totalResults ?? 0
        items.push(...(r.data.items ?? []))
        pageToken = r.data.nextPageToken
        pages++
      } while (pageToken && pages < 4)

      const channelMap = {}
      items.forEach(item => {
        const id = item.snippet?.videoOwnerChannelId
        const title = item.snippet?.videoOwnerChannelTitle
        if (!id) return
        if (!channelMap[id]) channelMap[id] = { title, count: 0 }
        channelMap[id].count++
      })
      topLikedChannels = Object.values(channelMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    }

    // Watch Later count
    let watchLaterTotal = null
    if (watchLaterPlaylistId) {
      try {
        const r = await youtube.playlistItems.list({
          part: 'id',
          playlistId: watchLaterPlaylistId,
          maxResults: 1,
        })
        watchLaterTotal = r.data.pageInfo?.totalResults ?? null
      } catch { /* watch later can be inaccessible */ }
    }

    const data = {
      likesTotal,
      topLikedChannels,
      watchLaterTotal,
      ownChannel: myChannel ? {
        title: myChannel.snippet?.title,
        subscribers: myChannel.statistics?.subscriberCount ?? null,
        views: myChannel.statistics?.viewCount ?? null,
        videoCount: myChannel.statistics?.videoCount ?? null,
      } : null,
    }
    cache.set(cacheKey, { data, ts: Date.now() })
    res.json(data)
  } catch (err) {
    console.error('YouTube stats error:', err)
    res.status(500).json({ error: 'Failed to fetch YouTube stats' })
  }
})

export default router
