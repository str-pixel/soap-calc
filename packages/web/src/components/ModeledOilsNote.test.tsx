// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ModeledOilsNote } from './ModeledOilsNote';

afterEach(cleanup);

test('renders nothing when no oil is modeled', () => {
  const { container } = render(<ModeledOilsNote oilIds={[]} />);
  expect(container.firstChild).toBeNull();
});

test('names one modeled oil with singular copy', () => {
  render(<ModeledOilsNote oilIds={['soybean-27-5-hydrogenated']} />);
  expect(screen.getByText('Modeled')).toBeTruthy();
  // Resolved through oilDisplayName, not shown as a raw id.
  expect(screen.getByText(/Soybean, 27\.5% hydrogenated/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'About Modeled oil' })).toBeTruthy();
  expect(screen.getByRole('tooltip').textContent).toMatch(/This oil’s fatty-acid profile is a/);
});

test('switches to plural copy when several oils are modeled', () => {
  const { container } = render(
    <ModeledOilsNote oilIds={['soybean-27-5-hydrogenated', 'coconut-oil-92']} />,
  );
  // Both named, so the reader knows which scores are estimates.
  expect(container.textContent).toMatch(/Soybean, 27\.5% hydrogenated/);
  expect(container.textContent).toMatch(/Coconut/);
  // Singular pronouns over a multi-oil list read as a copy bug.
  expect(screen.getByRole('button', { name: 'About Modeled oils' })).toBeTruthy();
  expect(screen.getByRole('tooltip').textContent).toMatch(/These oils’ fatty-acid profiles are/);
});
