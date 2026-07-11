// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
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

test('renders scores as unitless numbers (no % on property rows)', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} />);
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
    <PropertiesPanel result={outOfRange.properties} indexes={outOfRange.indexes} />,
  );
  expect(container.querySelectorAll('.property-bars__value--outside').length).toBeGreaterThan(0);

  rerender(
    <PropertiesPanel
      result={{ ...outOfRange.properties, coveragePercent: 60 }}
      indexes={{ ...outOfRange.indexes, coveragePercent: 60 }}
    />,
  );
  expect(container.querySelectorAll('.property-bars__value--outside').length).toBe(0);
});

test('renders no radar and a hint when there is no property data', () => {
  const empty = {
    properties: { properties: null, coveragePercent: 0, missingOilIds: [] },
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] } as RecipeIndexResult,
  };
  const { container } = render(<PropertiesPanel result={empty.properties} indexes={empty.indexes} />);
  expect(container.querySelector('.property-radar')).toBeNull();
  expect(screen.getByText(/Add triglyceride oils/i)).toBeTruthy();
});
