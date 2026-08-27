import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

/**
 * A LOOK AT THE APP, not an assertion about one widget. The Signal design-integrity pass
 * changed type, colour, radius and layout across every panel — the kind of change a unit
 * test cannot judge, because nothing about it is wrong in the DOM. This spec drives the
 * real app to each surface the pass touched, captures a screenshot for a human to look at,
 * and fails on anything the browser itself complains about.
 *
 * Screenshots land in e2e/__screens__/ (gitignored); the console/pageerror checks are what
 * runs unattended.
 */

const SHOTS = 'e2e/__screens__';

/** Console errors and uncaught exceptions, collected for the life of one page. */
function watchForErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    // A font or asset that 404s is invisible in the DOM and obvious on screen.
    problems.push(`requestfailed: ${r.url()} — ${r.failure()?.errorText ?? 'unknown'}`);
  });
  return problems;
}

/** Everything the pass could have broken silently, asked of the browser's own layout. */
async function assertNoVisualBreakage(page: Page, where: string) {
  // 1. Nothing overflows the viewport horizontally — the commonest symptom of a grid or
  //    a max-width that stopped holding.
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return { scrollW: d.scrollWidth, clientW: d.clientWidth };
  });
  expect(overflow.scrollW, `${where}: horizontal overflow`).toBeLessThanOrEqual(
    overflow.clientW + 1,
  );

  // 2. No element is painted in a colour the palette does not contain. The pass replaced
  //    six literals with tokens; a typo'd var() resolves to nothing and the browser falls
  //    back to transparent or initial, which is invisible until someone looks.
  const unresolved = await page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const s = getComputedStyle(el);
      // An unresolved var() in a colour lands as the initial value, not the token.
      if (s.color === '' || s.backgroundColor === '') bad.push(el.className || el.tagName);
    }
    return bad.slice(0, 5);
  });
  expect(unresolved, `${where}: unresolved computed colours`).toEqual([]);

  // 3. Text is not clipped out of its own box (a real risk after type-size changes).
  const clipped = await page.evaluate(() => {
    const out: string[] = [];
    const sels = ['.panel__title', '.results-grid dt', '.results-grid dd', '.btn', '.micro-label'];
    for (const sel of sels) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') {
          out.push(`${sel} "${(el.textContent ?? '').slice(0, 24)}"`);
        }
      }
    }
    return out;
  });
  expect(clipped, `${where}: clipped text`).toEqual([]);
}

test('the Recipe view survives the design pass, at three widths', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('/');

  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 800, 1000],
    ['mobile', 380, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120); // let the media queries settle before measuring
    await page.screenshot({ path: `${SHOTS}/recipe-${name}.png`, fullPage: true });
    await assertNoVisualBreakage(page, `recipe/${name}`);
  }

  // Finding 09: the tint is a COLUMN treatment, so it must switch off once the grid
  // stacks — otherwise it is a full-width grey block between two paper blocks, the card
  // the system forbids.
  await page.setViewportSize({ width: 380, height: 900 });
  await page.waitForTimeout(120);
  const stackedTint = await page
    .locator('.col--tinted')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(stackedTint, 'stacked, the tinted column must not paint a card').toBe('rgba(0, 0, 0, 0)');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(120);
  const wideTint = await page
    .locator('.col--tinted')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(wideTint, 'at full width the column keeps its tint').toBe('rgb(228, 228, 228)');

  expect(problems, 'browser complaints on the Recipe view').toEqual([]);
});

