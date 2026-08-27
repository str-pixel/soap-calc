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

// The redesign's List | Bars toggle. List leads (the compact readout), the bars are the
// step down into detail — and the tabs carry full ARIA wiring like the properties switch.
test('opens on the list view, and the Bars tab swaps in the zoned meters', () => {
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
  // The list renders rows without meter tracks; the readings are all present.
  expect(document.querySelector('.fatty-list')).not.toBeNull();
  expect(document.querySelector('.property-meter')).toBeNull();
  expect(screen.getAllByRole('meter').length).toBeGreaterThanOrEqual(6);

  fireEvent.click(barsTab);
  expect(barsTab.getAttribute('aria-selected')).toBe('true');
  expect(document.querySelector('.fatty-list')).toBeNull();
  expect(document.querySelector('.property-meter')).not.toBeNull();
  // The panel is labelled by whichever tab is active.
  expect(document.getElementById('fatty-tabpanel')?.getAttribute('aria-labelledby')).toBe(
    'fatty-tab-bars',
  );
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
