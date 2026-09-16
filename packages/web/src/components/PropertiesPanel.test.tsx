// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isJudgedProperty, SOAP_PROPERTY_GUIDE, SOAP_PROPERTY_LABELS } from '@soap-calc/core';
import { PropertiesPanel } from './PropertiesPanel';
import { PROPERTY_ORDER } from '../lib/propertyOrder';
import type { RecipeIndexResult } from '../lib/calculateRecipeIndexes';

afterEach(cleanup);

const FULL = {
  properties: {
    properties: { hardness: 41, cleansing: 17, condition: 56, creamy: 24, bubbly: 17, longevity: 24 },
    coveragePercent: 100,
    missingOilIds: [],
  },
  indexes: { iodine: 58, ins: 147, coveragePercent: 100, missingOilIds: [] } as RecipeIndexResult,
};

/** A liquid-soap recipe's fatty acids. The table's qualities read 12 / 63 / 9.5 / 83 here; the
 *  C8/C10, palmitoleic and erucic entries must count toward none of them. */
const LS_FATTY = {
  profile: {
    lauric: 45, myristic: 18, palmitic: 9, stearic: 3, oleic: 7, linoleic: 2, linolenic: 0.5,
    ricinoleic: 20, caprylic: 8, capric: 7, palmitoleic: 1, erucic: 2,
  },
  coveragePercent: 100,
  missingOilIds: [] as string[],
  modeledOilIds: [] as string[],
  coveredWeightShare: 1,
};

test('flags modeled (derived-profile) oils, and stays silent without them', () => {
  const { rerender } = render(
    <PropertiesPanel
      result={FULL.properties}
      indexes={FULL.indexes}
      modeledOilIds={['soybean-27-5-hydrogenated']}
      process="cp"
    />,
  );
  expect(screen.getByText('Modeled')).toBeTruthy();
  // Names the oil via oilById, not the raw id.
  expect(screen.getByText(/Soybean, 27\.5% hydrogenated/)).toBeTruthy();

  // A measured-only recipe must not show the note at all.
  rerender(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  expect(screen.queryByText('Modeled')).toBeNull();
});

test('renders scores as unitless numbers (no % on property rows)', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  const hardness = screen.getByRole('meter', { name: /Hardness/i });
  expect(within(hardness).queryByText(/%/)).toBeNull();
  expect(screen.getByText('41')).toBeTruthy();
});

/** The panel opens on the meters, so the rows, their InfoTips and their out-of-range
 *  verdicts are on screen without a click. Kept as an explicit step anyway: these
 *  assertions are about the Meters view and must not silently ride on which view happens
 *  to be the default. (The readings are in the DOM either way, as role=meter.) */
const showMeters = () => fireEvent.click(screen.getByRole('tab', { name: 'Meters' }));

test('flags an out-of-range score and suppresses it under low coverage', () => {
  const outOfRange = {
    properties: {
      // cleansing 30 is above the 8–20 suggested band
      properties: { hardness: 41, cleansing: 30, condition: 56, creamy: 24, bubbly: 17, longevity: 24 },
      coveragePercent: 100,
      missingOilIds: [],
    },
    indexes: FULL.indexes,
  };
  const { rerender, container } = render(
    <PropertiesPanel result={outOfRange.properties} indexes={outOfRange.indexes} modeledOilIds={[]} process="cp" />,
  );
  showMeters(); // survives the rerender below — the component is updated, not remounted
  expect(container.querySelectorAll('.property-meters__value--outside').length).toBeGreaterThan(0);

  rerender(
    <PropertiesPanel
      result={{ ...outOfRange.properties, coveragePercent: 60 }}
      indexes={{ ...outOfRange.indexes, coveragePercent: 60 }}
      modeledOilIds={[]}
      process="cp"
    />,
  );
  expect(container.querySelectorAll('.property-meters__value--outside').length).toBe(0);
});