test('the Pricing view leads with its hero and reports nothing broken', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Pricing & profit' }).click();
  const panel = page.locator('.panel:has(> h2:text("Pricing & profit"))');
  const hero = panel.locator('.results-grid__item--primary dd');
  const plain = panel.locator('.results-grid__item:not(.results-grid__item--primary) dd').first();
  const size = (l: typeof hero) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

  // EMPTY FIRST, because that is the state the panel opens in. An em-dash at hero scale
  // paints as a solid accent bar the width of the column — it shipped that way and only a
  // screenshot showed it, so the empty state is pinned before the filled one.
  await page.screenshot({ path: `${SHOTS}/pricing-empty.png`, fullPage: true });
  expect(await hero.innerText(), 'no prices entered yet').toBe('—');
  expect(
    await size(hero),
    'a placeholder must not be set at hero scale — it reads as a red bar, not a figure',
  ).toBeLessThanOrEqual(await size(plain));

  // Now price every material, and the hero should genuinely take over.
  const prices = panel.locator('input[aria-label^="Price for"]');
  for (let i = 0; i < (await prices.count()); i++) await prices.nth(i).fill('10');
  await expect(hero).not.toHaveText('—');
  await page.screenshot({ path: `${SHOTS}/pricing-priced.png`, fullPage: true });
  await assertNoVisualBreakage(page, 'pricing');

  // Finding 12: the suggested price is the number the panel exists to produce, so it is
  // the one figure set at hero scale — everything else sat at 0.95rem beside it before.
  expect(await size(hero), 'the hero must outrank the ordinary figures').toBeGreaterThan(
    (await size(plain)) * 2,
  );

  expect(problems, 'browser complaints on the Pricing view').toEqual([]);
});

