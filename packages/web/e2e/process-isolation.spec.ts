import { test, expect, type Page } from '@playwright/test';

/**
 * No-bridge canary (spec 2026-07-30): each process's workspace is untouched by work done
 * in the others. A distinctive recipe is written in every process; after cycling through
 * all tabs, each tab still shows exactly its own recipe — no field bled across.
 */

const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const TABS: Array<[RegExp, string]> = [
  [/Cold process/, 'canary-cp'],
  [/Hot process/, 'canary-hp'],
  [/Liquid soap/, 'canary-ls'],
];

test('each process keeps its own workspace through a full tab cycle', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  for (const [tab, name] of TABS) {
    await processTab(page, tab).click();
    await page.getByLabel(/Recipe name/i).fill(name);
    await page.getByLabel(/Recipe name/i).blur();
  }
  // Second cycle: every tab must still hold its own name and its own lye default.
  for (const [tab, name] of TABS) {
    await processTab(page, tab).click();
    await expect(page.getByLabel(/Recipe name/i)).toHaveValue(name);
  }
  await processTab(page, /Liquid soap/).click();
  await expect(page.locator('.panel--results')).toContainText(/KOH/);
  await processTab(page, /Cold process/).click();
  await expect(page.locator('.panel--results')).toContainText(/NaOH/);
});
