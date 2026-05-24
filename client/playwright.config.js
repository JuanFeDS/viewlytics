import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'fs'

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL('.env.local', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const eq = line.indexOf('=')
      if (eq < 1) continue
      const key = line.slice(0, eq).trim()
      const raw = line.slice(eq + 1).trim()
      const val = raw.replace(/^["']|["']$/g, '')
      if (key && !process.env[key]) process.env[key] = val
    }
  } catch { /* .env.local may not exist in CI */ }
}
loadEnvLocal()

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173/viewlytics/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/viewlytics/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
