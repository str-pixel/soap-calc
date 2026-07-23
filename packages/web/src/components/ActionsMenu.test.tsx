// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActionsMenu } from './ActionsMenu';

afterEach(cleanup);

function setup(overrides: Partial<Parameters<typeof ActionsMenu>[0]> = {}) {
  const props = {
    onNew: vi.fn(),
    onExport: vi.fn(),
    onPrint: vi.fn(),
    onImport: vi.fn(),
    canPrint: true,
    ...overrides,
  };
  render(<ActionsMenu {...props} />);
  return props;
}

test('opens the menu and lists the four actions', () => {
  setup();
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  expect(screen.getByRole('menu')).toBeTruthy();
  for (const name of ['New recipe', 'Export', 'Print batch sheet', 'Import']) {
    expect(screen.getByRole('menuitem', { name })).toBeTruthy();
  }
});

test('each item fires its handler and closes the menu', () => {
  const props = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
  expect(props.onExport).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).toBeNull();
});

test('disables Print batch sheet when canPrint is false', () => {
  const props = setup({ canPrint: false });
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  const print = screen.getByRole('menuitem', { name: 'Print batch sheet' }) as HTMLButtonElement;
  expect(print.disabled).toBe(true);
  fireEvent.click(print);
  expect(props.onPrint).not.toHaveBeenCalled();
});
