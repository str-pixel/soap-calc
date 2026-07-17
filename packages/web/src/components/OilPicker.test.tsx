// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { OilPicker } from './OilPicker';

afterEach(cleanup);

function openWith(query: string) {
  render(<OilPicker value="" onChange={() => {}} />);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  return screen.getByRole('listbox');
}

test('marks a derived-profile oil with a "Modeled" tag', () => {
  const list = openWith('soybean');
  const modeled = within(list).getByRole('option', { name: /Soybean, 27\.5% hydrogenated/ });
  expect(within(modeled).getByText('Modeled')).toBeTruthy();
});

test('does not mark measured oils as modeled', () => {
  const list = openWith('olive');
  // Olive oils carry measured profiles — no option in these results should be tagged Modeled.
  expect(within(list).queryByText('Modeled')).toBeNull();
});
