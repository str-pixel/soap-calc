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
    />,
  );
  expect(screen.getByText('Modeled')).toBeTruthy();
  // Names the oil via oilById, not the raw id.
  expect(screen.getByText(/Soybean, 27\.5% hydrogenated/)).toBeTruthy();

  // A measured-only recipe must not show the note at all.
  rerender(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />);
  expect(screen.queryByText('Modeled')).toBeNull();
});

test('renders scores as unitless numbers (no % on property rows)', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />);
  const hardness = screen.getByRole('meter', { name: /Hardness/i });
  expect(within(hardness).queryByText(/%/)).toBeNull();
  expect(screen.getByText('41')).toBeTruthy();
});

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
    <PropertiesPanel result={outOfRange.properties} indexes={outOfRange.indexes} modeledOilIds={[]} />,
  );
  expect(container.querySelectorAll('.property-bars__value--outside').length).toBeGreaterThan(0);

  rerender(
    <PropertiesPanel
      result={{ ...outOfRange.properties, coveragePercent: 60 }}
      indexes={{ ...outOfRange.indexes, coveragePercent: 60 }}
      modeledOilIds={[]}
    />,
  );
  expect(container.querySelectorAll('.property-bars__value--outside').length).toBe(0);
});

test('titles the panel per process: bar soap by default, soap for LS', () => {
  const { rerender } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />,
  );
  expect(screen.getByRole('heading', { name: 'Bar properties' })).toBeTruthy();

  rerender(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} isLiquidSoap />,
  );
  expect(screen.getByRole('heading', { name: 'Soap properties' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Bar properties' })).toBeNull();
  // The suggested ranges are bar-soap conventions — LS must say so.
  expect(screen.getByText(/ranges reflect bar-soap conventions/i)).toBeTruthy();
});

test('gives every property bar a guidance tooltip', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />);
  // Derive the terms from the labels so a rename in core keeps this test honest.
  for (const term of Object.values(SOAP_PROPERTY_LABELS)) {
    expect(screen.getByRole('button', { name: `About ${term}` })).toBeTruthy();
  }
});

test('notes that all soap cleans, via the cleansing row InfoTip guidance', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />);
  expect(
    screen.getByText(/All soap cleans — a low cleansing score means gentler, not ineffective\./),
  ).toBeTruthy();
});

test('appends the LS solubility note to the cleansing guidance when isLiquidSoap', () => {
  render(
    <PropertiesPanel
      result={FULL.properties}
      indexes={FULL.indexes}
      modeledOilIds={[]}
      isLiquidSoap
    />,
  );
  expect(
    screen.getByText(/In liquid soap this tracks solubility\/how well it dilutes, not harshness\./),
  ).toBeTruthy();
});

test('omits the LS solubility note for a bar-soap (CP/HP) recipe', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />);
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
    <PropertiesPanel result={empty.properties} indexes={empty.indexes} modeledOilIds={[]} />,
  );
  expect(container.querySelector('.property-radar')).toBeNull();
  expect(screen.getByText(/Add triglyceride oils/i)).toBeTruthy();
});

test('defaults to the Bars view — meters visible, radar hidden', () => {
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />,
  );
  expect(container.querySelector('.property-bars')).not.toBeNull();
  expect(container.querySelector('.property-radar')).toBeNull();
  expect(screen.getByRole('meter', { name: /Hardness/i })).toBeTruthy();
});

test('wires the toggle tabs to the tabpanel via aria-controls / aria-labelledby', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />);
  const panel = screen.getByRole('tabpanel');
  const barsTab = screen.getByRole('tab', { name: 'Bars' });
  const radarTab = screen.getByRole('tab', { name: 'Radar' });
  expect(barsTab.getAttribute('aria-controls')).toBe('property-tabpanel');
  expect(radarTab.getAttribute('aria-controls')).toBe('property-tabpanel');
  expect(panel.id).toBe('property-tabpanel');
  // Default view is Bars → the panel is labelled by the Bars tab.
  expect(panel.getAttribute('aria-labelledby')).toBe(barsTab.id);
  fireEvent.click(radarTab);
  expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(radarTab.id);
});

test('switching to Radar shows the chart and keeps the property readings for AT', () => {
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  expect(container.querySelector('.property-radar')).not.toBeNull();
  expect(container.querySelector('.property-bars')).toBeNull();
  // Readings remain reachable via role=meter even though the visual bars are hidden.
  expect(screen.getByRole('meter', { name: /Hardness/i })).toBeTruthy();
});

test('gives the active view-toggle tab tabIndex=0 and the other -1', () => {
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />,
  );
  // Default view is Bars.
  expect(screen.getByRole('tab', { name: 'Bars' }).getAttribute('tabindex')).toBe('0');
  expect(screen.getByRole('tab', { name: 'Radar' }).getAttribute('tabindex')).toBe('-1');
  expect(container).toBeTruthy();
});

test('ArrowLeft on the Bars tab moves the roving tabindex to Radar and switches the view', async () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />);
  const bars = screen.getByRole('tab', { name: 'Bars' });
  bars.focus();
  await userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByRole('tab', { name: 'Radar' }).getAttribute('aria-selected')).toBe('true');
  expect(document.querySelector('.property-radar')).not.toBeNull();
  expect(document.querySelector('.property-bars')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Radar' }));
});

test('ArrowRight on the Radar tab wraps the roving tabindex back to Bars and switches the view', async () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  const radar = screen.getByRole('tab', { name: 'Radar' });
  radar.focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Bars' }).getAttribute('aria-selected')).toBe('true');
  expect(document.querySelector('.property-bars')).not.toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Bars' }));
});
