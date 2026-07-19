// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TroubleshootingPanel } from './TroubleshootingPanel';

afterEach(cleanup);

test('HP shows the "won\'t gel" entry with symptom, cause, and fix', () => {
  render(<TroubleshootingPanel process="hp" />);
  expect(screen.getByText(/won't gel/)).toBeTruthy();
  expect(screen.getByText(/Not enough heat is being retained/)).toBeTruthy();
  expect(screen.getByText(/Switch to a lower, longer heat-assisted cook/)).toBeTruthy();
});

test('CP shows CP-specific entries, not HP or LS entries', () => {
  render(<TroubleshootingPanel process="cp" />);
  expect(screen.getByText(/Ashy white film/)).toBeTruthy();
  expect(screen.queryByText(/won't gel/)).toBeNull();
  expect(screen.queryByText(/Chill haze/)).toBeNull();
});

test('switching process shows that process\'s entries', () => {
  const { rerender } = render(<TroubleshootingPanel process="cp" />);
  expect(screen.getByText(/Ashy white film/)).toBeTruthy();

  rerender(<TroubleshootingPanel process="ls" />);
  expect(screen.queryByText(/Ashy white film/)).toBeNull();
  expect(screen.getByText(/turns cloudy once it cools/)).toBeTruthy();
});

test('renders each entry as a collapsible details/summary element', () => {
  render(<TroubleshootingPanel process="cp" />);
  const details = document.querySelectorAll('details');
  expect(details.length).toBeGreaterThanOrEqual(3);
  expect(screen.getByText(/Ashy white film/).closest('summary')).toBeTruthy();
});