test('titles the panel per process: bar soap by default, soap for LS', () => {
  const { rerender } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  expect(screen.getByRole('heading', { name: 'Bar properties' })).toBeTruthy();

  rerender(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="ls" fattyAcids={LS_FATTY} />,
  );
  expect(screen.getByRole('heading', { name: 'Soap properties' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Bar properties' })).toBeNull();
  // Liquid soap's qualities carry no ranges, and the subtitle says so.
  expect(screen.getByText('Fatty-acid sums on a 0–100 scale, shown without target ranges')).toBeTruthy();
  expect(screen.queryByText(/bar-soap conventions/i)).toBeNull();
});

test('gives every property bar a guidance tooltip', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  showMeters();
  // Derive the terms from the labels so a rename in core keeps this test honest.
  for (const term of Object.values(SOAP_PROPERTY_LABELS)) {
    expect(screen.getByRole('button', { name: `About ${term}` })).toBeTruthy();
  }
});

test('notes that all soap cleans, via the cleansing row InfoTip guidance', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  showMeters();
  expect(
    screen.getByText(/All soap cleans — a low cleansing score means gentler, not ineffective\./),
  ).toBeTruthy();
});

// Liquid soap shows four liquid-soap qualities instead of the six bar scores (decided
// 2026-09-14), each an exact fatty-acid sum with no range and no verdict: core ls-qualities has
// the definitions and their source.
test('shows liquid soap its four qualities, as plain sums with no ranges or verdicts', () => {
  render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="ls" fattyAcids={LS_FATTY} />,
  );
  expect(screen.getAllByRole('meter').map((m) => m.getAttribute('aria-label'))).toEqual([
    'Body & lather stability: 12',
    'Cleansing: 63',
    'Conditioning: 10',
    'Lather: 83',
  ]);
  const panel = document.querySelector('section.panel')!;
  // None of the bar panel's apparatus: no bands, tick numbers, verdicts, legend, view switch,
  // radar, iodine or INS, and none of the six bar scores.
  expect(
    panel.querySelector(
      '.property-meter__band, .property-meter__tick, .property-meters__status, .property-legend, [role="tablist"], .property-radar, .recipe-indexes',
    ),
  ).toBeNull();
  expect(panel.textContent).not.toMatch(/too high|too low|in range|suggested|typical|target for|hardness|longevity|creamy|bubbly/i);
  // Each reading explains itself, in the app's own words.
  for (const term of ['Body & lather stability', 'Cleansing', 'Conditioning', 'Lather']) {
    expect(screen.getByRole('button', { name: `About ${term}` })).toBeTruthy();
  }
  expect(screen.getByText(/follows how readily the soap dissolves more than how well it cleans/)).toBeTruthy();
  // 09 below prints "Lauric + myristic (+C8–C10)", so for coconut the two panels differ (66
  // against 79); the tooltip says why.
  expect(screen.getByText(/C8–C10 acids in coconut oil are not counted/)).toBeTruthy();
  expect(screen.getByText(/in liquid soap it adds little lather/)).toBeTruthy();
  // Outside the bar panel's tab panel, so nothing points at tabs that are not there.
  expect(panel.querySelector('[role="tabpanel"], [aria-labelledby]')).toBeNull();
});

test('marks liquid soap qualities as estimates below the coverage cutoff', () => {
  render(
    <PropertiesPanel
      result={FULL.properties}
      indexes={FULL.indexes}
      modeledOilIds={[]}
      process="ls"
      fattyAcids={{ ...LS_FATTY, coveragePercent: 60, missingOilIds: ['beeswax'] }}
    />,
  );
  const meters = screen.getAllByRole('meter');
  expect(meters).toHaveLength(4);
  for (const m of meters) {
    expect(m.getAttribute('aria-label')).toMatch(/: estimated \d/);
    expect(m.textContent).toMatch(/^~\d/);
  }
  expect(Array.from(document.querySelectorAll('.properties-coverage')).map((p) => p.textContent)).toEqual([
    'Scores estimated from fatty-acid data for 60% of recipe oil weight (no data: Beeswax)',
  ]);
});

