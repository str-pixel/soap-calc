import { test, expect, type Page } from '@playwright/test';

/**
 * Browser guard for the recipe-derived cure milestones: CP shows the two-milestone rows;
 * LS falls back to the fixed sequester window (the model returns null for LS).
 */

const weightInputs = (page: Page) => page.locator('input[aria-label^="Weight in"]');
const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

async function freshRecipe(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await weightInputs(page).nth(0).fill('300');
  await weightInputs(page).nth(0).blur();
}

test('CP results show the two cure milestones instead of a fixed window', async ({ page }) => {
  await freshRecipe(page);
  await expect(page.getByText('Usable from (est.)')).toBeVisible();
  await expect(page.getByText(/At its best \(est\.\)|Use within \(est\.\)/)).toBeVisible();
  await expect(page.getByText('Cure (est.)', { exact: true })).toHaveCount(0);
});

test('LS falls back to the fixed sequester window (no oil-driven cure for liquid soap)', async ({ page }) => {
  await freshRecipe(page);
  await processTab(page, /Liquid soap/).click();
  await expect(page.getByText('Sequester (est.)')).toBeVisible();
  await expect(page.getByText('Usable from (est.)')).toHaveCount(0);
});
