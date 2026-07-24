import { test, expect, type Page } from '@playwright/test';

/**
 * Browser guard for the Total batch entry field: committing a target rescales the oils
 * (ratio back-solve), and a blur without an edit changes nothing.
 */

const weightInputs = (page: Page) => page.locator('input[aria-label^="Weight in"]');
const batchField = (page: Page) => page.getByLabel(/Total batch in g/);

async function freshRecipe(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await weightInputs(page).nth(0).fill('300');
  await weightInputs(page).nth(0).blur();
}

test('committing a Total batch target rescales the oils to hit it', async ({ page }) => {
  await freshRecipe(page);
  const firstOilBefore = Number(await weightInputs(page).nth(0).inputValue());
  const oilTotal = page.getByLabel(/Total oil \(g\)/);
  const oilBefore = Number(await oilTotal.inputValue());

  await batchField(page).fill('1500');
  await batchField(page).blur();

  // Results' own batch line shows ~the target (whole-gram rounding ⇒ within a few grams).
  await expect(page.getByTestId('batch-weight')).toContainText(/1,49\d|1,50\d/);
  // Oils scaled up proportionally.
  const firstOilAfter = Number(await weightInputs(page).nth(0).inputValue());
  expect(firstOilAfter).toBeGreaterThan(firstOilBefore);
  const oilAfter = Number(await oilTotal.inputValue());
  expect(oilAfter).toBeGreaterThan(oilBefore);
});

test('pressing Enter commits the target — no click-away needed', async ({ page }) => {
  await freshRecipe(page);
  const oilTotal = page.getByLabel(/Total oil \(g\)/);
  const oilBefore = Number(await oilTotal.inputValue());

  await batchField(page).fill('1500');
  await batchField(page).press('Enter'); // commit via Enter, focus stays in the field

  await expect(page.getByTestId('batch-weight')).toContainText(/1,49\d|1,50\d/);
  expect(Number(await oilTotal.inputValue())).toBeGreaterThan(oilBefore);
});

test('blur without an edit never rescales', async ({ page }) => {
  await freshRecipe(page);
  const before = await weightInputs(page).nth(0).inputValue();
  await batchField(page).focus();
  await batchField(page).blur();
  await expect(weightInputs(page).nth(0)).toHaveValue(before);
});
