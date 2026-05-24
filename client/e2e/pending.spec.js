import { test, expect } from '@playwright/test'
import { injectAuth, mockRoutes } from './helpers/mock.js'

test.beforeEach(async ({ page }) => {
  await injectAuth(page)
  await mockRoutes(page)
  await page.goto('pending')
  await page.waitForLoadState('networkidle')
})

test('muestra los videos pendientes', async ({ page }) => {
  await expect(page.getByText('JavaScript in 100 Seconds')).toBeVisible()
})

test('los videos vistos aparecen en la pestaña Vistos', async ({ page }) => {
  await page.getByRole('tab', { name: /vistos/i }).click()
  await expect(page.getByText('10 React Hooks Explained')).toBeVisible()
})

test('la pestaña "Por ver" oculta los videos vistos', async ({ page }) => {
  // Default tab is "Por ver" — watched videos are not shown
  await expect(page.getByText('JavaScript in 100 Seconds')).toBeVisible()
  await expect(page.getByText('10 React Hooks Explained')).not.toBeVisible()
})

test('la pestaña "Vistos" oculta los pendientes', async ({ page }) => {
  await page.getByRole('tab', { name: /vistos/i }).click()
  await expect(page.getByText('10 React Hooks Explained')).toBeVisible()
  await expect(page.getByText('JavaScript in 100 Seconds')).not.toBeVisible()
})

test('marcar como visto envía PATCH al endpoint correcto', async ({ page }) => {
  let patchUrl = ''
  await page.route('**/functions/v1/pending/**', route => {
    if (route.request().method() === 'PATCH') patchUrl = route.request().url()
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  const responsePromise = page.waitForResponse(res =>
    res.url().includes('/pending/') && res.request().method() === 'PATCH'
  )
  await page.locator('[title="Marcar como visto"]').first().click({ force: true })
  await responsePromise
  expect(patchUrl).toContain('vid-pending-1')
})
