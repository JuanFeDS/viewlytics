import { test, expect } from '@playwright/test'
import { injectAuth, mockRoutes } from './helpers/mock.js'

test.beforeEach(async ({ page }) => {
  await injectAuth(page)
  await mockRoutes(page)
  await page.goto('subscriptions')
  await page.waitForLoadState('networkidle')
})

test('muestra los canales suscritos', async ({ page }) => {
  await expect(page.getByText('Fireship')).toBeVisible()
  await expect(page.getByText('Theo - t3.gg')).toBeVisible()
  await expect(page.getByText('ThePrimeagen')).toBeVisible()
})

test('el buscador filtra canales por nombre', async ({ page }) => {
  await page.getByPlaceholder('Buscar canal...').fill('fire')
  await expect(page.getByText('Fireship')).toBeVisible()
  await expect(page.getByText('Theo - t3.gg')).not.toBeVisible()
  await expect(page.getByText('ThePrimeagen')).not.toBeVisible()
})

test('el filtro de categoría muestra solo los canales asignados', async ({ page }) => {
  await page.getByRole('button', { name: 'Tech' }).click()
  await expect(page.getByText('Fireship')).toBeVisible()
  await expect(page.getByText('Theo - t3.gg')).not.toBeVisible()
})

test('sort "Menos revisados" pone ThePrimeagen primero (sin historial)', async ({ page }) => {
  await page.getByRole('button', { name: 'Menos revisados' }).click()

  const cards = page.locator('[data-slot="card"]').filter({ hasText: /Fireship|Theo|ThePrimeagen/ })
  await expect(cards.first()).toContainText('ThePrimeagen')
})

test('sort "Recién revisados" pone Fireship primero (revisado más tarde)', async ({ page }) => {
  await page.getByRole('button', { name: 'Recién revisados' }).click()

  const cards = page.locator('[data-slot="card"]').filter({ hasText: /Fireship|Theo|ThePrimeagen/ })
  await expect(cards.first()).toContainText('Fireship')
})

test('abrir el drawer de un canal lo marca como revisado', async ({ page }) => {
  await page.getByText('ThePrimeagen').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  // Wait for drawer to fully unmount (300ms close animation)
  await expect(page.getByRole('dialog')).not.toBeAttached()
  await page.getByRole('button', { name: 'Menos revisados' }).click()
  const first = page.locator('[data-slot="card"]').filter({ hasText: /Fireship|Theo|ThePrimeagen/ }).first()
  await expect(first).not.toContainText('ThePrimeagen')
})
