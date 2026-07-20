import { test, expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Exploratory anomaly hunt across the whole UI surface: every process/variant,
 * every panel, unit round-trips, edge inputs, pricing economics, persistence.
 *
 * Every test additionally asserts: no uncaught page errors, no console.error,
 * and no NaN/Infinity/undefined/[object Object] leaking into visible text.
 * Screenshots and temp files land in the per-test output dir (test-results/).
 */

// ---------- helpers ----------

const weightInputs = (page: Page) => page.locator('input[aria-label^="Weight in"]');
const percentInputs = (page: Page) => page.locator('input[aria-label^="Percent for"]');
const unitSelect = (page: Page) => page.locator('select:has(option[value="lb"])').first();
const totalOilInput = (page: Page) => page.getByLabel(/^Total oil/);
const oilPickers = (page: Page) => page.locator('.oil-picker__input');
const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

async function resultDd(page: Page, dtPattern: RegExp): Promise<string> {
  const dt = page.locator('.panel--results .results-grid dt').filter({ hasText: dtPattern }).first();
  return (await dt.locator('xpath=following-sibling::dd[1]').innerText()).trim();
}

async function pricingDd(page: Page, dtPattern: RegExp): Promise<string> {
  const dt = page.locator('.pricing-results dt').filter({ hasText: dtPattern }).first();
  return (await dt.locator('xpath=following-sibling::dd[1]').innerText()).trim();
}

function num(s: string): number {
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

/** Displayed values are rounded, so numeric cross-checks allow 2% / 2-unit slack. */
function relClose(a: number, b: number, relTol = 0.02, absTol = 2): boolean {
  return Math.abs(a - b) <= Math.max(absTol, relTol * Math.max(Math.abs(a), Math.abs(b)));
}

async function expectNoJunkText(page: Page) {
  const body = await page.locator('body').innerText();
  for (const junk of ['NaN', 'Infinity', '[object Object]', 'undefined']) {
    expect(body, `visible text must not contain "${junk}"`).not.toContain(junk);
  }
}

async function pickOil(page: Page, pickerIndex: number, query: string) {
  const p = oilPickers(page).nth(pickerIndex);
  await p.click();
  await p.fill(query);
  await page.locator('.oil-picker__option').first().click();
}

const shot = (page: Page, testInfo: TestInfo, name: string) =>
  page.screenshot({ path: testInfo.outputPath(name), fullPage: true });

// ---------- console/pageerror capture ----------

let consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterEach(async ({ page }) => {
  await expectNoJunkText(page);
  expect(consoleErrors, 'no console errors / uncaught exceptions').toEqual([]);
});

// ---------- 1. smoke & layout ----------

test.describe('smoke & layout', () => {
  test('all always-visible panels render on CP default', async ({ page }, testInfo) => {
    await expect(page).toHaveTitle(/Soap Calc/);
    for (const h of [
      'Recipe oils', 'Additives', 'Results', 'Pricing & profit', 'Process guide',
      'Troubleshooting', 'Settings', 'Bar properties', 'Fatty acid profile',
    ]) {
      await expect(page.getByRole('heading', { name: h })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'Cold process' })).toHaveAttribute('aria-selected', 'true');
    // CP-only / LS-only visibility
    await expect(page.getByRole('heading', { name: 'CP extras' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dilution' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Preserve' })).toHaveCount(0);
    await shot(page, testInfo, 'cp-default.png');
  });

  test('mobile viewport: no horizontal overflow', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal overflow px at 390px viewport').toBeLessThanOrEqual(0);
    await shot(page, testInfo, 'mobile.png');
  });

  test('results internal consistency on starter recipe', async ({ page }) => {
    const lye = num(await resultDd(page, /^NaOH/));
    const water = num(await resultDd(page, /^Water$/));
    const oil = num(await resultDd(page, /^Oil weight/));
    const batch = num(await resultDd(page, /^Batch weight/));
    const conc = num(await resultDd(page, /^Lye concentration/));
    const ratio = num(await resultDd(page, /^Water : lye/));

    expect(oil).toBe(1000);
    expect(lye).toBeGreaterThan(100);
    expect(lye).toBeLessThan(160);
    expect(relClose(batch, oil + lye + water), `batch ${batch} = oil ${oil} + lye ${lye} + water ${water}`).toBe(true);
    expect(relClose(conc, (100 * lye) / (lye + water)), `conc ${conc} vs ${100 * lye / (lye + water)}`).toBe(true);
    expect(relClose(ratio, water / lye, 0.02, 0.05), `ratio ${ratio} vs ${water / lye}`).toBe(true);

    // Total batch breakdown line agrees with itself
    const line = await page.getByTestId('batch-weight').innerText();
    const nums = line.replace(/,/g, '').match(/-?\d+(\.\d+)?/g)!.map(Number);
    const total = nums[0];
    const parts = nums.slice(1).reduce((a, b) => a + b, 0);
    expect(relClose(total, parts, 0.02, 3), `batch line total ${total} vs parts ${parts} ("${line}")`).toBe(true);
  });
});

