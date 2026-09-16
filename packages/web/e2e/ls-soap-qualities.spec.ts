import { test, expect, type Page } from '@playwright/test';

/**
 * Liquid soap's panel 08 in the real app: the four liquid-soap qualities as meters, in place of the
 * bar panel's six scores, iodine, INS and view switch. Unit tests render the panel with its data
 * passed in; this checks the app actually passes it, and that a Radar choice made under cold
 * process does not follow the recipe into liquid soap (the panel keeps that choice in state).
 */

const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

const panel08 = (page: Page) =>
  page.locator('section.panel').filter({ has: page.getByRole('heading', { name: /^(Soap|Bar) properties$/ }) }).first();

const meterNames = (page: Page) =>
  panel08(page)
    .getByRole('meter')
    .evaluateAll((meters) => meters.map((m) => (m.getAttribute('aria-label') ?? '').split(':')[0]));

test('liquid soap shows its four qualities, even after the radar was chosen under cold process', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Cold process first, with the radar chosen.
  await expect(panel08(page).getByRole('heading', { name: /Bar properties/ })).toBeVisible();
  await panel08(page).getByRole('tablist', { name: 'Property display' }).getByRole('tab', { name: 'Radar' }).click();
  await expect(panel08(page).locator('.property-radar')).toBeVisible();

  await processTab(page, /Liquid soap/).click();
  await expect(panel08(page).getByRole('heading', { name: /Soap properties/ })).toBeVisible();
  expect(await meterNames(page)).toEqual(['Body & lather stability', 'Cleansing', 'Conditioning', 'Lather']);
  await expect(panel08(page).locator('.property-radar')).toHaveCount(0);
  await expect(panel08(page).getByRole('tablist')).toHaveCount(0);
  await expect(panel08(page).locator('dl[aria-label="Recipe iodine and INS"]')).toHaveCount(0);
  await expect(panel08(page)).not.toContainText(/Hardness|Longevity|Iodine|Too high|Too low|Suggested/);

  // Back to cold process: the six bar scores return.
  await processTab(page, /Cold process/).click();
  await expect(panel08(page).getByRole('heading', { name: /Bar properties/ })).toBeVisible();
  await expect(panel08(page).getByRole('tablist', { name: 'Property display' })).toBeVisible();
});
