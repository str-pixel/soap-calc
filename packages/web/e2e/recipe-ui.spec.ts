import { test, expect, type Page } from '@playwright/test';

/**
 * Regression coverage for UI-interaction fixes that have no unit-test surface
 * (the app has no React test-render harness). Each test asserts a behaviour
 * that was broken before its fix and would silently corrupt recipe state.
 */

const weightInputs = (page: Page) => page.locator('input[aria-label^="Weight in"]');
const unitSelect = (page: Page) => page.locator('select:has(option[value="lb"])').first();
const oilPickers = (page: Page) => page.locator('.oil-picker__input');

test.describe('recipe UI regressions', () => {
  test('no-op focus/blur in oz does not drift stored gram weights', async ({ page }) => {
    await page.goto('/');
    await unitSelect(page).selectOption('oz');
    // focus a weight field and move focus away WITHOUT typing
    await weightInputs(page).first().focus();
    await weightInputs(page).nth(1).focus();
    // read the underlying grams by switching the display back to grams
    await unitSelect(page).selectOption('g');
    const grams = await weightInputs(page).evaluateAll((els) =>
      (els as HTMLInputElement[]).map((e) => e.value),
    );
    expect(grams).toEqual(['450', '250', '300']);
  });

  test('OilPicker: focus + Enter keeps the current oil', async ({ page }) => {
    await page.goto('/');
    const picker = oilPickers(page).first();
    const before = await picker.inputValue();
    expect(before).not.toMatch(/Abyssinian/i);
    await picker.focus();
    await picker.press('Enter');
    await expect(picker).toHaveValue(before);
  });

  test('OilPicker: type then clear + Enter keeps the current oil', async ({ page }) => {
    await page.goto('/');
    const picker = oilPickers(page).nth(1);
    const before = await picker.inputValue();
    await picker.focus();
    await picker.pressSequentially('zz');
    await picker.fill(''); // query back to empty
    await picker.press('Enter');
    await expect(picker).toHaveValue(before);
  });

  test('OilPicker: clicking an option selects it', async ({ page }) => {
    await page.goto('/');
    const picker = oilPickers(page).first();
    await picker.click();
    await picker.fill('coconut');
    await page.locator('.oil-picker__option').first().click();
    await expect(picker).toHaveValue(/coconut/i);
  });

  test('OilPicker: focusing an outside field closes the dropdown', async ({ page }) => {
    await page.goto('/');
    await oilPickers(page).nth(2).focus();
    await expect(page.locator('.oil-picker__list')).toHaveCount(1);
    await weightInputs(page).first().focus();
    await expect(page.locator('.oil-picker__list')).toHaveCount(0);
  });

  test('property panel marks low-coverage recipes as estimated, no false out-of-range flag', async ({ page }) => {
    await page.goto('/');
    // Swap the 2nd starter oil (coconut) for beeswax, which has no fatty-acid data.
    // Property coverage drops to olive+shea = 75% (< 80%), triggering the estimate guard.
    const picker2 = oilPickers(page).nth(1);
    await picker2.click();
    await picker2.fill('beeswax');
    await page.locator('.oil-picker__option').first().click();
    // Caption switches from "Based on" to "Estimated from"
    await expect(page.locator('.properties-coverage').first()).toContainText(/Estimated from 75% of recipe oils/i);
    // Values are marked approximate and the red out-of-range flag is suppressed
    await expect(page.locator('.property-bars__value').first()).toContainText('~');
    await expect(page.locator('.property-bars__value--outside')).toHaveCount(0);
  });

  test('autosave persists the committed weight, not a mid-typed value', async ({ page }) => {
    await page.goto('/');
    const committed = await weightInputs(page).first().inputValue();
    await weightInputs(page).first().focus();
    await weightInputs(page).first().fill('3'); // intermediate draft, never blurred/committed
    await page.waitForTimeout(750); // > 500ms autosave debounce
    await page.reload();
    await expect(weightInputs(page).first()).toHaveValue(committed);
  });
});