// ---------- 2. process & variant sweep ----------

test.describe('process/variant sweep', () => {
  test('every process and variant renders sane results', async ({ page }, testInfo) => {
    const matrix: Array<{ tab: RegExp; variants: RegExp[]; lye: RegExp }> = [
      { tab: /Cold process/, variants: [], lye: /^NaOH/ },
      { tab: /Hot process/, variants: [/Low-temp HP/, /High-temp HP/, /Fluid HP/], lye: /^NaOH/ },
      { tab: /Liquid soap/, variants: [/Cold-process LS/, /Low-temp LS/, /High-temp LS/, /30-minute LS/], lye: /^KOH/ },
    ];
    for (const row of matrix) {
      await processTab(page, row.tab).click();
      await expect(page.locator('.panel--results .results-grid dt').filter({ hasText: row.lye }).first()).toBeVisible();
      const lye = num(await resultDd(page, row.lye));
      expect(lye, `${row.tab} lye grams`).toBeGreaterThan(50);
      expect(lye).toBeLessThan(400);
      for (const v of row.variants) {
        await page.getByRole('tab', { name: v }).click();
        await expect(page.getByRole('heading', { name: 'Process guide' })).toBeVisible();
        await expectNoJunkText(page);
      }
    }
    // LS-only panels
    await expect(page.getByRole('heading', { name: 'Dilution' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Preserve' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CP extras' })).toHaveCount(0);
    await shot(page, testInfo, 'ls.png');
  });

  test('KOH lye for LS is larger than NaOH for CP (molecular weight sanity)', async ({ page }) => {
    const naoh = num(await resultDd(page, /^NaOH/));
    await processTab(page, /Liquid soap/).click();
    const koh = num(await resultDd(page, /^KOH/));
    expect(koh, `KOH ${koh} should exceed NaOH ${naoh} for same oils`).toBeGreaterThan(naoh);
  });

  test('process tablist supports arrow-key navigation', async ({ page }) => {
    await processTab(page, /Cold process/).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'Hot process' })).toHaveAttribute('aria-selected', 'true');
  });
});

// ---------- 3. units ----------

test.describe('weight units', () => {
  test('g→kg→oz→lb→g round trip preserves stored grams', async ({ page }) => {
    for (const u of ['kg', 'oz', 'lb', 'g']) {
      await unitSelect(page).selectOption(u);
      await page.waitForTimeout(100);
      await expectNoJunkText(page);
    }
    const grams = await weightInputs(page).evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value));
    expect(grams).toEqual(['450', '250', '300']);
  });

  test('oz display converts weights and results consistently', async ({ page }) => {
    await unitSelect(page).selectOption('oz');
    const w0 = parseFloat(await weightInputs(page).first().inputValue());
    expect(relClose(w0, 450 / 28.3495, 0.01, 0.05), `olive ${w0} oz vs ${450 / 28.3495}`).toBe(true);
    const oil = num(await resultDd(page, /^Oil weight/));
    expect(relClose(oil, 1000 / 28.3495, 0.01, 0.1), `oil weight ${oil} oz`).toBe(true);
    // internal consistency still holds in oz
    const lye = num(await resultDd(page, /^NaOH/));
    const water = num(await resultDd(page, /^Water$/));
    const batch = num(await resultDd(page, /^Batch weight/));
    expect(relClose(batch, oil + lye + water, 0.02, 0.3)).toBe(true);
  });

  test('total-oil edit rescales lines proportionally', async ({ page }) => {
    await totalOilInput(page).fill('500');
    await totalOilInput(page).blur();
    const grams = (await weightInputs(page).evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value))).map(Number);
    const sum = grams.reduce((a, b) => a + b, 0);
    expect(relClose(sum, 500, 0.01, 1), `line sum ${sum} after total-oil 500`).toBe(true);
    expect(relClose(grams[0], 225, 0.02, 1), `olive ${grams[0]} should be 45% of 500`).toBe(true);
  });
});

