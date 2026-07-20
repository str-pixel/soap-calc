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

test('combobox advertises its popup type', () => {
  render(<OilPicker value="" onChange={() => {}} />);
  const input = screen.getByRole('combobox');
  expect(input.getAttribute('aria-haspopup')).toBe('listbox');
});

test('clicking the still-focused input after a pick reopens the list', () => {
  render(<OilPicker value="" onChange={() => {}} />);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'olive' } });
  const option = within(screen.getByRole('listbox')).getAllByRole('option')[0];
  fireEvent.mouseDown(option);
  fireEvent.click(option);
  expect(screen.queryByRole('listbox')).toBeNull(); // picked → closed, focus retained
  fireEvent.click(input); // no focus event fires — input never blurred
  expect(screen.queryByRole('listbox')).not.toBeNull();
});

test('ArrowUp from the unhighlighted state wraps to the last option', () => {
  render(<OilPicker value="" onChange={() => {}} />);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'olive' } });
  const options = within(screen.getByRole('listbox')).getAllByRole('option');
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.getAttribute('aria-activedescendant')).toBe(options[options.length - 1].id);
});

test('aria-controls only references the listbox while it exists', () => {
  render(<OilPicker value="" onChange={() => {}} />);
  const input = screen.getByRole('combobox');
  expect(input.getAttribute('aria-controls')).toBeNull(); // closed → no dangling idref
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'olive' } });
  expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
});
