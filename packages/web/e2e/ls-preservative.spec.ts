import { test, expect, type Page } from '@playwright/test';

/**
 * Browser guard for the Preservative snippet below the Dilution panel (LS only):
 * collapsed by default, opens on click, and computes grams from the finished diluted
 * mass at the selected preservative's default dose.
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

  // The ceiling is hard: typing past it raises the named clamp message and the figure
  // stays at the 1% EU maximum.
  await dose.fill('2');
  await expect(page.getByRole('alert').filter({ hasText: 'EU legal maximum' })).toBeVisible();
  expect(await gramsOf('Preservative to add')).toBeCloseTo(doseGrams, 1);
});