// ---------- 4. edge inputs on oils ----------

test.describe('edge inputs', () => {
  test('zero weight on one line survives', async ({ page }) => {
    await weightInputs(page).nth(0).fill('0');
    await weightInputs(page).nth(0).blur();
    await expect(page.locator('.panel--results')).toBeVisible();
    const oil = num(await resultDd(page, /^Oil weight/));
    expect(relClose(oil, 550, 0.02, 1)).toBe(true);
  });

  test('all weights zero shows the empty hint, not junk', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await weightInputs(page).nth(i).fill('0');
      await weightInputs(page).nth(i).blur();
    }
    await expect(page.getByText('Enter oil weights to calculate lye and water.')).toBeVisible();
  });

  test('huge weight (1e9 g) renders finite numbers', async ({ page }) => {
    await weightInputs(page).nth(0).fill('1000000000');
    await weightInputs(page).nth(0).blur();
    const lye = num(await resultDd(page, /^NaOH/));
    expect(Number.isFinite(lye)).toBe(true);
    expect(lye).toBeGreaterThan(0);
  });

  test('negative weight is rejected or clamped, never NaN', async ({ page }) => {
    await weightInputs(page).nth(0).fill('-50');
    await weightInputs(page).nth(0).blur();
    await expect(page.locator('.panel--results')).toBeVisible();
    const v = await weightInputs(page).nth(0).inputValue();
    expect(parseFloat(v)).toBeGreaterThanOrEqual(0);
  });

  test('percent edit >100 does not corrupt state', async ({ page }) => {
    await percentInputs(page).nth(0).fill('150');
    await percentInputs(page).nth(0).blur();
    await expect(page.locator('.panel--results')).toBeVisible();
    const pcts = (await percentInputs(page).evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value))).map(Number);
    const sum = pcts.reduce((a, b) => a + b, 0);
    expect(relClose(sum, 100, 0.01, 0.5), `percent sum ${sum} after 150% commit`).toBe(true);
  });

  test('duplicate oil lines are tolerated', async ({ page }) => {
    await pickOil(page, 1, 'olive');
    await expect(page.locator('.panel--results')).toBeVisible();
    const lye = num(await resultDd(page, /^NaOH/));
    expect(Number.isFinite(lye)).toBe(true);
  });
});

// ---------- 5. settings validation ----------

