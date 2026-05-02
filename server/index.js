import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import cors from 'cors'

import authRoutes from './routes/auth.js'
import subscriptionsRoutes from './routes/subscriptions.js'
import playlistsRoutes from './routes/playlists.js'
import pendingRoutes from './routes/pending.js'
import searchRoutes from './routes/search.js'
import favoritesRoutes from './routes/favorites.js'
import statsRoutes from './routes/stats.js'
import channelStatsRoutes from './routes/channelStats.js'
import youtubeStatsRoutes from './routes/youtubeStats.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(express.json())
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}))

app.use('/api/auth', authRoutes)
app.use('/api/subscriptions', subscriptionsRoutes)
app.use('/api/playlists', playlistsRoutes)
app.use('/api/pending', pendingRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/favorites', favoritesRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/channel-stats', channelStatsRoutes)
app.use('/api/youtube-stats', youtubeStatsRoutes)

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