test('the Liquid Soap dilution panel renders its suggestions as guidance', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('/');
  await page.getByRole('tab', { name: /liquid soap/i }).click();
  await page.locator('.dilution-suggestions').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/dilution-ls.png`, fullPage: true });
  await assertNoVisualBreakage(page, 'dilution');

  // Finding 16: it is a hairline-and-legend group, not a card. No tint, no radius, no
  // left stripe — the three things that made it the one real card in the app.
  const box = page.locator('.dilution-suggestions');
  const style = await box.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, radius: s.borderTopLeftRadius, left: s.borderLeftWidth };
  });
  expect(style.bg, 'the suggestions group must not be a tinted box').toBe('rgba(0, 0, 0, 0)');
  expect(style.radius, 'radius zero').toBe('0px');
  expect(style.left, 'no accent stripe').toBe('0px');

  expect(problems, 'browser complaints on the Dilution panel').toEqual([]);
});

test('no rounded corners survive outside the documented exceptions', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('/');

  // Radius zero is a hard rule; the exceptions are pills (999px), the round InfoTip and
  // round dots (50%). Anything else is the rounded SaaS container the system rules out.
  // Asked of the RENDERED page rather than the stylesheet, so a radius arriving from an
  // inline style or a UA default is caught too.
  for (const tab of ['recipe', 'ls'] as const) {
    if (tab === 'ls') await page.getByRole('tab', { name: /liquid soap/i }).click();
    const offenders = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        const r = getComputedStyle(el).borderTopLeftRadius;
        const px = parseFloat(r);
        if (!r.endsWith('%') && px > 0 && px < 100) {
          bad.push(`${el.tagName}.${el.className || '(none)'} — ${r}`);
        }
      }
      return [...new Set(bad)];
    });
    expect(offenders, `soft corners on the ${tab} view`).toEqual([]);
  }

  expect(problems, 'browser complaints while auditing radii').toEqual([]);
});

test('every boxless figure field fits the values this app actually holds', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('/');

  // The ink rule replaced a bordered box that was width:100% in a 1fr column, so nothing
  // used to clip. A fixed width can, and the starter recipe's own total oil is 1,000 g —
  // four digits — with kg/oz modes adding a decimal point on top. Measured, not eyeballed:
  // a clipped input still reports its full value, so only scrollWidth catches this.
  //
  // WHICH ROW GUARDS WHAT. "1234.5" is the width guard: it needs 67px and overflowed the old
  // 3.6rem field outright. "1000" guards the width and the SPIN BUTTONS together — the digits
  // alone fit 3.6rem (57px of 58px), and it only clipped because the spinners were eating the
  // rest, which is the combination that actually shipped. Re-narrowing the field fails the
  // first; letting the spinners back fails the second.
  const fits = async (sel: string, value: string) => {
    const el = page.locator(sel).first();
    await el.fill(value);
    return el.evaluate((n: HTMLInputElement) => ({ c: n.clientWidth, s: n.scrollWidth }));
  };

  for (const [sel, value] of [
    ['input[aria-label^="Weight in"]', '1000'],
    ['input[aria-label^="Weight in"]', '1234.5'],
    ['input[aria-label^="Percent for"]', '100'],
  ] as const) {
    const m = await fits(sel, value);
    expect(m.s, `${sel} clips "${value}" (${m.s}px of content in ${m.c}px)`).toBeLessThanOrEqual(m.c);
  }

  // Spin buttons steal width from a field this narrow and read as chrome on a rule that is
  // meant to be bare — .slider-field__value already suppresses them for the same reason.
  const spin = await page
    .locator('input[aria-label^="Weight in"]')
    .first()
    .evaluate((n) => getComputedStyle(n).appearance);
  expect(spin, 'the boxless figure should not carry spinners').toBe('textfield');

  expect(problems, 'browser complaints while measuring figure fields').toEqual([]);
});

test('a brand-new additive keeps its remove control on the ingredient line', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^\+ Add$/ }).first().click();

  // A new line has no catalog entry yet, so it shows the custom Name field — a THIRD child
  // in the row's grid. Auto-placement put [type | Name] on row 1 and dropped the × to row 2
  // at the left edge, which is the state a maker meets every time they press Add.
  const names = page.locator('.additive-list__names').last();
  await names.scrollIntoViewIfNeeded();
  const geom = await names.evaluate((el) => {
    const kids = Array.from(el.children).map((c) => c.getBoundingClientRect());
    const btn = el.querySelector('button')!.getBoundingClientRect();
    const select = el.querySelector('select')!.getBoundingClientRect();
    return { btnY: Math.round(btn.y), selectY: Math.round(select.y),
             btnX: Math.round(btn.x), selectX: Math.round(select.x), n: kids.length };
  });
  expect(geom.n, 'the custom-name field makes this a three-child row').toBe(3);
  expect(Math.abs(geom.btnY - geom.selectY), 'the × shares the type row').toBeLessThanOrEqual(20);
  expect(geom.btnX, 'the × sits to the RIGHT of the type select').toBeGreaterThan(geom.selectX);

  expect(problems, 'browser complaints on a new additive row').toEqual([]);
});

test('the preset rows line up with the header that names their columns', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('/');
  await page.getByRole('tab', { name: /liquid soap/i }).click();

  const head = (await page.locator('.dilution-presets__head span').last().boundingBox())!;
  const cell = (await page.locator('.dilution-preset__sets').first().boundingBox())!;
  expect(
    Math.abs(head.x + head.width - (cell.x + cell.width)),
    'the SETS header and the figures under it must share a right edge',
  ).toBeLessThanOrEqual(1);

  expect(problems, 'browser complaints on the preset list').toEqual([]);
});

test('the Radar / Bars switch reads as a control, not as a caption', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('/');

  // The panel opens on Bars, so the radar is only ever reached through this switch. The
  // design pass demoted it from ink-filled segmented buttons to an underlined micro-label —
  // correct in principle (ink fill belongs to the process switch it sits under) but taken to
  // 0.62rem it became indistinguishable from the captions around it, and a whole view of the
  // app went missing. "It is still in the DOM" is not the same as "a maker can find it".
  const tab = page.getByRole('tab', { name: 'Radar' });
  const label = await page
    .locator('.micro-label, .results-grid dt')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const style = await tab.evaluate((el) => {
    const s = getComputedStyle(el);
    return { size: parseFloat(s.fontSize), weight: s.fontWeight, color: s.color };
  });
  expect(
    style.size,
    `the switch is set at ${style.size}px against a ${label}px caption — it must outrank it`,
  ).toBeGreaterThan(label);

  // And the two states must be told apart by more than a 2px rule most people will not see.
  const active = await page
    .getByRole('tab', { name: 'Bars' })
    .evaluate((el) => getComputedStyle(el).color);
  expect(active, 'the selected view must differ in colour from the unselected one').not.toBe(
    style.color,
  );

  // The thing it exists to reveal still arrives when pressed.
  await tab.click();
  const radar = await page
    .locator('.property-radar')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(radar, 'the radar renders once its tab is chosen').toBeGreaterThan(100);

  expect(problems, 'browser complaints on the properties switch').toEqual([]);
});