test.describe('settings validation & recovery', () => {
  test('superfat 200 errors then recovers', async ({ page }) => {
    await page.getByLabel('Superfat %', { exact: true }).fill('200');
    await page.getByLabel('Superfat %', { exact: true }).blur();
    await expect(page.locator('.message-list--error li').first()).toContainText(/Superfat/i);
    await page.getByLabel('Superfat %', { exact: true }).fill('5');
    await page.getByLabel('Superfat %', { exact: true }).blur();
    await expect(page.locator('.message-list--error')).toHaveCount(0);
    await expect(page.locator('.panel--results .results-grid dt').filter({ hasText: /^NaOH/ }).first()).toBeVisible();
  });

  test('lye concentration 0 and 150 both produce input errors', async ({ page }) => {
    await page.getByLabel('Water method').selectOption('lye_concentration');
    const field = page.getByLabel('Lye concentration %', { exact: true });
    await field.fill('0');
    await field.blur();
    await expect(page.locator('.message-list--error li').first()).toContainText(/greater than 0/);
    await field.fill('150');
    await field.blur();
    await expect(page.locator('.message-list--error li').first()).toContainText(/less than 100/);
    await field.fill('33');
    await field.blur();
    await expect(page.locator('.message-list--error')).toHaveCount(0);
    const conc = num(await resultDd(page, /^Lye concentration/));
    expect(relClose(conc, 33, 0.02, 0.2)).toBe(true);
  });

  test('water:lye ratio method drives displayed ratio', async ({ page }) => {
    await page.getByLabel('Water method').selectOption('lye_water_ratio');
    const field = page.getByLabel('Water : lye ratio', { exact: true });
    await field.fill('2.5');
    await field.blur();
    const lye = num(await resultDd(page, /^NaOH/));
    const water = num(await resultDd(page, /^Water$/));
    expect(relClose(water / lye, 2.5, 0.01, 0.02), `water/lye = ${water / lye}`).toBe(true);
  });

  test('NaOH purity 90 increases lye vs 100', async ({ page }) => {
    const lye100 = num(await resultDd(page, /^NaOH/));
    await page.getByLabel('NaOH purity %').fill('90');
    await page.getByLabel('NaOH purity %').blur();
    const lye90 = num(await resultDd(page, /^NaOH/));
    expect(relClose(lye90, lye100 / 0.9, 0.01, 0.5), `lye@90 ${lye90} vs ${lye100 / 0.9}`).toBe(true);
    await page.getByLabel('NaOH purity %').fill('0');
    await page.getByLabel('NaOH purity %').blur();
    await expect(page.locator('.message-list--error li').first()).toContainText(/purity/i);
  });

  test('dual lye blend shows both alkalis summing to total', async ({ page }) => {
    await page.getByLabel('Lye type').selectOption('dual');
    const blend = page.getByLabel('KOH % of alkali (by weight)');
    await blend.fill('30');
    await blend.blur();
    const naoh = num(await resultDd(page, /^NaOH/));
    const koh = num(await resultDd(page, /KOH \(30% by weight\)/));
    const total = num(await resultDd(page, /^Total alkali/));
    expect(relClose(naoh + koh, total, 0.01, 0.3), `naoh ${naoh} + koh ${koh} = ${total}`).toBe(true);
    expect(relClose(koh / (naoh + koh), 0.3, 0.03, 0.01), `KOH share ${koh / (naoh + koh)}`).toBe(true);
    // out-of-range blend
    await blend.fill('60');
    await blend.blur();
    await expect(page.locator('.message-list--error li').first()).toContainText(/KOH blend/i);
  });
});

// ---------- 6. LS specifics ----------

test.describe('liquid soap', () => {
  test.beforeEach(async ({ page }) => {
    await processTab(page, /Liquid soap/).click();
  });

  test('dilution outputs are numeric and warn on absurd target', async ({ page }) => {
    const target = page.getByLabel('Target soap concentration percent');
    await target.fill('25');
    await target.blur();
    await page.getByLabel('Bottle size (ml)').fill('250');
    await page.getByLabel('Bottle size (ml)').blur();
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Dilution' }) });
    for (const label of [/Dilution water to add/, /Paste \(anhydrous\)/, /Finished solution/, /Total water/]) {
      const dd = section.locator('dt').filter({ hasText: label }).first().locator('xpath=following-sibling::dd[1]');
      expect(Number.isFinite(num(await dd.innerText())), `${label} numeric`).toBe(true);
    }
    await target.fill('99');
    await target.blur();
    await expect(section.getByRole('alert')).toContainText(/already more dilute/);
  });

  test('negative superfat triggers Neutralize panel with citric estimate', async ({ page }, testInfo) => {
    await page.getByLabel('Superfat %', { exact: true }).fill('-3');
    await page.getByLabel('Superfat %', { exact: true }).blur();
    await expect(page.getByRole('heading', { name: 'Neutralize' })).toBeVisible();
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Neutralize' }) });
    const citricDd = section.locator('dt').filter({ hasText: /Citric acid/ }).first().locator('xpath=following-sibling::dd[1]');
    const citric = num(await citricDd.innerText());
    // Stoichiometry: excess = KOH × 3/103, active fraction = purity, citric = molOH/3 × 192.124
    const koh = num(await resultDd(page, /^KOH/));
    const purity = parseFloat(await page.getByLabel('KOH purity %').inputValue()) / 100;
    const expected = ((koh * (3 / 103) * purity) / 56.1056 / 3) * 192.124;
    expect(relClose(citric, expected, 0.03, 0.6), `citric ${citric} vs stoichiometric ${expected}`).toBe(true);
    await shot(page, testInfo, 'ls-neutralize.png');
  });

  test('post-cook superfat subtract reserves oil and notes lye reduction', async ({ page }) => {
    await page.getByLabel('Post-cook superfat %').fill('3');
    await page.getByLabel('Post-cook superfat %').blur();
    const picker = page.getByLabel('Post-cook superfat oil');
    await picker.click();
    await picker.fill('jojoba');
    await page.locator('.oil-picker__option').first().click();
    await page.getByLabel('Post-cook superfat method').selectOption('subtract');
    await expect(
      page.locator('.panel--results .results-grid dt').filter({ hasText: /Post-cook superfat/ }).first(),
    ).toBeVisible();
    await expect(page.locator('.panel--results')).toContainText(/reserved, lye reduced/);
  });
});

