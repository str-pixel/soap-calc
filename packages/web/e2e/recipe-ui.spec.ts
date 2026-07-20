import { test, expect, type Page } from '@playwright/test';

/**
 * Regression coverage for UI-interaction fixes that have no unit-test surface
 * (the app has no React test-render harness). Each test asserts a behaviour
 * that was broken before its fix and would silently corrupt recipe state.
 */

const weightInputs = (page: Page) => page.locator('input[aria-label^="Weight in"]');
const unitSelect = (page: Page) => page.locator('select:has(option[value="lb"])').first();
const oilPickers = (page: Page) => page.locator('.oil-picker__input');
const undoBtn = (page: Page) => page.getByRole('button', { name: 'Undo' });
const redoBtn = (page: Page) => page.getByRole('button', { name: 'Redo' });
const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

test.describe('recipe oils undo/redo', () => {
  test('undo reverts the last committed weight edit (the #5 steal scenario)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const w = weightInputs(page);
    const before = await w.nth(0).inputValue();

    await w.nth(0).fill('300');
    await w.nth(0).blur();
    await expect(w.nth(0)).toHaveValue('300');

    await undoBtn(page).click();
    await expect(w.nth(0)).toHaveValue(before);
  });

  test('redo re-applies an undone edit', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const w = weightInputs(page);
    await w.nth(0).fill('321');
    await w.nth(0).blur();
    await undoBtn(page).click();
    await expect(w.nth(0)).not.toHaveValue('321');

    await redoBtn(page).click();
    await expect(w.nth(0)).toHaveValue('321');
  });

  test('undo is disabled with no history and after undoing everything', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(undoBtn(page)).toBeDisabled();

    const w = weightInputs(page);
    await w.nth(0).fill('250');
    await w.nth(0).blur();
    await expect(undoBtn(page)).toBeEnabled();

    await undoBtn(page).click();
    await expect(undoBtn(page)).toBeDisabled();
  });

  test('clicking Undo mid-type reverts the last committed edit, not the in-progress draft', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const w = weightInputs(page);
    await w.nth(0).fill('400'); // committed edit #1
    await w.nth(0).blur();

    // Start typing a second edit but do NOT blur; click Undo instead.
    await w.nth(0).focus();
    await w.nth(0).fill('999'); // uncommitted draft
    await undoBtn(page).click();

    // The draft is discarded and edit #1 is reverted — not committed-then-undone.
    await expect(w.nth(0)).not.toHaveValue('999');
    await expect(w.nth(0)).not.toHaveValue('400');
  });

  test('Cmd/Ctrl+Z inside a weight field does not fire recipe undo', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const w = weightInputs(page);
    await w.nth(0).fill('275');
    await w.nth(0).blur();
    // One committed edit → recipe history has one entry.
    await expect(undoBtn(page)).toBeEnabled();

    // Focus a weight field and press the shortcut: our handler must YIELD to the input.
    // We assert the RECIPE MODEL is untouched (history still has its entry, so recipe undo
    // did NOT fire) rather than the input's live value — native text undo on a controlled
    // input is browser-dependent and not what this guards.
    await w.nth(1).focus();
    await w.nth(1).press('ControlOrMeta+z');
    await expect(undoBtn(page)).toBeEnabled();
  });

  test('switching process resets undo history (generation gate)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const w = weightInputs(page);
    await w.nth(0).fill('333');
    await w.nth(0).blur();
    await expect(undoBtn(page)).toBeEnabled();

    await processTab(page, /Hot process/i).click();
    await expect(undoBtn(page)).toBeDisabled();
  });

  test('oil-swap undo round-trips (the routed updateLine path)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const before = await oilPickers(page).nth(1).inputValue(); // coconut
    await oilPickers(page).nth(1).click();
    await oilPickers(page).nth(1).fill('beeswax');
    await page.locator('.oil-picker__option').first().click();
    await expect(oilPickers(page).nth(1)).toHaveValue(/beeswax/i);

    await undoBtn(page).click();
    await expect(oilPickers(page).nth(1)).toHaveValue(before);
  });

  test('add-line then undo removes the added line', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const w = weightInputs(page);
    const n0 = await w.count();
    await page.getByRole('button', { name: '+ Add oil' }).click();
    expect(await w.count()).toBe(n0 + 1);

    await undoBtn(page).click();
    expect(await w.count()).toBe(n0);
  });

  test('remove-line then undo restores the line', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const w = weightInputs(page);
    const n0 = await w.count();
    await page.getByRole('button', { name: /^Remove / }).first().click();
    expect(await w.count()).toBe(n0 - 1);

    await undoBtn(page).click();
    expect(await w.count()).toBe(n0);
  });

  test('a new edit after undo clears the redo stack', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const w = weightInputs(page);
    await w.nth(0).fill('310');
    await w.nth(0).blur();
    await undoBtn(page).click();
    await expect(redoBtn(page)).toBeEnabled();

    // A fresh committed edit must invalidate the redo future.
    await w.nth(1).fill('260');
    await w.nth(1).blur();
    await expect(redoBtn(page)).toBeDisabled();
  });
});

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
    // Coverage is weighted by fatty-acid completeness, not mere presence: olive (~98%) +
    // shea (~99%) of a 1000 g batch ≈ 74% (< 80%), triggering the estimate guard.
    const picker2 = oilPickers(page).nth(1);
    await picker2.click();
    await picker2.fill('beeswax');
    await page.locator('.oil-picker__option').first().click();
    // Caption switches from "Based on" to "Estimated from"
    await expect(page.locator('.properties-coverage').first()).toContainText(/Estimated from 74% of recipe oils/i);
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
