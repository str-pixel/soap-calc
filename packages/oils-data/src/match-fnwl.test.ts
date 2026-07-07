import { describe, expect, it } from 'vitest';
import { buildFnwlIndex, findFnwlMatch } from './match-fnwl.js';
import type { FnwlRow } from '../src/parse-fnwl.js';

const rows: FnwlRow[] = [
  { name: 'Grape Seed Oil', sapRange: '180 - 200', sapNaoh: 0.135, sapKoh: 0.19 },
  { name: 'Rapeseed Oil', sapRange: '175', sapNaoh: 0.125, sapKoh: 0.175 },
  { name: 'Coconut Oil, RBD', sapRange: '250 - 264', sapNaoh: 0.183, sapKoh: 0.257 },
  { name: 'Fractionated Coconut Oil', sapRange: '335 - 360', sapNaoh: 0.248, sapKoh: 0.348 },
  { name: 'Olive Oil', sapRange: '184 - 196', sapNaoh: 0.135, sapKoh: 0.19 },
];

describe('findFnwlMatch', () => {
  const index = buildFnwlIndex(rows);

  it('does not match grapeseed to rapeseed', () => {
    const hit = findFnwlMatch('Grapeseed Oil', index);
    expect(hit?.name).toBe('Grape Seed Oil');
    expect(hit?.name).not.toBe('Rapeseed Oil');
  });

  it('matches coconut 76 deg via explicit alias to coconut oil', () => {
    const hit = findFnwlMatch('Coconut Oil, 76 deg', index);
    expect(hit?.name).toBe('Coconut Oil, RBD');
  });

  it('does not match olive pomace to regular olive (no alias)', () => {
    const hit = findFnwlMatch('Olive Oil  pomace', index);
    expect(hit).toBeUndefined();
  });

  it('returns undefined for unknown oils', () => {
    expect(findFnwlMatch('Emu Oil', index)).toBeUndefined();
  });
});