test('liquid soap without fatty-acid data names the oils that lack it', () => {
  render(
    <PropertiesPanel
      result={FULL.properties}
      indexes={FULL.indexes}
      modeledOilIds={[]}
      process="ls"
      fattyAcids={{ profile: null, coveragePercent: 0, missingOilIds: ['beeswax'], modeledOilIds: [], coveredWeightShare: 0 }}
    />,
  );
  expect(screen.queryAllByRole('meter')).toHaveLength(0);
  const hint = document.querySelector('.results-hint')!.textContent;
  expect(hint).toMatch(/\(no data: Beeswax\)/);
  expect(hint).not.toMatch(/hardness/i);
});

// The view switch keeps its choice in state. A recipe moved to liquid soap while the radar was
// showing must still show meters: liquid soap has no radar.
test('a recipe switched to liquid soap from the radar shows its meters', () => {
  const { rerender } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  expect(document.querySelector('.property-radar')).not.toBeNull();
  rerender(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="ls" fattyAcids={LS_FATTY} />,
  );
  expect(document.querySelector('.property-radar')).toBeNull();
  expect(document.querySelector('[role="tabpanel"]')).toBeNull();
  expect(screen.getAllByRole('meter')).toHaveLength(4);
});

// Coconut oil 92°F is a modeled profile and a common liquid soap oil: the note that says so must
// survive the switch to the liquid-soap layout.
test('keeps the modeled-oil note for liquid soap', () => {
  render(
    <PropertiesPanel
      result={FULL.properties}
      indexes={FULL.indexes}
      modeledOilIds={['coconut-oil-92']}
      process="ls"
      fattyAcids={LS_FATTY}
    />,
  );
  expect(screen.getByText('Modeled')).toBeTruthy();
  expect(screen.getByText(/Coconut Oil, 92°F/)).toBeTruthy();
});

test('shows the six bar scores, not the liquid soap qualities, for cold and hot process', () => {
  for (const process of ['cp', 'hp'] as const) {
    cleanup();
    render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process={process} />);
    expect(screen.getAllByRole('meter').map((m) => m.getAttribute('aria-label')!.split(':')[0])).toEqual([
      'Hardness', 'Cleansing', 'Conditioning', 'Creamy lather', 'Bubbly lather', 'Longevity',
    ]);
    expect(screen.queryByText(/Body & lather stability/)).toBeNull();
  }
});

test('renders no radar and a hint when there is no property data', () => {
  const empty = {
    properties: { properties: null, coveragePercent: 0, missingOilIds: [] },
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] } as RecipeIndexResult,
  };
  const { container } = render(
    <PropertiesPanel result={empty.properties} indexes={empty.indexes} modeledOilIds={[]} process="cp" />,
  );
  expect(container.querySelector('.property-radar')).toBeNull();
  expect(screen.getByText(/Add triglyceride oils/i)).toBeTruthy();
});

