import { describe, expect, it } from 'vitest';
import { withNewRow, withNewRows } from './rowOrder';

describe('where a new row goes', () => {
  it('goes first, and leaves the rest exactly as they were', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const next = withNewRow(rows, { id: 'c' });
    expect(next.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    // the existing rows are the same objects — adding edits nothing
    expect(next[1]).toBe(rows[0]);
    expect(next[2]).toBe(rows[1]);
    // and the original is untouched
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('adds a whole pack on top, in the order the pack was written', () => {
    expect(withNewRows([{ id: 'a' }], [{ id: 'x' }, { id: 'y' }]).map((r) => r.id))
      .toEqual(['x', 'y', 'a']);
  });

  it('starts a list', () => {
    expect(withNewRow([], { id: 'a' })).toEqual([{ id: 'a' }]);
    expect(withNewRows([], [])).toEqual([]);
  });
});
