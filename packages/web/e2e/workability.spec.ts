import { test, expect, type Page } from '@playwright/test';

/**
 * Browser-level regression guard for the workability timeline block. The block's
 * class names (`results-workability`, `results-workability__rows`, `chip`) are
 * load-bearing for its CSS, and its render/omit logic is process-dependent
 * (CP shows it; LS omits it). Unit tests cover the estimator; this covers the
 * live wiring + guard.
 */

const weightInputs = (page: Page) => page.locator('input[aria-label^="Weight in"]');
const workability = (page: Page) => page.locator('.results-workability');
const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

async function freshRecipe(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Guarantee a valid recipe so results (and thus the workability block) render.
  await weightInputs(page).nth(0).fill('300');
  await weightInputs(page).nth(0).blur();
}

test('CP shows the workability timeline with unmold/cut/stamp rows and a confidence chip', async ({
  page,
}) => {
  await freshRecipe(page);

  const block = workability(page);
  await expect(block).toBeVisible();
  await expect(block.locator('.results-workability__title')).toHaveText(/workability/i);
  await expect(block.locator('.chip')).toHaveText(/confidence/i);

  const rows = block.locator('.results-workability__rows > div');
  await expect(rows).toHaveCount(3);
  await expect(block.getByText('Unmold', { exact: true })).toBeVisible();
  await expect(block.getByText('Cut', { exact: true })).toBeVisible();
  await expect(block.getByText('Stamp from', { exact: true })).toBeVisible();
});

test('LS omits the workability block entirely (a diluted liquid is never molded)', async ({
  page,
}) => {
  await freshRecipe(page);
  await expect(workability(page)).toBeVisible();

  await processTab(page, /Liquid soap/).click();
  await expect(workability(page)).toHaveCount(0);
});