// ---------- 7. HP specifics ----------

test.describe('hot process', () => {
  test('cook stages and vessel-volume readout', async ({ page }, testInfo) => {
    await processTab(page, /Hot process/).click();
    for (const s of ['trace', 'applesauce', 'expansion', 'mashed potato']) {
      await expect(page.locator('.process-guide__stages')).toContainText(s);
    }
    await page.getByLabel('Cook vessel volume (L)').fill('5');
    await page.getByLabel('Cook vessel volume (L)').blur();
    await expect(page.getByText(/≈\d+(\.\d+)?× batch volume/)).toBeVisible();
    await shot(page, testInfo, 'hp.png');
  });
});

// ---------- 8. additives ----------

test.describe('additives', () => {
  test('sugar at 3% of oil = 30 g on a 1000 g batch', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    const row = page.locator('ul[aria-label="Recipe additives"] li').first();
    await row.getByLabel('Additive type').selectOption({ label: 'Sugar / sorbitol' });
    await row.getByLabel('Amount', { exact: true }).fill('3');
    await row.getByLabel('Dose mode').selectOption({ label: '% of oil' });
    await expect(row.locator('.additive-list__grams')).toHaveText(/^30(\.0)? g$/);
    // batch weight now includes extras
    const batch = num(await resultDd(page, /^Batch weight/));
    const line = await page.getByTestId('batch-weight').innerText();
    expect(line).toMatch(/extras/);
    expect(Number.isFinite(batch)).toBe(true);
  });

  test('ppt mode and over-limit validation', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    const row = page.locator('ul[aria-label="Recipe additives"] li').first();
    await row.getByLabel('Name', { exact: true }).fill('test additive');
    await row.getByLabel('Dose mode').selectOption({ label: 'ppt of oil' });
    await row.getByLabel('Amount', { exact: true }).fill('30');
    await expect(row.locator('.additive-list__grams')).toHaveText(/^30(\.0)? g$/);
    await row.getByLabel('Amount', { exact: true }).fill('2000');
    await expect(row.getByRole('alert')).toContainText(/Max 1000 ppt/);
    await row.getByLabel('Dose mode').selectOption({ label: '% of oil' });
    await row.getByLabel('Amount', { exact: true }).fill('150');
    await expect(row.getByRole('alert')).toContainText(/Max 100%/);
  });

  test('solution dose modes are LS-only; after-cook stage differs per process', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    const row = page.locator('ul[aria-label="Recipe additives"] li').first();
    // CP: no solution modes, no after-cook stage
    await expect(row.getByLabel('Dose mode').locator('option', { hasText: /of solution/ })).toHaveCount(0);
    await expect(row.getByLabel('Add at').locator('option', { hasText: /After (cook|dilution)/ })).toHaveCount(0);
    await processTab(page, /Liquid soap/).click();
    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    const lsRow = page.locator('ul[aria-label="Recipe additives"] li').first();
    await expect(lsRow.getByLabel('Dose mode').locator('option', { hasText: /% of solution/ })).toHaveCount(1);
    await expect(lsRow.getByLabel('Add at').locator('option', { hasText: /After dilution/ })).toHaveCount(1);
    await processTab(page, /Hot process/).click();
    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    const hpRow = page.locator('ul[aria-label="Recipe additives"] li').first();
    await expect(hpRow.getByLabel('Add at').locator('option', { hasText: /After cook/ })).toHaveCount(1);
  });

  test('lather support pack adds rows then disables itself', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Lather support pack' });
    await btn.click();
    const rows = page.locator('ul[aria-label="Recipe additives"] li');
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(btn).toBeDisabled();
  });
});

