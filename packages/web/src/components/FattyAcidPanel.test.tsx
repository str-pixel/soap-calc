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
      insights={[]}
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
      insights={[]}
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
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  // The verdict must hold in BOTH views — the toggle changes geometry, never what is
  // claimed — so assert it on the default meters first, then again on the radar, where
  // trans is one of the three catch-alls printed under the chart.
  for (const tab of [null, 'Radar'] as const) {
    if (tab) fireEvent.click(screen.getByRole('tab', { name: tab }));
    const transMeter = screen.getByRole('meter', { name: /Trans \(elaidic\)/i });
    expect(transMeter.getAttribute('aria-label')).toMatch(/above typical range/i);

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
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  // Oleic = 41, band is 32–41 — in range.
  const oleicMeter = screen.getByRole('meter', { name: /^Oleic:/i });
  expect(oleicMeter.getAttribute('aria-label')).not.toMatch(/above typical range/i);
});

// The Meters | Radar toggle, the same pair as the properties panel. Meters (default) is
// one zoned row per group — the value on its dot against the typical band; Radar is the
// band-fitted chart — and the tabs carry full ARIA wiring like the properties switch.
test('opens on the meters, and the Radar tab swaps in the chart', () => {
  render(
    <FattyAcidPanel
      insights={[]}
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
      insights={[]}
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
      insights={[]}
      result={{ profile: edge, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const meter = screen.getByRole('meter', { name: /Palmitic \+ stearic/i });
  expect(meter.textContent).toBe('30%');
  expect(meter.getAttribute('aria-label')).not.toMatch(/above typical range/i);
  expect(meter.closest('li')!.querySelector('.property-meters__status')).toBeNull();

  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const again = screen.getByRole('meter', { name: /Palmitic \+ stearic/i });
  expect(again.getAttribute('aria-label')).not.toMatch(/above typical range/i);
});

test('a value at the edge of the track anchors its label to the marker instead of clipping', () => {
  render(
    <FattyAcidPanel
      insights={[]}
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
      insights={[]}
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
  // And it says what can be flagged on the chart, and where the rancidity note appears.
  expect(caption).toMatch(/rancidity note/i);
  // All nine readings stay reachable for AT in this view too.
  expect(screen.getAllByRole('meter').length).toBe(9);
});

test('the fatty view tabs traverse with arrow keys, starting from the meters', () => {
  render(
    <FattyAcidPanel
      insights={[]}
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
      insights={[]}
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
      insights={[]}
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

// A band describing where most recipes sit is not a band of acceptable values. Flagging both
// directions on all nine groups lit every one of ten hand-picked ordinary bars (adcc7f5) and
// buried the warnings that mattered. Rancidity is not judged here
// either: it depends on superfat and antioxidants this panel cannot see, and any limit here
// contradicted the formulation insights on every heavy recipe once an antioxidant was added.
// See core's fatty-acid-verdict.
test('flags only a high reading whose cause the reading names', () => {
  // Coconut-free, castor-free and high-oleic, so lauric, palmitic and ricinoleic read low and
  // oleic reads high: recipe style. Linoleic at 30 is a rancidity risk, judged in the
  // formulation insights. Trans at 5 means a hydrogenated oil: the one flag on this panel.
  const profile = { oleic: 50, linoleic: 30, palmitic: 6, stearic: 3, linolenic: 1, elaidic: 5 };
  render(
    <FattyAcidPanel
      insights={[]}
      result={{ profile, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const row = (name: RegExp) => screen.getByRole('meter', { name }).closest('li')!;
  const quiet = [/^Lauric \+ myristic/i, /^Palmitic \+ stearic/i, /^Oleic:/i, /^Ricinoleic:/i, /^Linoleic:/i, /^Linolenic:/i];
  for (const q of quiet) {
    expect(row(q).querySelector('.property-meters__status'), String(q)).toBeNull();
    expect(row(q).querySelector('.property-meters__value--outside'), String(q)).toBeNull();
    expect(row(q).querySelector('.property-meter__marker--outside'), String(q)).toBeNull();
  }
  const trans = row(/Trans \(elaidic\)/i);
  expect(trans.querySelector('.property-meters__status')?.textContent).toBe('Too high');
  expect(trans.querySelector('.property-meter__marker--outside')).not.toBeNull();
  expect(screen.getByRole('meter', { name: /Trans \(elaidic\)/i }).getAttribute('aria-label')).toMatch(
    /above typical range/i,
  );
  // Exactly one warning on the whole panel.
  expect(document.querySelectorAll('.property-meters__status').length).toBe(1);
});

// Every drawn radar axis is a style group or a rancidity-prone acid, and neither is judged on
// this panel, so no axis can say "Too high" however far past its band it reads. The groups
// that can be flagged are the catch-alls printed under the chart.
test('no radar axis can be flagged, however far past its band', () => {
  const profile = { lauric: 60, palmitic: 40, oleic: 80, linoleic: 70, linolenic: 50, ricinoleic: 90 };
  render(
    <FattyAcidPanel
      insights={[]}
      result={{ profile, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const chart = document.querySelector('.fatty-radar')!.textContent!;
  expect(chart).not.toMatch(/Too high/);
  expect(chart.match(/Typical/g)?.length).toBe(6);
});

// The rancidity note that replaced 09's own flag lived only in Formulation notes, which was
// never on screen while 09 was, at any of five measured widths. It now also appears here,
// taken from the very same insights, the way the essential-oils row and Formulation notes both
// say a dose is over its ceiling. One source, so the two cannot disagree.
test('shows the rancidity notes from the insights, above the chart, in both views', () => {
  const dos = { code: 'dos_risk_no_antioxidant', level: 'info' as const, message: 'High linoleic + linolenic with no antioxidant.' };
  const cap = { code: 'pufa_cap_superfat', level: 'warning' as const, message: 'Keep superfat nearer 3-5%.' };
  const unrelated = { code: 'trace_speed', level: 'info' as const, message: 'A trace note that belongs elsewhere.' };
  render(
    <FattyAcidPanel
      insights={[dos, unrelated, cap]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const notes = () => screen.getByRole('list', { name: /Rancidity/i });
  expect(notes().textContent).toContain(dos.message);
  expect(notes().textContent).toContain(cap.message);
  expect(notes().textContent).not.toContain(unrelated.message);
  // Same look as every other insight: a warning reads as a warning.
  const capItem = Array.from(notes().querySelectorAll('li')).find((li) => li.textContent === cap.message)!;
  expect(capItem.className).toContain('message-list__item--warn');
  // Above the view switch's panel, so the default Meters view shows it and so does the radar.
  const tabpanel = document.getElementById('fatty-tabpanel')!;
  expect(notes().compareDocumentPosition(tabpanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  expect(notes().textContent).toContain(dos.message);
});

test('shows no rancidity note when the insights carry none', () => {
  render(
    <FattyAcidPanel
      insights={[{ code: 'trace_speed', level: 'info', message: 'A trace note.' }]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  expect(screen.queryByRole('list', { name: /Rancidity/i })).toBeNull();
});

// Nothing tested 09 below its 80% coverage cutoff: removing the low-coverage guard failed no
// unit test. Below the cutoff every reading is an estimate: marked "~" and "estimated", the
// caption says "estimated from", nothing is flagged, and the radar says "Low data".
test('treats every reading as an estimate below the coverage cutoff, in both views', () => {
  // Trans at 22 is flagged at full coverage (see the out-of-range test above).
  render(
    <FattyAcidPanel
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 60, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  expect(screen.getByText(/estimated from 60% of recipe oils/i)).toBeTruthy();
  expect(document.querySelectorAll('.property-meters__status').length).toBe(0);
  expect(document.querySelector('.property-meters__value--outside')).toBeNull();
  expect(document.querySelector('.property-meter__marker--outside')).toBeNull();
  const trans = screen.getByRole('meter', { name: /Trans \(elaidic\)/i });
  expect(trans.getAttribute('aria-label')).toMatch(/estimated/);
  expect(trans.getAttribute('aria-label')).not.toMatch(/above typical range/);
  expect(trans.textContent).toMatch(/^~/);

  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const chart = document.querySelector('.fatty-radar')!.textContent!;
  expect(chart.match(/Low data/g)?.length).toBe(6);
  expect(chart).not.toMatch(/Too high/);
  expect(document.querySelectorAll('.fatty-radar__other .property-meters__status').length).toBe(0);
});
