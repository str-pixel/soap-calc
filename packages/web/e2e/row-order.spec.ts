import { test, expect, type Page } from '@playwright/test';

/** The left-hand panels are a worklist: the row you just added is the one you are about to
 * fill in, so it sits at the top of its list. One rule, every list — see lib/rowOrder. */
const panel = (page: Page, title: RegExp) =>
  page.locator('.panel', { has: page.locator('h2.panel__title', { hasText: title }) });

test('every editor list puts the newest row on top', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Oils: the starter recipe has three; a new one lands above them.
  const oilsPanel = panel(page, /Recipe oils/i);
  const weights = oilsPanel.getByLabel(/^Weight in /);
  const before = await weights.count();
  await page.getByRole('button', { name: /add oil/i }).click();
  expect(await weights.count()).toBe(before + 1);
  // the empty weight is the FIRST row's, not the last
  await expect(weights.first()).toHaveValue('');
  await expect(weights.last()).not.toHaveValue('');

  // Additives: name the first one, add another, and the named one moves down.
  await page.getByRole('button', { name: /^\+ Add$/ }).click();
  const types = page.getByLabel(/^Additive type for /);
  await types.first().selectOption('sodium-lactate');
  await page.getByRole('button', { name: /^\+ Add$/ }).click();
  await expect(types.first()).toHaveValue('');
  await expect(types.nth(1)).toHaveValue('sodium-lactate');

  // Colorants: same.
  await page.getByRole('button', { name: /add colorant/i }).click();
  await page.getByLabel(/Colorant for/).first().selectOption('mica');
  await page.getByRole('button', { name: /add colorant/i }).click();
  const pickers = page.getByLabel(/Colorant for/);
  await expect(pickers.first()).toHaveValue('');
  await expect(pickers.nth(1)).toHaveValue('mica');
});
