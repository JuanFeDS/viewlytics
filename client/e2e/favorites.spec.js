import { test, expect } from '@playwright/test'
import { injectAuth, mockRoutes } from './helpers/mock.js'

test.beforeEach(async ({ page }) => {
  await injectAuth(page)
  await mockRoutes(page)
  await page.goto('favorites')
  await page.waitForLoadState('networkidle')
})

test('muestra los videos favoritos', async ({ page }) => {
  await expect(page.getByText('The Only Intro to Docker You Need')).toBeVisible()
})

test('quitar de favoritos envía DELETE al endpoint correcto', async ({ page }) => {
  let deleteUrl = ''
  await page.route('**/functions/v1/favorites/**', route => {
    if (route.request().method() === 'DELETE') deleteUrl = route.request().url()
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  const responsePromise = page.waitForResponse(res =>
    res.url().includes('/favorites/') && res.request().method() === 'DELETE'
  )
  await page.locator('[title="Eliminar de favoritos"]').first().click({ force: true })
  await responsePromise
  expect(deleteUrl).toContain('vid-fav-1')
})
