import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

/**
 * A LOOK AT THE COLORANTS PANEL in each of the three processes, plus everything the
 * browser itself can complain about. The panel derives almost everything it shows from the
 * process — the stage a colour is filed at, how it is dispersed, whether the batter can be
 * split, whether a dose band is offered at all — and none of that is judgeable from a unit
 * test rendering one component in isolation.
 *
 * Screenshots land in e2e/__screens__/ (gitignored) for a human to look at; the console,
 * pageerror, failed-request and junk-text checks are what runs unattended.
 */

const SHOTS = 'e2e/__screens__';

function watchForErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    problems.push(`requestfailed: ${r.url()} — ${r.failure()?.errorText ?? 'unknown'}`);
  });
  return problems;
}

/** Figures that leaked out of a calculation are invisible in a DOM assertion and obvious
 * on screen. "undefined" is deliberately included: a missing catalog field prints it. */
async function expectNoJunk(page: Page) {
  const body = await page.locator('body').innerText();
  for (const junk of ['NaN', 'Infinity', '[object Object]', 'undefined', 'null%']) {
    expect(body, `visible text must not contain "${junk}"`).not.toContain(junk);
  }
}

const panel = (page: Page) =>
  page.locator('.panel', { has: page.locator('h2.panel__title', { hasText: /^07Colorants$/ }) });
