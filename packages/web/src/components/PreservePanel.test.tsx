// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PreservePanel } from './PreservePanel';

afterEach(cleanup);

test('explains why diluted LS needs a preservative and cites no dose numbers', () => {
  render(<PreservePanel />);
  expect(screen.getByText(/water activity/i)).toBeTruthy();
  expect(screen.getByText(/verify.*supplier/i)).toBeTruthy();
  // guard the DO-NOT-SHIP rule: no percentage figures in the panel
  expect(document.body.textContent).not.toMatch(/\d+(\.\d+)?\s*%/);
});
