// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SOAP_PROPERTY_LABELS } from '@soap-calc/core';
import { PropertiesPanel } from './PropertiesPanel';
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
      // cleansing 30 is above the 12–22 suggested band
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
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="ls" />,
  );
  expect(screen.getByRole('heading', { name: 'Soap properties' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Bar properties' })).toBeNull();
  // The suggested ranges are bar-soap conventions — LS must say so.
  expect(screen.getByText(/ranges reflect bar-soap conventions/i)).toBeTruthy();
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

test('appends the LS solubility note to the cleansing guidance for LS process', () => {
  render(
    <PropertiesPanel
      result={FULL.properties}
      indexes={FULL.indexes}
      modeledOilIds={[]}
      process="ls"
    />,
  );
  showMeters();
  expect(
    screen.getByText(/In liquid soap this tracks solubility\/how well it dilutes, not harshness\./),
  ).toBeTruthy();
});

test('omits the LS solubility note for a bar-soap (CP/HP) recipe', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  expect(
    screen.queryByText(/In liquid soap this tracks solubility/),
  ).toBeNull();
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

// A score is judged on the figure the row prints. Judged raw, 22.4 printed "22" against
// "Suggested 12–22" and read "Too high" in the same row — the verdict contradicting the
// number beside it. The same reading must be consistent in the radar, which prints the
// same rounded figure.
test('a score that rounds into its band is not flagged, in either view', () => {
  const edge = {
    ...FULL.properties,
    properties: { hardness: 41, cleansing: 22.4, condition: 56, creamy: 24, bubbly: 20, longevity: 30 },
  };
  const { container } = render(
    <PropertiesPanel result={edge} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  showMeters();
  const row = screen.getByRole('meter', { name: /Cleansing/i }).closest('li')!;
  expect(row.querySelector('.property-meters__value')?.textContent).toBe('22');
  expect(row.querySelector('.property-meters__status')).toBeNull();
  expect(row.querySelector('.property-meter__marker--outside')).toBeNull();
  expect(row.querySelector('.property-meters__value--outside')).toBeNull();

  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const radar = container.querySelector('.property-radar')!.textContent!;
  expect(radar.slice(radar.indexOf('Cleansing'), radar.indexOf('Cleansing') + 20)).toContain('22');
  expect(radar.slice(radar.indexOf('Cleansing'), radar.indexOf('Cleansing') + 24)).toContain('In range');
});

test('a score that still rounds outside its band is flagged', () => {
  const edge = {
    ...FULL.properties,
    properties: { hardness: 41, cleansing: 22.5, condition: 56, creamy: 24, bubbly: 20, longevity: 30 },
  };
  render(<PropertiesPanel result={edge} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  showMeters();
  const row = screen.getByRole('meter', { name: /Cleansing/i }).closest('li')!;
  expect(row.querySelector('.property-meters__value')?.textContent).toBe('23');
  expect(row.querySelector('.property-meters__status')?.textContent).toBe('Too high');
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

test('gives the active view-toggle tab tabIndex=0 and the other -1', () => {
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />,
  );
  // Default view is Meters.
  expect(screen.getByRole('tab', { name: 'Meters' }).getAttribute('tabindex')).toBe('0');
  expect(screen.getByRole('tab', { name: 'Radar' }).getAttribute('tabindex')).toBe('-1');
  expect(container).toBeTruthy();
});

test('ArrowRight on the Meters tab moves the roving tabindex to Radar and switches the view', async () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} process="cp" />);
  const meters = screen.getByRole('tab', { name: 'Meters' }); // the default, so no click first
  meters.focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Radar' }).getAttribute('aria-selected')).toBe('true');
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
  expect(document.querySelector('.property-meters')).not.toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Meters' }));
});

// Two shades sit on every meter — the suggested range, and the darker target band from the
// formulation guide — and for cleansing, hardness and creamy the target extends PAST the
// suggested band's edge. With nothing naming them, a maker saw a dot inside the darkest
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
