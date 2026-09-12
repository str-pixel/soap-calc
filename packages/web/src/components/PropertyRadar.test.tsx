// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PropertyRadar } from './PropertyRadar';
import { SOAP_PROPERTY_GUIDE, type SoapPropertyName } from '@soap-calc/core';

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

// The radar must show the range it judges against, not just the scores. Without a band the
// chart gave a maker no way to see WHERE the suggested range sits on an axis — it relied
// entirely on reading the verdict text under each label — while the fatty-acid radar beside
// it on the page shades its range as a ring. Same rule in both: the shaded region is exactly
// the region the verdict is computed against.
test('shades the suggested range as a zone between the low and high polygons', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage={false} />,
  );
  const band = container.querySelector('[data-testid="radar-band"]') as SVGPathElement;
  expect(band).toBeTruthy();
  // Two subpaths — outer boundary then inner — punched with evenodd so the middle is hollow.
  const d = band.getAttribute('d')!;
  expect(d.match(/M/g)?.length).toBe(2);
  expect(d.match(/Z/g)?.length).toBe(2);
  expect(band.getAttribute('fill-rule')).toBe('evenodd');
});

test('the band zone sits at each axis guide band, scaled like the recipe polygon', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage={false} />,
  );
  const svg = container.querySelector('svg')!;
  const cx = Number(svg.getAttribute('data-cx'));
  const cy = Number(svg.getAttribute('data-cy'));
  const R = Number(svg.getAttribute('data-r'));
  const d = (container.querySelector('[data-testid="radar-band"]') as SVGPathElement).getAttribute('d')!;
  const [outer, inner] = d.split('M').filter(Boolean).map((sub) =>
    sub.replace('Z', '').trim().split(' ').map((pt) => {
      const [x, y] = pt.split(',').map(Number);
      return Math.hypot(x - cx, y - cy) / R;
    }),
  );
  // Axis 0 is hardness: guide 29–54 on the 0–100 radius.
  expect(outer[0]).toBeCloseTo(SOAP_PROPERTY_GUIDE.hardness.high / 100, 5);
  expect(inner[0]).toBeCloseTo(SOAP_PROPERTY_GUIDE.hardness.low / 100, 5);
  // Axis 1 is cleansing: 12–22. Every axis carries its OWN band, which is why this is a
  // zone between two polygons and not one circle.
  expect(outer[1]).toBeCloseTo(SOAP_PROPERTY_GUIDE.cleansing.high / 100, 5);
  expect(inner[1]).toBeCloseTo(SOAP_PROPERTY_GUIDE.cleansing.low / 100, 5);
  expect(outer.length).toBe(ORDER.length);
});
