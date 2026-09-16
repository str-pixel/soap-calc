// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FattyAcidPanel } from './FattyAcidPanel';

afterEach(cleanup);

/** What a sighted reader sees: the element's text without its screen-reader-only parts. */
const visibleText = (el: Element): string => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('.sr-only').forEach((n) => n.remove());
  return copy.textContent ?? '';
};

const PROFILE = { oleic: 41, elaidic: 22, stearic: 15, linoleic: 11, palmitic: 10, linolenic: 1 };

/**
 * These readings ARE the reconstruction — the panel renders the modeled percentages themselves —
 * so it must carry the modeled marker, not just the properties derived from it.
 */
test('marks a recipe built on a modeled (reconstructed) profile', () => {
  render(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{
        profile: PROFILE,
        coveragePercent: 100,
        missingOilIds: [],
        modeledOilIds: ['soybean-27-5-hydrogenated'], coveredWeightShare: 1,
      }}
    />,
  );
  expect(screen.getByText('Modeled')).toBeTruthy();
  // Named via the shared oilDisplayName helper, not the raw id.
  expect(screen.getByText(/Soybean, 27\.5% hydrogenated/)).toBeTruthy();
});

test('stays silent for a measured-only recipe', () => {
  render(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  expect(screen.queryByText('Modeled')).toBeNull();
});

// The Meters | Radar toggle, the same pair as the properties panel. Meters (default) is
// one zoned row per group — the value on its dot against the typical band; Radar is the
// band-fitted chart — and the tabs carry full ARIA wiring like the properties switch.
test('opens on the meters, and the Radar tab swaps in the chart', () => {
  render(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
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
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  const oleicRow = screen.getByRole('meter', { name: /^Oleic:/i }).closest('li')!;
  const marker = oleicRow.querySelector('.property-meter__marker') as HTMLElement;
  const band = oleicRow.querySelector('.property-meter__band--suggested') as HTMLElement;
  // Oleic 41 on a 0–100% track; its band 32–41 starts at 32% and spans 9%.
  expect(marker.style.left).toBe('41%');
  expect(band.style.left).toBe('32%');
  expect(band.style.width).toBe('9%');
  const transRow = screen.getByRole('meter', { name: /Trans \(elaidic\)/i }).closest('li')!;
  // A wide band numbers both edges; a narrow one prints a single "low–high" from its left
  // edge, so a 0–2 band's numbers neither overprint each other nor hang off the row.
  const ticks = (row: Element) =>
    Array.from(row.querySelectorAll('.property-meter__tick')).map((t) => t.textContent);
  expect(ticks(oleicRow)).toEqual(['32', '41']);
  expect(ticks(transRow)).toEqual(['0–2']);
  expect(transRow.querySelector('.property-meter__tick--start')).not.toBeNull();
});

test('a value at the edge of the track anchors its label to the marker instead of clipping', () => {
  render(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
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
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const points = document
    .querySelector('[data-testid="radar-recipe"]')!
    .getAttribute('points')!
    .split(' ');
  expect(points.length).toBe(6);
  // The catch-alls are not axes, but they are not hidden either: name, value and typical
  // range, on screen. The range was screen-reader-only, so a sighted reader saw "Trans 22%"
  // with nothing to compare it to, while every axis above printed its range.
  const otherItems = Array.from(document.querySelectorAll('.fatty-radar__other'));
  for (const li of otherItems) {
    expect(visibleText(li)).toMatch(/Typical 0–2%/);
    expect(li.textContent!.match(/Typical/g)?.length).toBe(1); // shown once, not read twice
  }
  const others = otherItems.map((li) => li.textContent);
  expect(others.length).toBe(3);
  expect(others.join(' ')).toMatch(/Other saturated/);
  expect(others.join(' ')).toMatch(/Other unsaturated/);
  expect(others.join(' ')).toMatch(/Trans \(elaidic\).*22%/);
  expect(others.join(' ')).not.toMatch(/Too high|Too low/);
  // The chart says what its ring means and what the short axis names fold in.
  const caption = document.querySelector('.fatty-radar__caption')!.textContent!;
  expect(caption).toMatch(/ring/i);
  expect(caption).toMatch(/typical range/i);
  expect(caption).toMatch(/myristic/i);
  expect(caption).toMatch(/stearic/i);
  // And it says where the rancidity note appears, since nothing on the chart is judged.
  expect(caption).toMatch(/rancidity note/i);
  // All nine readings stay reachable for AT in this view too.
  expect(screen.getAllByRole('meter').length).toBe(9);
});

test('the fatty view tabs traverse with arrow keys, starting from the meters', () => {
  render(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
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
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
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
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  const legend = container.querySelector('.property-legend')!;
  expect(legend).toBeTruthy();
  expect(legend.textContent).toMatch(/Typical range/i);
  expect(legend.querySelector('.property-legend__swatch--suggested')).not.toBeNull();
  // One band only here — this panel has no target band, so it must not claim one.
  expect(legend.querySelector('.property-legend__swatch--preference')).toBeNull();
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
    <FattyAcidPanel withheldRancidity={[]}
      insights={[dos, unrelated, cap]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
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
    <FattyAcidPanel withheldRancidity={[]}
      insights={[{ code: 'trace_speed', level: 'info', message: 'A trace note.' }]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  expect(screen.queryByRole('list', { name: /Rancidity/i })).toBeNull();
});

// Below the 80% coverage cutoff every reading is an estimate: "~" on screen and "estimated" to a
// screen reader, for all nine meters in both views and for the Saturated/Unsaturated line,
// which had been left unmarked. The radar keeps printing each typical range: it judges
// nothing, so its "Low data" hid a range while the Meters view kept printing it.
test('treats every reading as an estimate below the coverage cutoff, in both views', () => {
  render(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 60, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  expect(document.querySelector('.panel__subtitle')!.textContent).toMatch(/estimated from/i);
  const everyMeterEstimated = (view: string) => {
    const meters = screen.getAllByRole('meter');
    expect(meters.length, view).toBe(9);
    for (const m of meters) {
      expect(m.getAttribute('aria-label'), view).toMatch(/: estimated \d/);
      expect(m.textContent, view).toMatch(/^~\d/);
    }
  };
  everyMeterEstimated('meters');
  const ratio = document.querySelector('.fatty-ratio')!;
  expect(visibleText(ratio)).toMatch(/^Saturated ~[\d.]+% · Unsaturated ~[\d.]+%$/);
  expect(ratio.textContent!.match(/estimated/g)?.length).toBe(2);

  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  everyMeterEstimated('radar');
  const chart = document.querySelector('.fatty-radar')!.textContent!;
  expect(chart).not.toMatch(/Low data/);
  expect(chart.match(/Typical/g)?.length).toBe(6);
});

test('does not mark the Saturated/Unsaturated line as an estimate at full coverage', () => {
  render(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  const ratio = document.querySelector('.fatty-ratio')!;
  expect(ratio.textContent).not.toMatch(/~|estimated/);
});

// With no oil carrying fatty-acid data there is nothing to chart, but the maker still needs
// to know which oils caused it. The subtitle names them whenever there is a profile; the
// empty state named none.
test('names the oils without fatty-acid data when there is nothing to show', () => {
  const { rerender } = render(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: null, coveragePercent: 0, missingOilIds: ['beeswax', 'pine-tar'], modeledOilIds: [], coveredWeightShare: 0 }}
    />,
  );
  expect(document.querySelector('.results-hint')!.textContent).toMatch(/\(no data: Beeswax, Pine Tar\)/);
  rerender(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: null, coveragePercent: 0, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  expect(document.querySelector('.results-hint')!.textContent).not.toMatch(/no data/);
});

// 09 judges no reading (since 2026-09-13). Trans fat, other saturated and other unsaturated were
// the last groups it flagged, and no source names a fault for any of them: not the books, not
// the research papers, not soapmaking sources, which describe trans fats, behenic and arachidic
// acids and palmitoleic acid neutrally or favourably. Their 0–2% bands were this app's own, set
// so palmitoleic acid would stop inflating the oleic reading. Every group still shows its value
// against its typical range, and rancidity is warned about by the formulation insights, shown
// above the chart.
test('never flags a reading, however far past its band, in either view', () => {
  // Every group past its band, including the three that used to be flagged: trans 22, other
  // saturated (behenic) 15, other unsaturated (erucic) 20.
  const profile = {
    lauric: 45, myristic: 15, palmitic: 40, oleic: 80, linoleic: 40, linolenic: 10,
    ricinoleic: 30, behenic: 15, erucic: 20, elaidic: 22,
  };
  render(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile, coveragePercent: 100, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  const panel = document.querySelector('section.panel')!;
  // Checked on what the panel says and announces, not on one class name: an earlier version of
  // this test looked for CSS classes the panel no longer renders, so a "Too high" brought back
  // under any other markup would have passed.
  // No word boundaries: the panel's text runs a label straight into the next figure
  // ("Too high22%"), where \b never matches, and that let a planted "Too high" pass.
  const VERDICT = /too high|too low|in range|above typical|below typical|out of range/i;
  const noVerdict = (view: string) => {
    expect(panel.textContent, view).not.toMatch(VERDICT);
    for (const el of Array.from(panel.querySelectorAll('[aria-label]'))) {
      expect(el.getAttribute('aria-label'), view).not.toMatch(VERDICT);
    }
    // Nor a colour: 08 paints an out-of-range figure and its dot accent through these classes.
    expect(
      panel.querySelector('.property-meters__value--outside, .property-meter__marker--outside'),
      view,
    ).toBeNull();
  };
  const rows = Array.from(document.querySelectorAll('.property-meters__row'));
  expect(rows.length).toBe(9);
  for (const row of rows) expect(row.textContent).toMatch(/Typical/);
  noVerdict('meters');

  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  noVerdict('radar');
  expect(document.querySelector('.fatty-radar')!.textContent!.match(/Typical/g)?.length).toBe(6);
});

// The subtitle says what the percentages are a percent of. With an oil missing, the profile is
// rescaled over the oils that have data, so "percent of oil weight" overstated the base; and a
// coverage figure that rounded to 100 was printed as "100%" on a partial recipe.
test('names the base of its percentages and how much of the recipe the data covers', () => {
  const { rerender } = render(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 99.89999999999999, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  const subtitle = () => document.querySelector('.panel__subtitle')!.textContent;
  expect(subtitle()).toBe('Percent of oil weight.');
  rerender(
    <FattyAcidPanel withheldRancidity={[]}
      insights={[]}
      result={{ profile: PROFILE, coveragePercent: 99.6, missingOilIds: ['abyssinian-oil'], modeledOilIds: [], coveredWeightShare: 0.996 }}
    />,
  );
  expect(subtitle()).toBe(
    'Percent of the weight of oils with data, based on fatty-acid data for 99.6% of recipe oil weight (no data: Abyssinian Oil).',
  );
});

// A caveat about a hidden note must appear exactly when one IS hidden. The panel used to show it
// whenever any oil weight was unprofiled, which over-fired badly: swept across the catalog at a
// 10% superfat that condition holds in all 9,702 recipe states while a note is actually withheld in
// 1,505, so roughly five readings in six carried a caveat about nothing. The panel now takes
// core's answer, computed by running the rancidity rules twice rather than by inspecting coverage.
test('names a held-back rancidity note, and stays quiet when none is held back', () => {
  const partial = { profile: PROFILE, coveragePercent: 88, missingOilIds: ['beeswax'], modeledOilIds: [], coveredWeightShare: 0.88 };
  const notes = () => screen.queryByRole('list', { name: /Rancidity/i });

  // Nothing withheld — an unprofiled oil on its own is NOT a reason to caveat.
  const { rerender } = render(<FattyAcidPanel insights={[]} withheldRancidity={[]} result={partial} />);
  expect(notes()).toBeNull();

  // A note genuinely held back: say so, and name the oil the reader would have to look up.
  rerender(
    <FattyAcidPanel insights={[]} withheldRancidity={['dos_risk_no_antioxidant']} result={partial} />,
  );
  expect(notes()!.textContent).toMatch(/held back/);
  expect(notes()!.textContent).toMatch(/counting Beeswax as carrying no polyunsaturates/);

  // Two oils read as a list, not as a repeated clause.
  rerender(
    <FattyAcidPanel
      insights={[]}
      withheldRancidity={['dos_risk_no_antioxidant']}
      result={{ ...partial, missingOilIds: ['beeswax', 'pine-tar'] }}
    />,
  );
  expect(notes()!.textContent).toMatch(/counting Beeswax and Pine Tar as carrying/);

  // Thin PROFILES hide nothing — an incomplete profile understates PUFA, it cannot inflate it.
  rerender(
    <FattyAcidPanel
      insights={[]}
      withheldRancidity={[]}
      result={{ profile: PROFILE, coveragePercent: 79.4, missingOilIds: [], modeledOilIds: [], coveredWeightShare: 1 }}
    />,
  );
  expect(notes()).toBeNull();
});
