import { test, expect, type Page } from '@playwright/test';

/**
 * Browser guard for the Preservative snippet below the Dilution panel (LS only):
 * collapsed by default, opens on click, and computes grams from the finished diluted
 * mass at the selected preservative's default dose. The picker is a <select> menu
 * (`Which preservative`) whose first option is Custom…; choosing it clears the dose
 * and reveals a Name field. A dose past a preservative's ceiling raises a named
 * warning naming the EU as the authority, but is not clamped — the figure keeps
 * following whatever dose the maker typed.
 */

const weightInputs = (page: Page) => page.locator('input[aria-label^="Weight in"]');

async function freshLsRecipe(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('tab', { name: /Liquid soap/ }).click();
  await weightInputs(page).nth(0).fill('300');
  await weightInputs(page).nth(0).blur();
}

test('collapsed by default, opens, and computes the dose from the finished diluted mass', async ({ page }) => {
  await freshLsRecipe(page);

  const snippet = page.locator('details.preservative');
  await expect(snippet).toBeVisible();
  // Collapsed: the title line is on screen, the calculator behind it is not.
  await expect(page.getByRole('heading', { name: 'Preservative' })).toBeVisible();
  await expect(snippet).not.toHaveAttribute('open', /.*/);
  await expect(page.getByText('Preservative to add')).toBeHidden();

  await snippet.locator('summary').click();
  await expect(snippet).toHaveAttribute('open', /.*/);

  // The anchor choice is pre-selected with its default dose seeded.
  await expect(page.getByLabel('Which preservative')).toHaveValue('suttocide-a');
  const dose = page.getByLabel('Dose (% of finished product)');
  await expect(dose).toHaveValue('1');

  // Computes: grams = finished diluted mass × dose%. Read the snippet's own
  // ≈ Finished product row and check the arithmetic against the primary figure.
  const gramsOf = async (label: string) => {
    const dd = snippet
      .locator('.results-grid__item')
      .filter({ hasText: label })
      .locator('dd');
    return Number((await dd.innerText()).replace(/[^\d.]/g, ''));
  };
  const finished = await gramsOf('≈ Finished product');
  const doseGrams = await gramsOf('Preservative to add');
  expect(finished).toBeGreaterThan(0);
  // Both figures are formatWeight-rounded (whole grams at this scale), so allow the
  // half-gram each rounding can contribute.
  expect(Math.abs(doseGrams - finished * 0.01)).toBeLessThanOrEqual(0.6);

  // THE CEILING IS A WARNING, NOT A CLAMP — the inverse of what this spec asserted before
  // 2026-08-09, and deliberately so. The alert still names the EU as the authority, but the
  // figure follows the dose the maker typed. Do not "restore" the old assertion.
  await dose.fill('2');
  await expect(page.getByRole('alert').filter({ hasText: 'EU legal maximum' })).toBeVisible();
  // Both readings are independently formatWeight-rounded to the whole gram (same rounding
  // the ≤0.6 g allowance above accounts for), so doubling doseGrams and comparing it to a
  // second, separately rounded reading can drift by close to a gram even though the
  // underlying (finishedGrams × pct / 100) maths is exact — hence the wide tolerance rather
  // than a tight toBeCloseTo. Derivation: this reading's own rounding contributes up to 0.5 g,
  // and doubling the earlier reading doubles ITS up-to-0.5 g rounding error too — 0.5 (this
  // reading) + 2 × 0.5 (the doubled earlier reading) = 1.5.
  expect(Math.abs((await gramsOf('Preservative to add')) - doseGrams * 2)).toBeLessThanOrEqual(1.5);

  // Custom… clears the dose and offers a name field. Exact match: getByLabel is a
  // case-insensitive substring match by default, and the toolbar's own "Recipe name"
  // field elsewhere on the page also contains "name".
  await page.getByLabel('Which preservative').selectOption('');
  await expect(dose).toHaveValue('');
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
});
