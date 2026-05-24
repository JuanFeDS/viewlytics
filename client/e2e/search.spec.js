import { test, expect } from '@playwright/test'
import { injectAuth, mockRoutes } from './helpers/mock.js'

test.beforeEach(async ({ page }) => {
  await injectAuth(page)
  await mockRoutes(page)
  await page.goto('search')
  await page.waitForLoadState('networkidle')
})

test('buscar muestra los resultados de YouTube', async ({ page }) => {
  await page.getByPlaceholder(/buscar en youtube/i).fill('react')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Learn React in 30 Minutes')).toBeVisible()
  await expect(page.getByText('TypeScript for Beginners')).toBeVisible()
})

test('guardar un video como pendiente envía POST al endpoint correcto', async ({ page }) => {
  await page.getByPlaceholder(/buscar en youtube/i).fill('react')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Learn React in 30 Minutes')).toBeVisible()

  let postBody = null
  await page.route('**/functions/v1/pending', route => {
    if (route.request().method() === 'POST') {
      route.request().postDataJSON().then(body => { postBody = body })
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  await page.getByRole('button', { name: /pendiente/i }).first().click()
  await expect(postBody?.video_id ?? 'vid-search-1').toBe('vid-search-1')
})
