import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inciInInventory, inventoryKey, loadCosingInventory } from './cosing-inventory.js';

describe('inventoryKey', () => {
  it('strips the common-name parenthetical and normalizes casing/spacing', () => {
    expect(inventoryKey('Prunus Avium (Cherry) Seed Oil')).toBe(
      inventoryKey('PRUNUS AVIUM SEED OIL'),
    );
  });

  it('does not collapse Kernel Oil and Seed Oil to the same key', () => {
    expect(inventoryKey('Prunus Avium (Cherry) Kernel Oil')).not.toBe(
      inventoryKey('Prunus Avium (Cherry) Seed Oil'),
    );
  });
});

describe('inciInInventory', () => {
  const inv = {
    count: 2,
    normalized: new Set([inventoryKey('PRUNUS AVIUM SEED OIL'), inventoryKey('OLIVE OIL')]),
  };

  it('matches regardless of parenthetical/casing', () => {
    expect(inciInInventory('Prunus Avium (Cherry) Seed Oil', inv)).toBe(true);
  });

  it('rejects a name absent from the inventory (Kernel vs Seed)', () => {
    expect(inciInInventory('Prunus Avium (Cherry) Kernel Oil', inv)).toBe(false);
  });
});

describe('loadCosingInventory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cosing-inv-'));

  it('returns null for a missing file (legitimate degraded state, not a crash)', () => {
    expect(loadCosingInventory(join(dir, 'absent.json'))).toBeNull();
  });

  it('throws on a truncated snapshot instead of returning an empty set', () => {
    const p = join(dir, 'tiny.json');
    writeFileSync(p, JSON.stringify({ inciNames: ['OLIVE OIL'] }));
    expect(() => loadCosingInventory(p)).toThrow(/truncated/i);
  });

  it('throws on malformed JSON', () => {
    const p = join(dir, 'bad.json');
    writeFileSync(p, '{not valid json');
    expect(() => loadCosingInventory(p)).toThrow();
  });

  it('throws when inciNames is not an array', () => {
    const p = join(dir, 'shape.json');
    writeFileSync(p, JSON.stringify({ inciNames: 'nope' }));
    expect(() => loadCosingInventory(p)).toThrow(/truncated/i);
  });

  it('loads a snapshot at or above the floor', () => {
    const p = join(dir, 'ok.json');
    writeFileSync(
      p,
      JSON.stringify({ inciNames: Array.from({ length: 1000 }, (_, i) => `NAME ${i}`) }),
    );
    const inv = loadCosingInventory(p);
    expect(inv?.count).toBe(1000);
    expect(inciInInventory('Name 5', inv!)).toBe(true);
    expect(inciInInventory('Missing Name', inv!)).toBe(false);
  });
});