// ---------- 9. pricing ----------

test.describe('pricing & profit', () => {
  async function fillAllPrices(page: Page, value: string) {
    const inputs = page.locator('input[aria-label^="Price for"]');
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      await inputs.nth(i).fill(value);
      await inputs.nth(i).blur();
    }
  }

  /** Defaults are non-zero (overhead 20%, burden 15% — PRICING_GUIDE), so exact-cost
   * assertions zero them first. */
  async function zeroLabourOverhead(page: Page) {
    await page.locator('summary').filter({ hasText: 'Labour & overhead' }).click();
    await page.getByLabel('Labour minutes').fill('0');
    await page.getByLabel('Overhead mode').selectOption('flat');
    await page.getByLabel('Overhead flat').fill('0');
    await page.getByLabel('Overhead flat').blur();
  }

  test('complete prices produce internally consistent economics', async ({ page }, testInfo) => {
    await fillAllPrices(page, '10');
    await zeroLabourOverhead(page);
    await expect(page.getByTestId('price-incomplete')).toHaveCount(0);

    const costPerKg = num(await pricingDd(page, /^Cost per kg/));
    const costBatch = num(await pricingDd(page, /^Cost per batch/));
    const batchG = num(await resultDd(page, /^Batch weight/));
    expect(relClose(costBatch, costPerKg * (batchG / 1000), 0.02, 0.05),
      `batch cost ${costBatch} vs perKg ${costPerKg} × ${batchG / 1000}kg`).toBe(true);

    // materials-only sanity: oils 1kg ×10 + lye ×10, no water cost
    const lyeG = num(await resultDd(page, /^NaOH/));
    const expectedMaterials = 10 * (1000 / 1000) + 10 * (lyeG / 1000);
    expect(relClose(costBatch, expectedMaterials, 0.03, 0.1),
      `batch cost ${costBatch} vs materials ${expectedMaterials}`).toBe(true);

    // margin lever: 50% margin → price = 2×cost, markup 100%
    await page.getByLabel('Pricing lever').selectOption('margin');
    await page.getByLabel('Target margin percent').fill('50');
    await page.getByLabel('Target margin percent').blur();
    const price = num(await pricingDd(page, /^Suggested price per kg/));
    const profit = num(await pricingDd(page, /^Profit per kg/));
    const margin = num(await pricingDd(page, /^Margin/));
    const markup = num(await pricingDd(page, /^Markup/));
    expect(relClose(price, 2 * costPerKg, 0.02, 0.05), `price ${price} vs 2×${costPerKg}`).toBe(true);
    expect(relClose(profit, costPerKg, 0.02, 0.05)).toBe(true);
    expect(relClose(margin, 50, 0.02, 0.5)).toBe(true);
    expect(relClose(markup, 100, 0.02, 1)).toBe(true);
    await shot(page, testInfo, 'pricing.png');
  });

  test('kg→lb output switch scales per-unit cost by 2.20462', async ({ page }) => {
    await fillAllPrices(page, '10');
    const costPerKg = num(await pricingDd(page, /^Cost per kg/));
    await page.getByLabel('Output unit').selectOption('lb');
    const costPerLb = num(await pricingDd(page, /^Cost per lb/));
    expect(relClose(costPerKg / costPerLb, 2.20462, 0.01, 0.01),
      `kg/lb cost ratio ${costPerKg / costPerLb}`).toBe(true);
  });

  test('margin ≥100 shows em-dash, never Infinity', async ({ page }) => {
    await fillAllPrices(page, '10');
    await page.getByLabel('Pricing lever').selectOption('margin');
    await page.getByLabel('Target margin percent').fill('100');
    await page.getByLabel('Target margin percent').blur();
    const price = await pricingDd(page, /^Suggested price per kg/);
    expect(price).toBe('—');
  });

  test('negative markup formats profit as -$x.xx (sign before symbol)', async ({ page }) => {
    await fillAllPrices(page, '10');
    await page.getByLabel('Pricing lever').selectOption('markup');
    await page.getByLabel('Markup percent').fill('-50');
    await page.getByLabel('Markup percent').blur();
    const profit = await pricingDd(page, /^Profit per kg/);
    expect(profit).toMatch(/^-\$\d/);
    expect(profit).not.toMatch(/\$-/);
  });

  test('negative and garbage prices are treated as missing, not crashes', async ({ page }) => {
    const first = page.locator('input[aria-label^="Price for"]').first();
    await first.fill('-5');
    await first.blur();
    await expect(page.getByTestId('price-incomplete')).toBeVisible();
    await first.fill('abc');
    await first.blur();
    await expect(page.getByTestId('price-incomplete')).toBeVisible();
    await expect(page.locator('.pricing-results')).toContainText('—');
  });

  test('labour and flat overhead increase batch cost by exact amounts', async ({ page }) => {
    await fillAllPrices(page, '10');
    await zeroLabourOverhead(page);
    const base = num(await pricingDd(page, /^Cost per batch/));
    await page.getByLabel('Labour minutes').fill('60');
    await page.getByLabel('Labour rate per hour').fill('30');
    await page.getByLabel('Labour burden percent').fill('20');
    await page.getByLabel('Labour burden percent').blur();
    const withLabour = num(await pricingDd(page, /^Cost per batch/));
    expect(relClose(withLabour - base, 36, 0.02, 0.05), `labour delta ${withLabour - base} vs 36`).toBe(true);
    await page.getByLabel('Overhead mode').selectOption('flat');
    await page.getByLabel('Overhead flat').fill('10');
    await page.getByLabel('Overhead flat').blur();
    const withOverhead = num(await pricingDd(page, /^Cost per batch/));
    expect(relClose(withOverhead - withLabour, 10, 0.02, 0.05)).toBe(true);
  });

  test('packaging cost is per output unit of batch weight', async ({ page }) => {
    await fillAllPrices(page, '0');
    const base = num(await pricingDd(page, /^Cost per batch/));
    await page.getByLabel('Packaging cost').fill('1');
    await page.getByLabel('Packaging cost').blur();
    const withPack = num(await pricingDd(page, /^Cost per batch/));
    const batchG = num(await resultDd(page, /^Batch weight/));
    expect(relClose(withPack - base, batchG / 1000, 0.02, 0.05),
      `packaging delta ${withPack - base} vs ${batchG / 1000}`).toBe(true);
  });
});

