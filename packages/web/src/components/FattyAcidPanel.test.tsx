// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FattyAcidPanel } from './FattyAcidPanel';

afterEach(cleanup);

const PROFILE = { oleic: 41, elaidic: 22, stearic: 15, linoleic: 11, palmitic: 10, linolenic: 1 };

/**
 * These bars ARE the reconstruction — the panel renders the modeled percentages themselves — so
 * it must carry the modeled marker, not just the properties derived from it.
 */
test('marks a recipe built on a modeled (reconstructed) profile', () => {
  render(
    <FattyAcidPanel
      result={{
        profile: PROFILE,
        coveragePercent: 100,
        missingOilIds: [],
        modeledOilIds: ['soybean-27-5-hydrogenated'],
      }}
    />,
  );
  expect(screen.getByText('Modeled')).toBeTruthy();
  // Named via the shared oilDisplayName helper, not the raw id.
  expect(screen.getByText(/Soybean, 27\.5% hydrogenated/)).toBeTruthy();
});

test('stays silent for a measured-only recipe', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  expect(screen.queryByText('Modeled')).toBeNull();
});

// PROFILE.elaidic = 22 falls in the "trans" bar (typical 0–2%), well outside its band — the panel
// must signal that with more than color (WCAG 1.4.1): a non-color, real-text verdict plus the
// status folded into the meter's accessible name, not left for sighted users only.
test('flags an out-of-range bar with a non-color marker and names the status in the meter', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  // The verdict must hold in BOTH views — the toggle changes geometry, never what is
  // claimed — so assert it on the default list first, then again on the bars.
  for (const tab of [null, 'Bars'] as const) {
    if (tab) fireEvent.click(screen.getByRole('tab', { name: tab }));
    const transMeter = screen.getByRole('meter', { name: /Trans \(elaidic\)/i });
    expect(transMeter.getAttribute('aria-label')).toMatch(/outside typical range/i);

    // A non-color, visible verdict accompanies the value — real text, not only a CSS color
    // class. 22% against a 0–2% band reads as "Too high" on the trans row specifically.
    const transRow = transMeter.closest('li');
    expect(transRow, `the ${tab ?? 'list'} view keeps the meter inside its row`).not.toBeNull();
    expect(transRow!.querySelector('.property-bars__value--outside')).not.toBeNull();
    expect(transRow!.querySelector('.property-bars__status')?.textContent).toMatch(/^Too high$/);
  }
});

test('does not flag an in-range bar as outside range', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  // Oleic = 41, band is 32–41 — in range.
  const oleicMeter = screen.getByRole('meter', { name: /^Oleic:/i });
  expect(oleicMeter.getAttribute('aria-label')).not.toMatch(/outside typical range/i);
});

// The redesign's List | Bars toggle. List (default) is the zoned-meter rows; Bars is the
// mock's column chart — and the tabs carry full ARIA wiring like the properties switch.
test('opens on the meter list, and the Bars tab swaps in the column chart', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const listTab = screen.getByRole('tab', { name: 'List' });
  const barsTab = screen.getByRole('tab', { name: 'Bars' });
  expect(listTab.getAttribute('aria-selected')).toBe('true');
  expect(barsTab.getAttribute('aria-selected')).toBe('false');
  // Roving tabindex: exactly the active tab is in the tab order.
  expect(listTab.tabIndex).toBe(0);
  expect(barsTab.tabIndex).toBe(-1);
  // List = the zoned meters, one row per group.
  expect(document.querySelector('.property-meter')).not.toBeNull();
  expect(document.querySelector('.fatty-chart')).toBeNull();
  expect(screen.getAllByRole('meter').length).toBeGreaterThanOrEqual(6);

  fireEvent.click(barsTab);
  expect(barsTab.getAttribute('aria-selected')).toBe('true');
  expect(document.querySelector('.property-meter')).toBeNull();
  expect(document.querySelector('.fatty-chart')).not.toBeNull();
  // The panel is labelled by whichever tab is active.
  expect(document.getElementById('fatty-tabpanel')?.getAttribute('aria-labelledby')).toBe(
    'fatty-tab-bars',
  );
});

test('the chart scales columns to the largest group, colours verdicts, and explains its abbreviations', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Bars' }));
  const cols = Array.from(document.querySelectorAll('.fatty-chart__col'));
  expect(cols.length).toBe(9);
  const heightOf = (col: Element) =>
    parseFloat((col.querySelector('.fatty-chart__bar') as HTMLElement).style.height);
  // Oleic (41) is this profile's largest group — its column is the tallest, at full scale.
  const byAbbr = (abbr: string) =>
    cols.find((c) => c.querySelector('.fatty-chart__abbr')!.textContent === abbr)!;
  const heights = cols.map(heightOf);
  expect(heightOf(byAbbr('Ole'))).toBe(Math.max(...heights));
  // Even a zero-value group keeps a visible stub — a column, not a missing entry.
  expect(heightOf(byAbbr('Ric'))).toBeGreaterThan(0);
  // Verdict colouring: trans (22 against 0–2) is out of range and carries the outside
  // class; linoleic (11 against 7–14) is in range and does not.
  expect(byAbbr('Trs').querySelector('.fatty-chart__bar--outside')).not.toBeNull();
  expect(byAbbr('Lin').querySelector('.fatty-chart__bar--outside')).toBeNull();
  // Every abbreviation the cells use is expanded once in the legend line.
  const legend = document.querySelector('.fatty-chart__legend')!.textContent!;
  for (const abbr of ['Lau', 'Pal', 'Ole', 'Lin', 'Lnn', 'Ric', 'Osa', 'Oun', 'Trs']) {
    expect(legend).toContain(abbr);
  }
  expect(legend).toContain('Lau lauric + myristic');
  expect(legend).toContain('Trs trans');
  expect(legend).not.toContain('(');
});

test('the fatty view tabs traverse with arrow keys, starting from the list', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const listTab = screen.getByRole('tab', { name: 'List' });
  fireEvent.keyDown(listTab, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Bars' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Bars' }), { key: 'ArrowLeft' });
  expect(screen.getByRole('tab', { name: 'List' }).getAttribute('aria-selected')).toBe('true');
});

test('both views state the same readings — the toggle changes geometry, not claims', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const readings = () =>
    screen.getAllByRole('meter').map((m) => m.getAttribute('aria-label')).sort();
  const listReadings = readings();
  fireEvent.click(screen.getByRole('tab', { name: 'Bars' }));
  expect(readings()).toEqual(listReadings);
});
