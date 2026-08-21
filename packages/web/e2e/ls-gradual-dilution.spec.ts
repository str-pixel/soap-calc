import { test, expect, type Page } from '@playwright/test';

/**
 * Browser guard for the DILUTION RECORD (LS only) — the reference's own first method
 * (LS:1531): add water in increments until the consistency is right, so the finished mass
 * cannot be predicted, only recorded.
 *
 * What this proves that the unit tests cannot: the whole chain is really connected in a
 * running browser. Recording water makes the record govern, every batch figure follows it,
 * and the preservative dose — which is a % of the finished mass — follows with them. Every
 * link in that chain is mocked or stubbed somewhere in the jsdom suite.
 *
 * The scripts below used to open with a click on the "Gradual" mode radio, because the water
 * field was only on screen in that mode. There is no mode and no radio (spec §2): the field
 * is part of the whole-batch surface, so the record is typed straight in. The claims are
 * unchanged — with one addition each, since the chain's middle link changed: what the record
 * reaches is no longer the saved TARGET (nothing writes it now) but the figures themselves.
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

/** Reads a figure out of a results grid by its label, as the preservative spec does. */
async function gramsOf(scope: ReturnType<Page['locator']>, label: string) {
  const dd = scope.locator('.results-grid__item').filter({ hasText: label }).locator('dd');
  return Number((await dd.innerText()).replace(/[^\d.]/g, ''));
}

test('the dose follows the water you recorded, not the target you left behind', async ({
  page,
}) => {
  await freshLsRecipe(page);

  const snippet = page.locator('details.preservative');
  await snippet.locator('summary').click();
  const doseAtTarget = await gramsOf(snippet, 'Preservative to add');
  expect(doseAtTarget).toBeGreaterThan(0);

  const plan = page.getByLabel('Target soap concentration percent');
  const plannedTarget = await plan.inputValue();

  // Record markedly LESS water than the 30% plan assumes.
  const water = page.getByLabel('Water added so far (g)', { exact: true });
  await water.fill('500');
  await water.blur();

  // The panel states what is in the pot, from the raw inputs — and the plan's own rows stay
  // on screen beside it, carrying the word "plan" (spec §2).
  await expect(page.getByText(/Finished so far/)).toBeVisible();
  await expect(page.getByText('Dilution water to add (plan)')).toBeVisible();
  // And nothing wrote the plan: decision 2's "no write-back, ever", in a real browser.
  expect(await plan.inputValue()).toBe(plannedTarget);

  // And the dose follows it DOWN — a smaller bottle needs less preservative. This is the
  // link that matters: it can only hold if the recorded water reached the dose basis.
  const doseAfter = await gramsOf(snippet, 'Preservative to add');
  expect(doseAfter).toBeLessThan(doseAtTarget);

  // The dose is still 1% of the finished-product row it sits beside. Both figures are
  // whole-gram rounded, so allow 0.5 + 2 × 0.5 = 1.5 g of combined rounding drift — the
  // same derivation the preservative spec documents for the same reason.
  const finished = await gramsOf(snippet, '≈ Finished product');
  expect(Math.abs(doseAfter - finished * 0.01)).toBeLessThanOrEqual(1.5);
});

test('the recorded water survives a reload, because it is part of the recipe', async ({
  page,
}) => {
  await freshLsRecipe(page);
  const water = page.getByLabel('Water added so far (g)', { exact: true });
  await water.fill('1500');
  await water.blur();

  await page.reload();
  // No mode to restore: the field is on screen in every state, so the record appears the
  // moment its recipe does — which is the sixty-line restore effect's whole job, done by the
  // surface instead.
  await expect(page.getByLabel('Water added so far (g)', { exact: true })).toHaveValue('1500');
  await expect(page.getByText(/Finished so far/)).toBeVisible();
});
