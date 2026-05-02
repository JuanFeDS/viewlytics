import { Router } from 'express'
import db from '../db/database.js'
import requireAuth from '../middleware/requireAuth.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  const videos = db.prepare('SELECT * FROM favorite_videos WHERE user_id = ? ORDER BY saved_at DESC')
    .all(req.session.userId)
  res.json(videos)
})

router.post('/', requireAuth, (req, res) => {
  const { video_id, title, channel_id, channel_title, thumbnail_url } = req.body
  if (!video_id || !title) return res.status(400).json({ error: 'video_id and title required' })

  try {
    const result = db.prepare(`
      INSERT INTO favorite_videos (user_id, video_id, title, channel_id, channel_title, thumbnail_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.session.userId, video_id, title, channel_id, channel_title, thumbnail_url)
    res.json({ id: result.lastInsertRowid, video_id, title })
  } catch {
    res.status(409).json({ error: 'Already in favorites' })
  }
})

router.delete('/:videoId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM favorite_videos WHERE video_id = ? AND user_id = ?')
    .run(req.params.videoId, req.session.userId)
  res.json({ ok: true })
})

export default router
