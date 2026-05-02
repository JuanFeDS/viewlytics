import { Router } from 'express'
import { google } from 'googleapis'
import db from '../db/database.js'

const router = Router()

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

router.get('/login', (req, res) => {
  const oauth2Client = getOAuthClient()
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })
  res.redirect(url)
})

router.get('/callback', async (req, res) => {
  const { code } = req.query
  if (!code) return res.redirect(`${process.env.CLIENT_URL}?error=no_code`)

  try {
    const oauth2Client = getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: userInfo } = await oauth2.userinfo.get()

    const existing = db.prepare('SELECT id FROM users WHERE google_id = ?').get(userInfo.id)

    let userId
    if (existing) {
      db.prepare('UPDATE users SET access_token = ?, refresh_token = COALESCE(?, refresh_token), name = ?, email = ? WHERE google_id = ?')
        .run(tokens.access_token, tokens.refresh_token, userInfo.name, userInfo.email, userInfo.id)
      userId = existing.id
    } else {
      const result = db.prepare('INSERT INTO users (google_id, email, name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)')
        .run(userInfo.id, userInfo.email, userInfo.name, tokens.access_token, tokens.refresh_token)
      userId = result.lastInsertRowid
    }

    req.session.userId = userId
    res.redirect(`${process.env.CLIENT_URL}/subscriptions`)
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.redirect(`${process.env.CLIENT_URL}?error=auth_failed`)
  }
})

router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.json({ user: null })
  const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.session.userId)
  res.json({ user: user || null })
})

router.post('/logout', (req, res) => {
  req.session.destroy()
  res.json({ ok: true })
})

export default router
