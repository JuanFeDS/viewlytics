import { Router } from 'express'
import db from '../db/database.js'
import requireAuth from '../middleware/requireAuth.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  const videos = db.prepare(`
    SELECT * FROM pending_videos
    WHERE user_id = ?
    ORDER BY added_at DESC
  `).all(req.session.userId)
  res.json(videos)
})

router.post('/', requireAuth, (req, res) => {
  const { video_id, title, channel_id, channel_title, thumbnail_url, duration } = req.body
  if (!video_id || !title) return res.status(400).json({ error: 'video_id and title required' })

  try {
    const result = db.prepare(`
      INSERT INTO pending_videos (user_id, video_id, title, channel_id, channel_title, thumbnail_url, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.session.userId, video_id, title, channel_id, channel_title, thumbnail_url, duration)
    res.json({ id: result.lastInsertRowid, video_id, title, channel_id, channel_title, thumbnail_url, duration })
  } catch {
    res.status(409).json({ error: 'Video already in pending list' })
  }
})

router.patch('/:id/watched', requireAuth, (req, res) => {
  db.prepare(`
    UPDATE pending_videos SET watched_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(req.params.id, req.session.userId)
  res.json({ ok: true })
})

router.patch('/:id/notes', requireAuth, (req, res) => {
  const { notes } = req.body
  db.prepare('UPDATE pending_videos SET notes = ? WHERE id = ? AND user_id = ?')
    .run(notes, req.params.id, req.session.userId)
  res.json({ ok: true })
})

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM pending_videos WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.session.userId)
  res.json({ ok: true })
})

export default router
