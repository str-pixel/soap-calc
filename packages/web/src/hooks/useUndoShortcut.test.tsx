// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useUndoShortcut } from './useUndoShortcut';

afterEach(cleanup);

function Harness({ undo, redo }: { undo: () => void; redo: () => void }) {
  useUndoShortcut(undo, redo);
  return <input aria-label="field" />;
}

test('Cmd/Ctrl+Z outside an input fires undo', () => {
  const undo = vi.fn();
  const redo = vi.fn();
  render(<Harness undo={undo} redo={redo} />);
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
  expect(undo).toHaveBeenCalledTimes(1);
  expect(redo).not.toHaveBeenCalled();
});

test('Cmd/Ctrl+Shift+Z outside an input fires redo', () => {
  const undo = vi.fn();
  const redo = vi.fn();
  render(<Harness undo={undo} redo={redo} />);
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true });
  expect(redo).toHaveBeenCalledTimes(1);
  expect(undo).not.toHaveBeenCalled();
});

test('yields to a focused input (native text undo untouched)', () => {
  const undo = vi.fn();
  const redo = vi.fn();
  const { getByLabelText } = render(<Harness undo={undo} redo={redo} />);
  const input = getByLabelText('field');
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(undo).not.toHaveBeenCalled();
});

test('ignores plain z without a modifier', () => {
  const undo = vi.fn();
  const redo = vi.fn();
  render(<Harness undo={undo} redo={redo} />);
  fireEvent.keyDown(document.body, { key: 'z' });
  expect(undo).not.toHaveBeenCalled();
});

test('calls the latest handler after a re-render (listener binds once, forwards via ref)', () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender } = render(<Harness undo={first} redo={() => {}} />);
  rerender(<Harness undo={second} redo={() => {}} />);
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});
