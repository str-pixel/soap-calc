import { test, expect, type Page } from '@playwright/test';

/**
 * Browser guard for liquid soap's third liquid phase. LS cooks a paste and then dilutes it,
 * so an alternative liquid interacts with the dilution water in ways a bar recipe never
 * does: its own water is already in the paste, its fat rides on top of the stated superfat,
 * and it must join before the cook rather than after. Also pins the process gate — a liquid
 * a process doesn't offer must render honestly rather than silently claiming to be custom.
 */

const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

const splitPanel = (page: Page) =>
  page
    .locator('section.panel--nested')
    .filter({ has: page.getByRole('heading', { name: 'Split liquid' }) })
    .first();

const dilutionPanel = (page: Page) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Dilution' }) })
    .first();

/** Grams from a formatted weight like "2,270 g". */
const grams = (text: string) => Number(text.replace(/[^0-9.]/g, ''));

async function freshLiquidSoap(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await processTab(page, /Liquid soap/).click();
}

/** Adds one alternative-liquid row sized by weight, and returns the panel. */
async function addLiquid(page: Page, presetKey: string, weightGrams: string) {
  const panel = splitPanel(page);
  await panel.getByRole('button', { name: /add liquid/i }).click();
  await panel.getByRole('combobox', { name: /liquid preset/i }).selectOption(presetKey);
  await panel.getByLabel('Sized by', { exact: true }).selectOption('grams');
  await panel.getByLabel('Amount').fill(weightGrams);
  await panel.getByLabel('Amount').blur();
  return panel;
}

test('the liquid\'s own water is deducted from the dilution water', async ({ page }) => {
  await freshLiquidSoap(page);
  const before = grams(
    await dilutionPanel(page).getByText(/^[\d,.]+\s*g$/).first().innerText(),
  );

  await addLiquid(page, 'coconut-milk-canned', '200');

  // 200 g of canned coconut milk is 68% water — 136 g already in the paste before dilution
  // starts, so the prescribed dilution water must drop by exactly that.
  const after = grams(
    await dilutionPanel(page).getByText(/^[\d,.]+\s*g$/).first().innerText(),
  );
  expect(Math.round(before - after)).toBe(136);
  await expect(dilutionPanel(page)).toContainText(/136 g lighter/i);
});

test('a fatty liquid warns that it raises the effective superfat', async ({ page }) => {
  await freshLiquidSoap(page);
  await addLiquid(page, 'coconut-milk-canned', '200');
  // 42 g of fat on 1,000 g of oils = 4.2 points over the stated superfat.
  await expect(
    page.locator('.message-list--insights').filter({ hasText: /own fat gets no lye/i }),
  ).toHaveCount(1);
});

test('the liquid joins at trace, before the cook — never in the diluted soap', async ({ page }) => {
  await freshLiquidSoap(page);
  await addLiquid(page, 'milk', '200');

  const steps = await page.locator('.results-steps__list li').allInnerTexts();
  const liquidAt = steps.findIndex((s) => /milk/i.test(s));
  const cookAt = steps.findIndex((s) => /cook to a thick/i.test(s));
  const diluteAt = steps.findIndex((s) => /dilute the paste/i.test(s));

  expect(liquidAt).toBeGreaterThan(-1);
  expect(liquidAt).toBeLessThan(cookAt);
  expect(liquidAt).toBeLessThan(diluteAt);
  expect(steps[liquidAt]).toMatch(/at trace, before the cook/i);
  // The dilution step must remain plain water — no liquid name attached to it.
  expect(steps[diluteAt]).not.toMatch(/milk/i);
});

test('vinegar is withheld from the LS picker but offered for bar processes', async ({ page }) => {
  await freshLiquidSoap(page);
  const panel = splitPanel(page);
  await panel.getByRole('button', { name: /add liquid/i }).click();
  await expect(
    panel.getByRole('combobox', { name: /liquid preset/i }).locator('option', { hasText: 'Vinegar' }),
  ).toHaveCount(0);

  // Each process keeps its own workspace, so CP starts fresh — add a row there to inspect
  // the bar-process picker, which must still offer vinegar.
  await processTab(page, /Cold process/).click();
  const cpPanel = splitPanel(page);
  await cpPanel.getByRole('button', { name: /add liquid/i }).click();
  await expect(
    cpPanel.getByRole('combobox', { name: /liquid preset/i }).locator('option', { hasText: 'Vinegar' }),
  ).toHaveCount(1);
});

test('a legacy LS recipe holding vinegar renders it honestly and goes inert', async ({ page }) => {
  // Process tabs never carry a row across processes (each keeps its own workspace), so the
  // reachable stray-row route is a recipe saved BEFORE vinegar was withheld from LS — or an
  // imported one. Seed that legacy draft directly.
  await freshLiquidSoap(page);
  // Create a real LS draft through the UI (autosave writes it), then rewrite its preset to
  // vinegar — standing in for a draft saved back when LS still offered it.
  await addLiquid(page, 'milk', '200');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('soap-calc:draft:ls')), {
      timeout: 5000,
    })
    .not.toBeNull();
  await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('soap-calc:draft:ls')!);
    draft.settings.splitLiquids[0].presetKey = 'vinegar';
    draft.settings.splitLiquids[0].name = 'Vinegar (5%)';
    localStorage.setItem('soap-calc:draft:ls', JSON.stringify(draft));
    localStorage.setItem('soap-calc:active-process', 'ls');
  });
  await page.reload();

  const panel = splitPanel(page);
  // It must still say vinegar rather than falling back to "Custom…".
  await expect(panel.getByRole('combobox', { name: /liquid preset/i })).toHaveValue('vinegar');
  await expect(panel).toContainText(/not used in liquid soap/i);
  // Inert: no compensating alkali, and no note still promising it.
  await expect(panel).not.toContainText(/added to offset the acid/i);
  await expect(panel).not.toContainText(/extra lye is added to the recipe automatically/i);
});
