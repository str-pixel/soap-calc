// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PropertyRadar } from './PropertyRadar';
import type { SoapPropertyName } from '@soap-calc/core';

afterEach(cleanup);

const ORDER: SoapPropertyName[] = [
  'hardness', 'cleansing', 'condition', 'creamy', 'bubbly', 'longevity',
];
const PROPS = {
  hardness: 41, cleansing: 17, condition: 56, creamy: 24, bubbly: 17, longevity: 24,
};

test('renders an aria-hidden svg with a recipe polygon', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage={false} />,
  );
  const svg = container.querySelector('svg');
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(container.querySelector('[data-testid="radar-recipe"]')).toBeTruthy();
});

test('dashes the recipe polygon under low coverage', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage />,
  );
  const recipe = container.querySelector('[data-testid="radar-recipe"]') as SVGPolygonElement;
  expect(recipe.style.strokeDasharray).toBe('4 3');
});

test('draws a solid recipe polygon when coverage is not low', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage={false} />,
  );
  const recipe = container.querySelector('[data-testid="radar-recipe"]') as SVGPolygonElement;
  expect(recipe.style.strokeDasharray === 'none' || recipe.style.strokeDasharray === '').toBe(true);
});

test('labels each axis with its rounded value and a range verdict', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage={false} />,
  );
  const text = container.textContent ?? '';
  expect(text).toContain('Hardness');
  expect(text).toContain('41'); // hardness value
  expect(text).toMatch(/In range|Too low|Too high/);
});

test('flags low coverage with tilde values and Low data verdicts, not range verdicts', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage />,
  );
  const text = container.textContent ?? '';
  expect(text).toContain('~41');
  expect(text).toContain('Low data');
  expect(text).not.toMatch(/Too low|Too high|In range/);
});