// ---------- 10. advanced: split liquid & batch sizer ----------

test.describe('advanced settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('summary').filter({ hasText: 'Advanced' }).click();
  });

  test('split liquid adds a named liquid and total-liquid row', async ({ page }) => {
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Split liquid' }) }).first();
    await section.getByText('Enable').click();
    await section.getByPlaceholder(/goat milk/).fill('goat milk');
    await section.getByLabel(/% of oil weight/).fill('20');
    await section.getByLabel(/% of oil weight/).blur();
    await expect(
      page.locator('.panel--results .results-grid dt').filter({ hasText: /Total liquid/ }).first(),
    ).toBeVisible();
    await expect(page.locator('.panel--results')).toContainText(/goat milk/i);
    const totalLiquid = num(await resultDd(page, /^Total liquid/));
    const water = num(await resultDd(page, /^Water$/));
    expect(relClose(totalLiquid, water + 200, 0.02, 2), `total liquid ${totalLiquid} vs water ${water} + 200`).toBe(true);
  });

  test('batch sizer bar mode suggests and applies oil weight', async ({ page }) => {
    await page.getByText('Bar count', { exact: true }).click();
    await page.getByLabel(/Number of bars/).fill('10');
    await page.getByLabel(/Finished bar weight/).fill('100');
    await page.getByLabel(/Shrinkage \/ waste %/).fill('5');
    await page.getByLabel(/Shrinkage \/ waste %/).blur();
    await expect(page.getByText(/Suggested oil weight/)).toBeVisible();
    await page.getByRole('button', { name: 'Apply to batch' }).click();
    const total = parseFloat(await totalOilInput(page).inputValue());
    expect(total).toBeGreaterThan(500);
    expect(total).toBeLessThan(1100);
  });

  test('batch sizer mold mode with zero dimensions shows no apply', async ({ page }) => {
    await page.getByText('Mold volume', { exact: true }).click();
    for (const l of [/Length/, /Width/, /Height/]) {
      await page.getByLabel(l).fill('0');
      await page.getByLabel(l).blur();
    }
    await expect(page.getByRole('button', { name: 'Apply to batch' })).toHaveCount(0);
  });
});

