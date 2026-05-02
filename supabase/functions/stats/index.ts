import { handleCors, json, err } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

function getWeekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function formatWeekLabel(d: Date) {
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { supabase } = await requireAuth(req)

    const [pendingRes, watchedRes, favRes, catRes, allPendingRes, allFavRes] = await Promise.all([
      supabase.from('pending_videos').select('id', { count: 'exact' }).is('watched_at', null),
      supabase.from('pending_videos').select('id', { count: 'exact' }).not('watched_at', 'is', null),
      supabase.from('favorite_videos').select('id', { count: 'exact' }),
      supabase.from('subscription_categories').select('id', { count: 'exact' }),
      supabase.from('pending_videos').select('added_at, videos(channel_title)'),
      supabase.from('favorite_videos').select('videos(channel_title)'),
    ])

    const pendingCount = pendingRes.count ?? 0
    const watchedCount = watchedRes.count ?? 0
    const favoritesCount = favRes.count ?? 0
    const categoriesCount = catRes.count ?? 0

    // Top channels from pending
    const pendingChannelMap: Record<string, number> = {}
    ;(allPendingRes.data ?? []).forEach((row: any) => {
      const title = row.videos?.channel_title
      if (title) pendingChannelMap[title] = (pendingChannelMap[title] ?? 0) + 1
    })
    const topPendingChannels = Object.entries(pendingChannelMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([channel_title, count]) => ({ channel_title, count }))

    // Top channels from favorites
    const favChannelMap: Record<string, number> = {}
    ;(allFavRes.data ?? []).forEach((row: any) => {
      const title = row.videos?.channel_title
      if (title) favChannelMap[title] = (favChannelMap[title] ?? 0) + 1
    })
    const topFavoriteChannels = Object.entries(favChannelMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([channel_title, count]) => ({ channel_title, count }))

    // Weekly added (last 8 weeks)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 56)

    const weeklyMap: Record<string, number> = {}
    ;(allPendingRes.data ?? []).forEach((row: any) => {
      const d = new Date(row.added_at)
      if (d >= cutoff) {
        const key = `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, '0')}`
        weeklyMap[key] = (weeklyMap[key] ?? 0) + 1
      }
    })

    const weeklyAdded = []
    for (let i = 7; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i * 7)
      const key = `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, '0')}`
      weeklyAdded.push({ week: formatWeekLabel(d), count: weeklyMap[key] ?? 0 })
    }

    return json({
      pendingCount,
      watchedCount,
      favoritesCount,
      categoriesCount,
      topPendingChannels,
      topFavoriteChannels,
      weeklyAdded,
    })
  } catch (e) {
    return err(e.message)
  }
})
