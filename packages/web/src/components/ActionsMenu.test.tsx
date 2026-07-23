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

test('ArrowDown on the trigger opens the menu and focuses the first item', () => {
  setup();
  const trigger = screen.getByRole('button', { name: 'Actions' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(screen.getByRole('menu')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New recipe' }));
});

test('Arrow keys rove between enabled items, skipping the disabled Print item and wrapping', () => {
  setup({ canPrint: false });
  const trigger = screen.getByRole('button', { name: 'Actions' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // opens, focus New recipe
  const menu = screen.getByRole('menu');
  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Export' }));
  fireEvent.keyDown(menu, { key: 'ArrowDown' }); // Print is disabled → skip to Import
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Import' }));
  fireEvent.keyDown(menu, { key: 'ArrowDown' }); // wraps back to the first
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New recipe' }));
});

test('Escape closes the menu and returns focus to the trigger', () => {
  setup();
  const trigger = screen.getByRole('button', { name: 'Actions' });
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test('choosing an item runs its handler and returns focus to the trigger', () => {
  const props = setup();
  const trigger = screen.getByRole('button', { name: 'Actions' });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
  expect(props.onExport).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
