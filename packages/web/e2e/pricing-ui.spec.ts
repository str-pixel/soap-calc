import { test, expect, type Page } from '@playwright/test';

/**
 * Layout regressions for the Pricing & profit panel. The panel shipped with no
 * CSS at all (#61/#62 added behavior only): materials rows rendered as inline
 * text runs ("Olive Oil450 g") with unit selects wrapping onto their own lines.
 * These tests pin the styled layout so it cannot silently regress to that.
 */

const pricingPanel = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Pricing & profit' }) }).first();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('materials rows are grids with separated name/weight cells', async ({ page }) => {
  const row = page.locator('.pricing-row').first();
  await expect(row).toBeVisible();
  expect(await row.evaluate((el) => getComputedStyle(el).display)).toBe('grid');

  const name = await row.locator('.pricing-row__name').boundingBox();
  const grams = await row.locator('.pricing-row__grams').boundingBox();
  expect(name && grams && grams.x - (name.x + name.width) >= 4,
    `name/weight cells need a visible gap (name ends ${name && name.x + name.width}, grams starts ${grams?.x})`,
  ).toBe(true);
});

test('price input and unit select sit on the same line in every row', async ({ page }) => {
  const rows = page.locator('.pricing-row');
  const n = await rows.count();
  expect(n).toBeGreaterThan(1); // oils + lye at minimum
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const price = await row.locator('input[aria-label^="Price for"]').boundingBox();
    const unit = await row.locator('select[aria-label^="Unit for"]').boundingBox();
    expect(price && unit).toBeTruthy();
    const priceCenter = price!.y + price!.height / 2;
    const unitCenter = unit!.y + unit!.height / 2;
    expect(Math.abs(priceCenter - unitCenter), `row ${i}: vertical centers should align`).toBeLessThanOrEqual(2);
    expect(unit!.x, `row ${i}: unit select belongs right of the price input`).toBeGreaterThan(price!.x);
  }
});

test('panel heading uses the shared panel-title size', async ({ page }) => {
  const heading = page.getByRole('heading', { name: 'Pricing & profit' });
  expect(await heading.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
});

test('cost breakdown line appears once all prices are set', async ({ page }) => {
  const inputs = page.locator('input[aria-label^="Price for"]');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    await inputs.nth(i).fill('10');
    await inputs.nth(i).blur();
  }
  const breakdown = pricingPanel(page).getByTestId('pricing-breakdown');
  await expect(breakdown).toBeVisible();
  await expect(breakdown).toContainText(/materials \$/);
  await expect(breakdown).toContainText(/overhead \$/);
});