const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const notesPanel = (page: Page) =>
  page.locator('.panel', { has: page.locator('h2.panel__title', { hasText: 'Formulation notes' }) });

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test.describe('colorants, seen in each process', () => {
  test('cold process: a whole-batter colour, then a split batter coloured at trace', async ({ page }) => {
    const problems = watchForErrors(page);
    await fresh(page);

    await page.getByRole('button', { name: /add colorant/i }).click();
    await page.getByLabel(/Colorant for/).selectOption('activated-charcoal');

    // Picking seeds the gentlest sourced dose rather than leaving a range nobody can act on.
    await expect(page.getByLabel(/Activated charcoal dose/)).toHaveValue('0.11');
    // A whole-batter colour goes in with the oils, dispersed in a carrier oil.
    await expect(panel(page)).toContainText(/With oils/i);
    await expect(panel(page)).toContainText(/Mix 1:1 with a light carrier oil/);
    // The ladder is in the unit the field takes.
    await expect(panel(page)).toContainText(/0\.1% light grey/);
    await expect(panel(page)).toContainText(/Holds its colour/);
    // No portion control until there is a portion to pick.
    await expect(panel(page).getByLabel(/portion$/i)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/colorants-cp-whole.png`, fullPage: true });

    await page.getByRole('button', { name: /split the batter/i }).click();
    await page.getByLabel('Portion name').fill('Swirl');
    await page.getByLabel(/Portion Swirl share/).fill('40');
    await page.getByLabel(/Activated charcoal portion/).selectOption({ label: 'Swirl' });
    // A portion colour moves to trace, and its dose is now against the portion's oils.
    await expect(panel(page)).toContainText(/At trace/i);
    await expect(panel(page)).toContainText(/Portions total 40/);
    await page.screenshot({ path: `${SHOTS}/colorants-cp-portion.png`, fullPage: true });

    await expectNoJunk(page);
    expect(problems, 'browser reported nothing').toEqual([]);
  });

  test('hot process: the whole batch into the oils, a portion in sugar water after the cook', async ({ page }) => {
    const problems = watchForErrors(page);
    await fresh(page);
    await processTab(page, /Hot process/).click();

    await page.getByRole('button', { name: /add colorant/i }).click();
    await page.getByLabel(/Colorant for/).selectOption('french-green-clay');
    await expect(panel(page)).toContainText(/With oils/i);
    // HP sends a single colour straight in, with no slurry — CP would disperse it in oil.
    await expect(panel(page)).toContainText(/Stir straight into the warmed oils/);
    await expect(panel(page)).not.toContainText(/Mix 1:1 with a light carrier oil/);
    // The solvent copy names the alternatives the source offers rather than one rule.
    await expect(panel(page)).toContainText(/post-cook superfat/i);
    await page.screenshot({ path: `${SHOTS}/colorants-hp-whole.png`, fullPage: true });

    await page.getByRole('button', { name: /split the batter/i }).click();
    await page.getByLabel('Portion name').fill('Top');
    await page.getByLabel(/Portion Top share/).fill('30');
    await page.getByLabel(/French green clay portion/).selectOption({ label: 'Top' });
    // A portion colour waits for the cook, and gets the sugar-water dispersal.
    await expect(panel(page)).toContainText(/After cook/i);
    await expect(panel(page)).toContainText(/hot water and a pinch of sugar/);
    await page.screenshot({ path: `${SHOTS}/colorants-hp-portion.png`, fullPage: true });

    await expectNoJunk(page);
    expect(problems, 'browser reported nothing').toEqual([]);
  });

  test('liquid soap: after the dilution, no batter to split, and no band the sources do not give', async ({ page }) => {
    const problems = watchForErrors(page);
    await fresh(page);
    await processTab(page, /Liquid soap/).click();

    await page.getByRole('button', { name: /add colorant/i }).click();
    // A new liquid-soap row seeds a water-soluble dye, which is what a bottle tolerates.
    await expect(panel(page).getByRole('radiogroup', { name: /^Kind of/ })).toContainText('Dye');
    await expect(panel(page)).toContainText(/After dilution/i);
    await expect(panel(page)).toContainText(/Stir straight into the diluted soap/);
    // No temperature is prescribed, because no source gives one.
    await expect(panel(page)).not.toContainText(/warm water/i);
    // A bottle has no batter to divide.
    await expect(page.getByRole('button', { name: /split the batter/i })).toHaveCount(0);
    // And no dose band is offered: every colorant rate in the app comes from a bar source.
    await expect(panel(page)).not.toContainText(/tsp per/);
    await expect(panel(page)).toContainText(/sink to the bottom of the bottle/);
    await page.screenshot({ path: `${SHOTS}/colorants-ls.png`, fullPage: true });

    await expectNoJunk(page);
    expect(problems, 'browser reported nothing').toEqual([]);
  });

  test('an overdose is caught, and the figure the panel prints is never called one', async ({ page }) => {
    const problems = watchForErrors(page);
    await fresh(page);

    await page.getByRole('button', { name: /add colorant/i }).click();
    await page.getByLabel(/Colorant for/).selectOption('kaolin-clay');
    const dose = page.getByLabel(/Kaolin clay dose/);

    // The ceiling the panel prints must never itself be flagged.
    await dose.fill('0.9');
    await expect(notesPanel(page)).not.toContainText(/Past the rate its source gives/);
    // Past it, the maker is told, with both figures.
    await dose.fill('5');
    const insights = notesPanel(page);
    await expect(insights).toContainText(/Past the rate its source gives/);
    await expect(insights).toContainText(/Kaolin clay at 5\.00% against 0\.90%/);
    await page.screenshot({ path: `${SHOTS}/colorants-overdose.png`, fullPage: true });

    await expectNoJunk(page);
    expect(problems, 'browser reported nothing').toEqual([]);
  });

  test('the lye route: offered where a source puts the colour in the lye, cold process only', async ({ page }) => {
    const problems = watchForErrors(page);
    await fresh(page);

    await page.getByRole('button', { name: /add colorant/i }).click();
    // A mica has no lye route in any source, so its stage stays a statement.
    await page.getByLabel(/Colorant for/).selectOption('mica');
    await expect(panel(page).getByRole('radiogroup', { name: /^Add at for/ })).toHaveCount(0);

    // Madder root does, and gets the choice.
    await page.getByLabel(/Colorant for/).selectOption('madder-root');
    const addAt = panel(page).getByRole('radiogroup', { name: /^Add at for/ });
    await expect(addAt).toContainText('In lye water');
    await expect(panel(page)).not.toContainText(/Through the lye/);

    await addAt.getByRole('radio', { name: 'In lye water' }).click();
    // The route replaces the carrier oil rather than adding to it, and says what it costs.
    await expect(panel(page)).toContainText(/Stir into the lye solution itself/);
    await expect(panel(page)).not.toContainText(/Mix 1:1 with a light carrier oil/);
    await expect(panel(page)).toContainText(/Through the lye/);
    await expect(panel(page)).toContainText(/never set at 30 g of root in 160 g of water/);
    await page.screenshot({ path: `${SHOTS}/colorants-cp-lye.png`, fullPage: true });

    // The absorption warning belongs to steeped-and-strained pieces, which madder is.
    await expect(panel(page)).toContainText(/Dried pieces swell in the lye solution/);
    // A clay is not: it stays in, and it is a mineral, so neither that warning nor the
    // plant-pigment one follows it — and its own note no longer argues with the route.
    await page.getByLabel(/Colorant for/).selectOption('kaolin-clay');
    // The route does not ride across with the pick: the new material starts derived.
    await expect(panel(page)).not.toContainText(/Stir into the lye solution itself/);
    await panel(page).getByRole('radio', { name: 'In lye water' }).click();
    await expect(panel(page)).not.toContainText(/Dried pieces swell in the lye solution/);
    await expect(panel(page)).not.toContainText(/anthocyanins in berries/);
    await expect(panel(page)).toContainText(/Unless it is going through the lye, wet it in water/);
    await page.getByLabel(/Colorant for/).selectOption('madder-root');
    await panel(page).getByRole('radio', { name: 'In lye water' }).click();

    // Splitting the batter cannot claim a colour that is in the pot before the batter is.
    await page.getByRole('button', { name: /split the batter/i }).click();
    await page.getByLabel('Portion name').fill('Swirl');
    await page.getByLabel(/Portion Swirl share/).fill('40');
    await expect(panel(page).getByLabel(/Madder root portion/)).toHaveCount(0);

    // The sources cover cold process only: the choice is gone in the other two.
    await processTab(page, /Hot process/).click();
    await expect(panel(page).getByRole('radiogroup', { name: /^Add at for/ })).toHaveCount(0);
    await expect(panel(page)).not.toContainText(/Stir into the lye solution itself/);

    await expectNoJunk(page);
    expect(problems, 'browser reported nothing').toEqual([]);
  });
});
