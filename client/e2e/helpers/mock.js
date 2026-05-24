import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => JSON.parse(readFileSync(join(__dirname, `../fixtures/${name}.json`), 'utf8'))

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? ''

// Derives the Supabase project ref from the URL to build the localStorage key
function getStorageKey() {
  const match = SUPABASE_URL.match(/https?:\/\/([^.]+)/)
  const ref = match?.[1] ?? 'local'
  return `sb-${ref}-auth-token`
}

const FAKE_SESSION = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: 'test-user-id',
    email: 'test@viewlytics.test',
    app_metadata: { provider: 'google' },
    user_metadata: { name: 'Test User', avatar_url: null },
    aud: 'authenticated',
    role: 'authenticated',
  },
}

/**
 * Injects a fake Supabase session into localStorage before the page loads,
 * so the app treats the user as authenticated without a real login.
 */
export async function injectAuth(page) {
  const key = getStorageKey()
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
  }, { key, session: FAKE_SESSION })
}

/**
 * Intercepts all Supabase and YouTube API calls and returns fixture data.
 * Call this before page.goto() so the routes are registered in time.
 */
export async function mockRoutes(page) {
  const base = SUPABASE_URL

  // Auth: return the fake session so Supabase client doesn't try to refresh
  await page.route(`${base}/auth/v1/**`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ...FAKE_SESSION, user: FAKE_SESSION.user }),
  }))

  // Edge Functions
  await page.route(`${base}/functions/v1/subscriptions*`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fixture('subscriptions')),
  }))

  await page.route(`${base}/functions/v1/pending*`, async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture('pending')) })
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  await page.route(`${base}/functions/v1/favorites*`, async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture('favorites')) })
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  await page.route(`${base}/functions/v1/search*`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fixture('search')),
  }))

  // Supabase REST — channel_reviews
  await page.route(`${base}/rest/v1/channel_reviews*`, async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture('channel-reviews')) })
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  // YouTube Data API (called directly from browser for channel videos in drawer)
  await page.route('**/youtube/v3/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [] }),
  }))
}
