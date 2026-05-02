import { Router } from 'express'
import db from '../db/database.js'
import requireAuth from '../middleware/requireAuth.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  const uid = req.session.userId

  const pendingCount = db.prepare(`SELECT COUNT(*) as n FROM pending_videos WHERE user_id = ? AND watched_at IS NULL`).get(uid).n
  const watchedCount = db.prepare(`SELECT COUNT(*) as n FROM pending_videos WHERE user_id = ? AND watched_at IS NOT NULL`).get(uid).n
  const favoritesCount = db.prepare(`SELECT COUNT(*) as n FROM favorite_videos WHERE user_id = ?`).get(uid).n
  const categoriesCount = db.prepare(`SELECT COUNT(*) as n FROM subscription_categories WHERE user_id = ?`).get(uid).n

  const topPendingChannels = db.prepare(`
    SELECT channel_title, COUNT(*) as count
    FROM pending_videos
    WHERE user_id = ? AND watched_at IS NULL AND channel_title IS NOT NULL
    GROUP BY channel_title
    ORDER BY count DESC
    LIMIT 5
  `).all(uid)

  const topFavoriteChannels = db.prepare(`
    SELECT channel_title, COUNT(*) as count
    FROM favorite_videos
    WHERE user_id = ? AND channel_title IS NOT NULL
    GROUP BY channel_title
    ORDER BY count DESC
    LIMIT 5
  `).all(uid)

  // Videos added per week for the last 8 weeks
  const weeklyAdded = db.prepare(`
    SELECT
      strftime('%Y-W%W', added_at) as week,
      COUNT(*) as count
    FROM pending_videos
    WHERE user_id = ?
      AND added_at >= date('now', '-56 days')
    GROUP BY week
    ORDER BY week ASC
  `).all(uid)

  // Fill missing weeks with 0
  const weeks = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    const year = d.getFullYear()
    const week = String(getWeekNumber(d)).padStart(2, '0')
    const key = `${year}-W${week}`
    const found = weeklyAdded.find(w => w.week === key)
    weeks.push({ week: formatWeekLabel(d), count: found ? found.count : 0 })
  }

  res.json({
    pendingCount,
    watchedCount,
    favoritesCount,
    categoriesCount,
    topPendingChannels,
    topFavoriteChannels,
    weeklyAdded: weeks,
  })
})

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

function formatWeekLabel(d) {
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

export default router
