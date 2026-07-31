import { test, expect, type Page } from '@playwright/test';

/**
 * No-bridge canary (spec 2026-07-30): each process's workspace is untouched by work done
 * in the others. A distinctive recipe is written in every process; after cycling through
 * all tabs, each tab still shows exactly its own recipe — no field bled across.
 */

const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const TABS: Array<[RegExp, string, string, string, string]> = [
  [/Cold process/, 'canary-cp', '311', '2', '5'],
  [/Hot process/, 'canary-hp', '322', '3', '3'],
  // LS seeds 0% in-cook superfat — its 1–3% budget is delivered post-cook (2% olive).
  [/Liquid soap/, 'canary-ls', '333', '4', '0'],
];

test('each process keeps its own workspace through a full tab cycle', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  for (const [tab, name, grams, amount] of TABS) {
    await processTab(page, tab).click();
    await page.getByLabel(/Recipe name/i).fill(name);
    await page.getByLabel(/Recipe name/i).blur();
    const weight = page.locator('input[aria-label^="Weight in"]').first();
    await weight.fill(grams);
    await weight.blur();
    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    // Each tab's workspace holds exactly one additive in this test, so .first() is stable.
    // Row scoping verified against exploratory.spec.ts:459 and AdditivesPanel.tsx:194.
    const row = page.locator('ul[aria-label="Recipe additives"] li').first();
    await row.getByLabel(/^Name( for .*)?$/).fill(`${name}-add`);
    await row.getByLabel(/^Amount( for .*)?$/).fill(amount);
    await row.getByLabel(/^Amount( for .*)?$/).blur();
  }
  // Flush the last autosave before reload by switching tabs.
  await processTab(page, /Cold process/).click();
  // A leak in the PERSISTENCE layer (workspace saved under the wrong storage key) survives
  // in-memory checks — only a reload forces every workspace back through storage.
  await page.reload();
  // Second cycle: every tab must still hold its own name, weight, and additive.
  for (const [tab, name, grams, amount, superfat] of TABS) {
    await processTab(page, tab).click();
    await expect(page.getByLabel(/Recipe name/i)).toHaveValue(name);
    // Row-count guards: this test never adds or removes an oil line (the starter recipe's
    // 3 lines are untouched — only the first line's weight is edited) and adds exactly one
    // additive per tab. A refactor that APPENDS a leaked row from another tab (leaving this
    // tab's own row at index 0 untouched) would still pass a `.first()`-only assertion — the
    // count catches that shape.
    await expect(page.locator('input[aria-label^="Weight in"]')).toHaveCount(3);
    await expect(page.locator('ul[aria-label="Recipe additives"] li')).toHaveCount(1);
    await expect(page.locator('input[aria-label^="Weight in"]').first()).toHaveValue(grams);
    await expect(
      page.locator('ul[aria-label="Recipe additives"] li').first().getByLabel(/^Name( for .*)?$/),
    ).toHaveValue(`${name}-add`);
    await expect(page.locator('ul[aria-label="Recipe additives"] li').first().getByLabel(/^Amount( for .*)?$/)).toHaveValue(amount);
    await expect(page.getByLabel('Superfat %', { exact: true })).toHaveValue(superfat);
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

test('a refused import does not cost in-progress edits', async ({ page }) => {
  // discardDrafts used to run BEFORE parsing, so a refused file still wiped uncommitted
  // field edits. Now drafts are discarded only when the file is accepted.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Mid-type an oil weight and deliberately do NOT blur — commit happens on blur, so this
  // value lives only in the drafts record, exactly what discardDrafts wipes.
  const weight = page.locator('input[aria-label^="Weight in"]').first();
  await weight.fill('787');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'garbage.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 99, name: 'nope' })),
  });
  await page.getByRole('status').filter({ hasText: /version/i }).waitFor();
  await expect(weight).toHaveValue('787');
});