// ---------- 11. persistence, export/import, misc ----------

test.describe('persistence & files', () => {
  test('per-process drafts survive tab switches and reload', async ({ page }) => {
    await weightInputs(page).nth(0).fill('400');
    await weightInputs(page).nth(0).blur();
    await processTab(page, /Hot process/).click();
    await weightInputs(page).nth(0).fill('111');
    await weightInputs(page).nth(0).blur();
    await processTab(page, /Cold process/).click();
    await expect(weightInputs(page).nth(0)).toHaveValue('400');
    await processTab(page, /Hot process/).click();
    await page.waitForTimeout(700); // autosave debounce
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Hot process' })).toHaveAttribute('aria-selected', 'true');
    await expect(weightInputs(page).nth(0)).toHaveValue('111');
  });

  test('export → new → import round-trips the recipe', async ({ page }, testInfo) => {
    await weightInputs(page).nth(0).fill('414');
    await weightInputs(page).nth(0).blur();
    await page.getByPlaceholder('Recipe name').fill('roundtrip test');
    await page.getByPlaceholder('Recipe name').blur();
    const dlPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    const dl = await dlPromise;
    const path = testInfo.outputPath('roundtrip.json');
    await dl.saveAs(path);
    await page.getByRole('button', { name: 'New' }).click();
    await expect(page.getByPlaceholder('Recipe name')).toHaveValue(/New recipe/);
    await page.locator('input[type="file"]').setInputFiles(path);
    await expect(page.getByPlaceholder('Recipe name')).toHaveValue(/roundtrip test/);
    await expect(weightInputs(page).nth(0)).toHaveValue('414');
  });

  test('malformed import surfaces a readable error', async ({ page }, testInfo) => {
    const bad = testInfo.outputPath('bad.json');
    const fs = await import('node:fs');
    fs.writeFileSync(bad, '{not json');
    await page.locator('input[type="file"]').setInputFiles(bad);
    await expect(page.getByRole('status').filter({ hasText: /Invalid JSON|Could not read/ })).toBeVisible();
  });

  test('tar oil can be excluded from lye math', async ({ page }) => {
    await pickOil(page, 2, 'birch tar');
    const tarSelect = page.locator('select:has(option[value="additive"])').first();
    await expect(tarSelect).toBeVisible();
    const lyeBefore = num(await resultDd(page, /^NaOH/));
    await tarSelect.selectOption('additive');
    await expect(page.locator('.panel--results')).toContainText(/excluded from lye/);
    const lyeAfter = num(await resultDd(page, /^NaOH/));
    expect(lyeAfter, `lye ${lyeAfter} should drop when tar excluded (was ${lyeBefore})`).toBeLessThan(lyeBefore);
  });

  test('beeswax-heavy recipe degrades gracefully in properties', async ({ page }) => {
    await pickOil(page, 0, 'beeswax');
    await pickOil(page, 1, 'beeswax');
    await pickOil(page, 2, 'beeswax');
    await expect(page.locator('.panel--results')).toBeVisible();
    // No FA data → property scores hidden behind the guidance hint, no junk values
    const props = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Bar properties' }) }).first();
    await expect(props).toContainText('Add triglyceride oils with fatty-acid data');
  });
});