test('a score at the edge of the track anchors its label to the marker instead of clipping', () => {
  const edge = {
    ...FULL.properties,
    properties: { hardness: 97, cleansing: 3, condition: 56, creamy: 24, bubbly: 17, longevity: 24 },
  };
  render(<PropertiesPanel result={edge} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  showMeters();
  expect(screen.getByRole('meter', { name: /Cleansing/i }).className).toContain(
    'property-meters__value--start',
  );
  expect(screen.getByRole('meter', { name: /Hardness/i }).className).toContain(
    'property-meters__value--end',
  );
  expect(screen.getByRole('meter', { name: /Condition/i }).className).not.toMatch(
    /property-meters__value--(start|end)/,
  );
});

// A score is judged on the figure the row prints. Judged raw, a cleansing of 20.4 prints "20"
// against "Suggested 8–20" yet would read "Too high" in the same row — the verdict
// contradicting the number beside it. The same reading must be consistent in the radar, which prints the
// same rounded figure.
test('a score that rounds into its band is not flagged, in either view', () => {
  // Cleansing's band ends at 20, so 20.4 is the case: it prints "20", inside the range.
  const edge = {
    ...FULL.properties,
    properties: { hardness: 41, cleansing: 20.4, condition: 56, creamy: 24, bubbly: 20, longevity: 30 },
  };
  const { container } = render(
    <PropertiesPanel result={edge} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  showMeters();
  const row = screen.getByRole('meter', { name: /Cleansing/i }).closest('li')!;
  expect(row.querySelector('.property-meters__value')?.textContent).toBe('20');
  expect(row.querySelector('.property-meters__status')).toBeNull();
  expect(row.querySelector('.property-meter__marker--outside')).toBeNull();
  expect(row.querySelector('.property-meters__value--outside')).toBeNull();

  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const radar = container.querySelector('.property-radar')!.textContent!;
  expect(radar.slice(radar.indexOf('Cleansing'), radar.indexOf('Cleansing') + 20)).toContain('20');
  expect(radar.slice(radar.indexOf('Cleansing'), radar.indexOf('Cleansing') + 24)).toContain('In range');
});

test('a score that still rounds outside its band is flagged', () => {
  const edge = {
    ...FULL.properties,
    properties: { hardness: 41, cleansing: 20.5, condition: 56, creamy: 24, bubbly: 20, longevity: 30 },
  };
  render(<PropertiesPanel result={edge} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  showMeters();
  const row = screen.getByRole('meter', { name: /Cleansing/i }).closest('li')!;
  expect(row.querySelector('.property-meters__value')?.textContent).toBe('21');
  expect(row.querySelector('.property-meters__status')?.textContent).toBe('Too high');
});

// A band edge near either end of the track used to disappear: LOW and HIGH carry paper
// backing and a z-index so they win that collision, which was fine while no band started
// below 12 — and stopped being fine when cleansing's band moved to 8-20 and the 8 vanished
// under the word. The words named the ends of a scale the subtitle already names ("0-100
// scale"); the band edges are the numbers a maker actually reads, so they get the room.
test('numbers both band edges, with nothing at the ends of the track to hide them', () => {
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  showMeters();
  const row = screen.getByRole('meter', { name: /Cleansing/i }).closest('li')!;
  const ticks = Array.from(row.querySelectorAll('.property-meter__tick')).map((t) => t.textContent);
  expect(ticks).toEqual(['8', '20']);
  expect(container.querySelector('.property-meter__extreme')).toBeNull();
  expect(row.textContent).not.toMatch(/\bLow\b|\bHigh\b/);
});

test('defaults to the Meters view — rows visible, radar hidden', () => {
  // Meters first: each score against its own suggested band is the reading a maker acts
  // on, so it is on screen without a click. The radar is a step out, behind the switch.
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  expect(container.querySelector('.property-meters')).not.toBeNull();
  expect(container.querySelector('.property-radar')).toBeNull();
  // The readings stay reachable for assistive tech in either view.
  expect(screen.getByRole('meter', { name: /Hardness/i })).toBeTruthy();
});

test('wires the toggle tabs to the tabpanel via aria-controls / aria-labelledby', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  const panel = screen.getByRole('tabpanel');
  const metersTab = screen.getByRole('tab', { name: 'Meters' });
  const radarTab = screen.getByRole('tab', { name: 'Radar' });
  expect(metersTab.getAttribute('aria-controls')).toBe('property-tabpanel');
  expect(radarTab.getAttribute('aria-controls')).toBe('property-tabpanel');
  expect(panel.id).toBe('property-tabpanel');
  // Default view is Meters → the panel is labelled by the Meters tab.
  expect(panel.getAttribute('aria-labelledby')).toBe(metersTab.id);
  fireEvent.click(radarTab);
  expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(radarTab.id);
});

test('switching to Radar shows the chart and keeps the property readings for AT', () => {
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  expect(container.querySelector('.property-radar')).not.toBeNull();
  expect(container.querySelector('.property-meters')).toBeNull();
  // Readings remain reachable via role=meter even though the visual rows are hidden.
  expect(screen.getByRole('meter', { name: /Hardness/i })).toBeTruthy();
});

test('gives the active view-toggle tab tabIndex=0 and the other -1, in both views', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  const tab = (name: string) => screen.getByRole('tab', { name });
  const tabpanel = () => document.getElementById('property-tabpanel')!;
  // Default view is Meters. Its rows hold focusable info buttons, so the tabpanel itself
  // takes no tab stop.
  expect(tab('Meters').getAttribute('tabindex')).toBe('0');
  expect(tab('Radar').getAttribute('tabindex')).toBe('-1');
  expect(tabpanel().hasAttribute('tabindex')).toBe(false);
  // Switching moves the stop. This half was never checked, so a toggle whose tabindex never
  // moved passed.
  fireEvent.click(tab('Radar'));
  expect(tab('Radar').getAttribute('tabindex')).toBe('0');
  expect(tab('Meters').getAttribute('tabindex')).toBe('-1');
  // The radar has no focusable children, so the tabpanel takes the stop itself.
  expect(tabpanel().getAttribute('tabindex')).toBe('0');
});

test('ArrowRight on the Meters tab moves the roving tabindex to Radar and switches the view', async () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  const meters = screen.getByRole('tab', { name: 'Meters' }); // the default, so no click first
  meters.focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Radar' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tab', { name: 'Radar' }).getAttribute('tabindex')).toBe('0');
  expect(screen.getByRole('tab', { name: 'Meters' }).getAttribute('tabindex')).toBe('-1');
  expect(document.querySelector('.property-radar')).not.toBeNull();
  expect(document.querySelector('.property-meters')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Radar' }));
});

