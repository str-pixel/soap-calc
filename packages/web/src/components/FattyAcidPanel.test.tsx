// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FattyAcidPanel } from './FattyAcidPanel';

afterEach(cleanup);

const PROFILE = { oleic: 41, elaidic: 22, stearic: 15, linoleic: 11, palmitic: 10, linolenic: 1 };

/**
 * These readings ARE the reconstruction — the panel renders the modeled percentages themselves —
 * so it must carry the modeled marker, not just the properties derived from it.
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

// PROFILE.elaidic = 22 falls in the "trans" group (typical 0–2%), well outside its band — the
// panel must signal that with more than color (WCAG 1.4.1): a non-color, real-text verdict plus
// the status folded into the meter's accessible name, not left for sighted users only.
test('flags an out-of-range group with a non-color marker and names the status in the meter', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  // The verdict must hold in BOTH views — the toggle changes geometry, never what is
  // claimed — so assert it on the default meters first, then again on the radar, where
  // trans is one of the three catch-alls printed under the chart.
  for (const tab of [null, 'Radar'] as const) {
    if (tab) fireEvent.click(screen.getByRole('tab', { name: tab }));
    const transMeter = screen.getByRole('meter', { name: /Trans \(elaidic\)/i });
    expect(transMeter.getAttribute('aria-label')).toMatch(/outside typical range/i);

    // A non-color, visible verdict accompanies the value — real text, not only a CSS color
    // class. 22% against a 0–2% band reads as "Too high" on the trans row specifically.
    const transRow = transMeter.closest('li');
    expect(transRow, `the ${tab ?? 'meters'} view keeps the meter inside its row`).not.toBeNull();
    expect(transRow!.querySelector('.property-meters__value--outside')).not.toBeNull();
    expect(transRow!.querySelector('.property-meters__status')?.textContent).toMatch(/^Too high$/);
  }
});

test('does not flag an in-range group as outside range', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  // Oleic = 41, band is 32–41 — in range.
  const oleicMeter = screen.getByRole('meter', { name: /^Oleic:/i });
  expect(oleicMeter.getAttribute('aria-label')).not.toMatch(/outside typical range/i);
});

// The Meters | Radar toggle, the same pair as the properties panel. Meters (default) is
// one zoned row per group — the value on its dot against the typical band; Radar is the
// band-fitted chart — and the tabs carry full ARIA wiring like the properties switch.
test('opens on the meters, and the Radar tab swaps in the chart', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const metersTab = screen.getByRole('tab', { name: 'Meters' });
  const radarTab = screen.getByRole('tab', { name: 'Radar' });
  expect(metersTab.getAttribute('aria-selected')).toBe('true');
  expect(radarTab.getAttribute('aria-selected')).toBe('false');
  // Roving tabindex: exactly the active tab is in the tab order.
  expect(metersTab.tabIndex).toBe(0);
  expect(radarTab.tabIndex).toBe(-1);
  // Meters = one zoned track per group, all nine, each with its typical band shaded.
  expect(document.querySelectorAll('.property-meters__row').length).toBe(9);
  expect(document.querySelectorAll('.property-meter__band--suggested').length).toBe(9);
  expect(document.querySelector('.fatty-radar')).toBeNull();
  expect(screen.getAllByRole('meter').length).toBe(9);

  fireEvent.click(radarTab);
  expect(radarTab.getAttribute('aria-selected')).toBe('true');
  expect(document.querySelector('.property-meter')).toBeNull();
  expect(document.querySelector('.fatty-radar')).not.toBeNull();
  // The panel is labelled by whichever tab is active.
  expect(document.getElementById('fatty-tabpanel')?.getAttribute('aria-labelledby')).toBe(
    'fatty-tab-radar',
  );
});

test('the meters place each marker at its percent and shade the typical band there', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const oleicRow = screen.getByRole('meter', { name: /^Oleic:/i }).closest('li')!;
  const marker = oleicRow.querySelector('.property-meter__marker') as HTMLElement;
  const band = oleicRow.querySelector('.property-meter__band--suggested') as HTMLElement;
  // Oleic 41 on a 0–100% track; its band 32–41 starts at 32% and spans 9%.
  expect(marker.style.left).toBe('41%');
  expect(band.style.left).toBe('32%');
  expect(band.style.width).toBe('9%');
  // In range: the marker is not flagged. Trans (22 against 0–2) is.
  expect(marker.className).not.toContain('property-meter__marker--outside');
  const transRow = screen.getByRole('meter', { name: /Trans \(elaidic\)/i }).closest('li')!;
  expect(transRow.querySelector('.property-meter__marker--outside')).not.toBeNull();
  // A wide band numbers both edges; a narrow one prints a single "low–high" from its left
  // edge, so a 0–2 band's numbers neither overprint each other nor hang off the row.
  const ticks = (row: Element) =>
    Array.from(row.querySelectorAll('.property-meter__tick')).map((t) => t.textContent);
  expect(ticks(oleicRow)).toEqual(['32', '41']);
  expect(ticks(transRow)).toEqual(['0–2']);
  expect(transRow.querySelector('.property-meter__tick--start')).not.toBeNull();
});

// Same rule as the properties panel, at this panel's precision: it prints one decimal, so
// a reading is judged on that. 22.04 prints "22%" and must not read "Too high" beside it.
test('a reading that rounds into its band is not flagged, in either view', () => {
  // palmiticStearic band is 20–30; 30.04 prints as "30%".
  const edge = { oleic: 36, palmitic: 30.04, linoleic: 10, lauric: 23.96 };
  render(
    <FattyAcidPanel
      result={{ profile: edge, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const meter = screen.getByRole('meter', { name: /Palmitic \+ stearic/i });
  expect(meter.textContent).toBe('30%');
  expect(meter.getAttribute('aria-label')).not.toMatch(/outside typical range/i);
  expect(meter.closest('li')!.querySelector('.property-meters__status')).toBeNull();

  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const again = screen.getByRole('meter', { name: /Palmitic \+ stearic/i });
  expect(again.getAttribute('aria-label')).not.toMatch(/outside typical range/i);
});

test('a value at the edge of the track anchors its label to the marker instead of clipping', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  // Ricinoleic is absent (0%): centred on 0% the label would hang half off the row.
  const ricinoleic = screen.getByRole('meter', { name: /^Ricinoleic:/i });
  expect(ricinoleic.className).toContain('property-meters__value--start');
  expect((ricinoleic as HTMLElement).style.left).toBe('0%');
  // Oleic at 41% stays centred.
  const oleic = screen.getByRole('meter', { name: /^Oleic:/i });
  expect(oleic.className).not.toMatch(/property-meters__value--(start|end)/);
});

test('the radar draws the six named groups and prints the three catch-alls under it', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const points = document
    .querySelector('[data-testid="radar-recipe"]')!
    .getAttribute('points')!
    .split(' ');
  expect(points.length).toBe(6);
  // The catch-alls are not axes, but they are not hidden either: name, value and verdict,
  // as list items so the out-of-range assertions above can find their row.
  const others = Array.from(document.querySelectorAll('.fatty-radar__other')).map(
    (li) => li.textContent,
  );
  expect(others.length).toBe(3);
  expect(others.join(' ')).toMatch(/Other saturated/);
  expect(others.join(' ')).toMatch(/Other unsaturated/);
  expect(others.join(' ')).toMatch(/Trans \(elaidic\).*Too high.*22%/);
  // The chart says what its ring means and what the short axis names fold in.
  const caption = document.querySelector('.fatty-radar__caption')!.textContent!;
  expect(caption).toMatch(/ring/i);
  expect(caption).toMatch(/typical range/i);
  expect(caption).toMatch(/myristic/i);
  expect(caption).toMatch(/stearic/i);
  // All nine readings stay reachable for AT in this view too.
  expect(screen.getAllByRole('meter').length).toBe(9);
});

test('the fatty view tabs traverse with arrow keys, starting from the meters', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const metersTab = screen.getByRole('tab', { name: 'Meters' });
  fireEvent.keyDown(metersTab, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Radar' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Radar' }), { key: 'ArrowLeft' });
  expect(screen.getByRole('tab', { name: 'Meters' }).getAttribute('aria-selected')).toBe('true');
});

test('both views state the same readings — the toggle changes geometry, not claims', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const readings = () =>
    screen.getAllByRole('meter').map((m) => m.getAttribute('aria-label')).sort();
  const metersReadings = readings();
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  expect(readings()).toEqual(metersReadings);
});

// Of the four result views on this page, the fatty-acid meters were the only one with
// nothing naming its shading: 08's meters carry a legend, 08's radar a legend and a
// caption, 09's radar a caption. A shaded band a reader cannot name is decoration.
test('names its shading, like the other three result views do', () => {
  const { container } = render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const legend = container.querySelector('.property-legend')!;
  expect(legend).toBeTruthy();
  expect(legend.textContent).toMatch(/Typical range/i);
  expect(legend.querySelector('.property-legend__swatch--suggested')).not.toBeNull();
  // One band only here — this panel has no target band, so it must not claim one.
  expect(legend.querySelector('.property-legend__swatch--preference')).toBeNull();
});
