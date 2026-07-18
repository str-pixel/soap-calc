// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
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