test('ArrowLeft on the Radar tab moves the roving tabindex back to Meters and switches the view', async () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' })); // start from the far end
  const radar = screen.getByRole('tab', { name: 'Radar' });
  radar.focus();
  await userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByRole('tab', { name: 'Meters' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tab', { name: 'Meters' }).getAttribute('tabindex')).toBe('0');
  expect(screen.getByRole('tab', { name: 'Radar' }).getAttribute('tabindex')).toBe('-1');
  expect(document.querySelector('.property-meters')).not.toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Meters' }));
});

// Two shades sit on every meter — the suggested range, and the darker target band from the
// formulation guide — and under the ranges shipped when this was written the target extended
// PAST the suggested band on cleansing, hardness and creamy (only creamy since 0212dff). With nothing naming them, a maker saw a dot inside the darkest
// shading on the track and a red "Too low" beside it, with no way to learn they are two
// different ranges. The original design carried this key and lost it.
test('names both bands, so the darker one is not an unexplained second shading', () => {
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  showMeters();
  const legend = container.querySelector('.property-legend')!;
  expect(legend).toBeTruthy();
  expect(legend.textContent).toMatch(/Suggested range/i);
  expect(legend.textContent).toMatch(/Target/i);
  // A swatch per band, so the key is readable without relying on the words alone.
  expect(legend.querySelector('.property-legend__swatch--suggested')).not.toBeNull();
  expect(legend.querySelector('.property-legend__swatch--preference')).not.toBeNull();
  // Each swatch travels with the words it keys, so a line break cannot strand one.
  const items = Array.from(legend.querySelectorAll('.property-legend__item'));
  expect(items.length).toBe(2);
  for (const item of items) {
    expect(item.querySelector('.property-legend__swatch')).not.toBeNull();
    expect(item.textContent?.trim().length).toBeGreaterThan(0);
  }
});

test('the radar keys only the band it actually draws', () => {
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const legend = container.querySelector('.property-legend')!;
  expect(legend.textContent).toMatch(/Suggested range/i);
  // The radar draws one zone; claiming a target swatch it never shades would be a lie.
  expect(legend.querySelector('.property-legend__swatch--preference')).toBeNull();
});

// Longevity carries a typical range but no verdict — see core's UNJUDGED_PROPERTIES. Its
// 25-50 has no published rationale, the one rationale-backed alternative flags the source
// books' own recipes, and 25-50 itself calls castile "too low" when a castile bar is
// famously long-lived. The number and the band still show; the judgement does not.
test('never flags longevity, at any value, in either view', () => {
  for (const longevity of [0, 17, 24, 26, 51, 100]) {
    cleanup();
    const r = {
      ...FULL.properties,
      properties: { hardness: 41, cleansing: 17, condition: 56, creamy: 24, bubbly: 20, longevity },
    };
    const { container } = render(
      <PropertiesPanel result={r} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
    );
    showMeters();
    const row = screen.getByRole('meter', { name: /Longevity/i }).closest('li')!;
    expect(row.querySelector('.property-meters__status'), `meters status at ${longevity}`).toBeNull();
    expect(row.querySelector('.property-meters__value--outside'), `red value at ${longevity}`).toBeNull();
    expect(row.querySelector('.property-meter__marker--outside'), `red dot at ${longevity}`).toBeNull();
    // The reading and its typical range are still both present. The meter's own figure, not
    // the row's text: every row contains a "0" inside "25–50", so that check passed at 0.
    const meter = screen.getByRole('meter', { name: /Longevity/i });
    expect(meter.textContent, `printed longevity at ${longevity}`).toBe(String(longevity));
    expect(meter.getAttribute('aria-valuenow')).toBe(String(longevity));
    expect(row.textContent).toMatch(/25–50/);

    fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
    const radar = container.querySelector('.property-radar')!.textContent!;
    const block = radar.slice(radar.indexOf('Longevity'), radar.indexOf('Longevity') + 30);
    expect(block, `radar verdict at ${longevity}`).not.toMatch(/Too low|Too high|In range/);
    expect(block).toMatch(/Typical/i);
  }
});

test('still flags every other property, so the exemption is longevity only', () => {
  // Each judged property in turn, pushed below and then above its suggested band while the
  // rest stay in range, must earn its verdict. The check this replaced looked at cleansing
  // alone, and passed with every other property left unjudged.
  const inBand = { hardness: 41, cleansing: 17, condition: 56, creamy: 24, bubbly: 20, longevity: 0 };
  const judged = PROPERTY_ORDER.filter((key) => isJudgedProperty(key));
  expect(judged).toHaveLength(5);
  for (const key of judged) {
    const guide = SOAP_PROPERTY_GUIDE[key];
    for (const [value, word] of [[guide.low - 5, 'Too low'], [guide.high + 5, 'Too high']] as const) {
      cleanup();
      const r = { ...FULL.properties, properties: { ...inBand, [key]: value } };
      render(<PropertiesPanel result={r} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
      showMeters();
      const statuses = Array.from(document.querySelectorAll('.property-meters__status')).map(
        (el) => [el.closest('li')!.querySelector('[role="meter"]')!.getAttribute('aria-label'), el.textContent],
      );
      expect(statuses, `${key} at ${value}`).toEqual([[`${SOAP_PROPERTY_LABELS[key]}: ${value}`, word]]);
    }
  }
});

// The radar's screen-reader list carried values and ranges but no verdicts, so switching to
// the radar silently dropped every "Too low" and "Too high" for a screen-reader user. Same
// verdicts as the Meters rows.
test('the radar screen-reader list carries the same verdicts as the meters', () => {
  const r = {
    ...FULL.properties,
    properties: { hardness: 41, cleansing: 30, condition: 56, creamy: 24, bubbly: 20, longevity: 0 },
  };
  const { rerender } = render(
    <PropertiesPanel result={r} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const item = (label: RegExp) =>
    Array.from(document.querySelectorAll('ul[aria-label="Bar property readings"] li')).find((li) =>
      label.test(li.textContent ?? ''),
    )!;
  expect(item(/Cleansing:/).textContent).toMatch(/Too high/);
  expect(item(/Hardness:/).textContent).not.toMatch(/Too (low|high)/);
  // Longevity is unjudged, so its item carries no verdict even at 0.
  expect(item(/Longevity:/).textContent).not.toMatch(/Too (low|high)/);
  // Under low coverage the Meters rows suppress verdicts; the list does too.
  rerender(
    <PropertiesPanel result={{ ...r, coveragePercent: 60 }} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  expect(item(/Cleansing:/).textContent).not.toMatch(/Too (low|high)/);
});

// Longevity is shown but not judged, so its range is a typical one, the way iodine and INS
// read. The screen-reader text called it "Suggested" in both views while the radar said
// "Typical". Every judged property keeps "Suggested".
test('longevity reads as a typical range to a screen reader, in both views', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  showMeters();
  const longevityRow = screen.getByRole('meter', { name: /Longevity/i }).closest('li')!;
  expect(longevityRow.textContent).toMatch(/Typical 25–50/);
  expect(longevityRow.textContent).not.toMatch(/Suggested/);
  expect(screen.getByRole('meter', { name: /Hardness/i }).closest('li')!.textContent).toMatch(/Suggested 30–60/);

  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const longevityItem = Array.from(
    document.querySelectorAll('ul[aria-label="Bar property readings"] li'),
  ).find((li) => /Longevity:/.test(li.textContent ?? ''))!;
  expect(longevityItem.textContent).toMatch(/Typical 25–50/);
  expect(longevityItem.textContent).not.toMatch(/Suggested/);
});

// With no oil carrying fatty-acid data the scores cannot be computed, and the maker needs to
// know which oils caused it, as the coverage line names them whenever there are scores.
test('names the oils without fatty-acid data when there are no scores', () => {
  const { rerender } = render(
    <PropertiesPanel
      result={{ properties: null, coveragePercent: 0, missingOilIds: ['beeswax', 'pine-tar'] }}
      indexes={FULL.indexes}
      modeledOilIds={[]}
      process="cp"
    />,
  );
  expect(document.querySelector('.results-hint')!.textContent).toMatch(/\(no data: Beeswax, Pine Tar\)/);
  rerender(
    <PropertiesPanel
      result={{ properties: null, coveragePercent: 0, missingOilIds: [] }}
      indexes={FULL.indexes}
      modeledOilIds={[]}
      process="cp"
    />,
  );
  expect(document.querySelector('.results-hint')!.textContent).not.toMatch(/no data/);
});

// For a liquid soap the panel is "Soap properties", but its lists were still announced as
// "Soap bar properties" and the radar caption spoke of "a bar". The lists take the panel's name.
test('names its lists after the panel, so a liquid soap is not called a bar', () => {
  const { rerender } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/Bar properties$/);
  expect(screen.getByRole('list', { name: 'Bar properties' })).toBeTruthy();

  rerender(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="ls" fattyAcids={LS_FATTY} />,
  );
  expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/Soap properties$/);
  expect(screen.getByRole('list', { name: 'Soap properties' })).toBeTruthy();
  expect(document.querySelector('section.panel')!.textContent).not.toMatch(/\bbars?\b/i);
});

// "% of recipe oils" was how complete the oils' fatty-acid data is, and the scores line sat
// under Iodine/INS as if it covered them. Each line now names what it covers.
test('words each coverage line by what it covers', () => {
  render(
    <PropertiesPanel
      result={{ ...FULL.properties, coveragePercent: 74.2, missingOilIds: ['beeswax'] }}
      indexes={{ ...FULL.indexes, coveragePercent: 95, missingOilIds: ['pine-tar'] }}
      modeledOilIds={[]}
      process="cp"
    />,
  );
  expect(Array.from(document.querySelectorAll('.properties-coverage')).map((p) => p.textContent)).toEqual([
    'Iodine/INS based on 95% of recipe oil weight (no data: Pine Tar)',
    'Scores estimated from fatty-acid data for 74% of recipe oil weight (no data: Beeswax)',
  ]);
});

test('prints no coverage line when the data is complete, allowing for float error', () => {
  render(
    <PropertiesPanel
      result={{ ...FULL.properties, coveragePercent: 99.89999999999999 }}
      indexes={{ ...FULL.indexes, coveragePercent: 99.89999999999999 }}
      modeledOilIds={[]}
      process="cp"
    />,
  );
  expect(document.querySelectorAll('.properties-coverage').length).toBe(0);
});

// The caption said a bar in range everywhere draws a circle. A score anywhere across its range
// sits somewhere across the ring's width, so an in-range recipe can zigzag between its edges.
test('the radar caption says where a score sits, and promises no circle', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const caption = document.querySelector('.fatty-radar__caption')!.textContent!;
  expect(caption).toMatch(/a score inside its range sits on the ring, below it inside, above it outside/);
  expect(caption).not.toMatch(/circle/);
});
