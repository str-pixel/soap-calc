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

test('import routes to its declared process and never merges into the active workspace', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await processTab(page, /Liquid soap/).click();
  await page.getByLabel(/Recipe name/i).fill('ls-before-import');
  await page.getByLabel(/Recipe name/i).blur();

  // Minimal HP recipe file, self-contained in the test — declares its process explicitly
  // (processSource is recomputed by parseRecipeFile from the `process` field regardless of
  // what's written here) so import must route to Hot process even though LS is active.
  // version must match RECIPE_FILE_VERSION in src/lib/recipeFile.ts.
  const hpFilePayload = {
    version: 2,
    process: 'hp',
    name: 'imported-hp',
    lines: [],
    additives: [],
    settings: { lyeType: 'naoh' },
    exportedAt: '2026-01-01T00:00:00.000Z',
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: 'imported-hp.soap-recipe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(hpFilePayload)),
  });

  // (a) the app lands on the Hot process tab
  await expect(processTab(page, /Hot process/)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.panel--results')).toContainText(/NaOH/);
  // (b) the imported recipe's own name shows, not the LS workspace's
  await expect(page.getByLabel(/Recipe name/i)).toHaveValue('imported-hp');
  // (c) the import is announced via the status flash
  await expect(page.getByRole('status').filter({ hasText: /Imported/ })).toContainText(
    /Imported\s*.imported-hp./,
  );

  // (d) switching back to Liquid soap shows the untouched pre-import workspace — the
  // import never merged into the LS workspace that was active when it landed.
  await processTab(page, /Liquid soap/).click();
  await expect(page.getByLabel(/Recipe name/i)).toHaveValue('ls-before-import');
});
