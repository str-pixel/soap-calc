import { describe, expect, it } from 'vitest';
import { buildFnwlIndex, findFnwlMatch } from './match-fnwl.js';
import { parseFnwlCsv } from './parse-fnwl.js';
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

  it('matches tamanu via explicit FNWL alias', () => {
    const tamanuRows: FnwlRow[] = [
      ...rows,
      {
        name: 'Tamanu Foraha Oil',
        sapRange: '185 - 205',
        sapNaoh: 0.139,
        sapKoh: 0.195,
        productId: 'OILTAMANUCPVIRIN728',
      },
    ];
    const tamanuIndex = buildFnwlIndex(tamanuRows);
    const hit = findFnwlMatch('Tamanu Oil, kamani', tamanuIndex);
    expect(hit?.name).toBe('Tamanu Foraha Oil');
    expect(hit?.productId).toBe('OILTAMANUCPVIRIN728');
  });
});

describe('exact-name preference inside a name group', () => {
  it("returns the row literally named as the catalog oil, not the group's lower-middle", () => {
    // Real FNWL: 'Baobab Oil' 0.19 and 'Baobab Oil, Unrefined' 0.173 normalize to one key.
    const text = [
      'OIL,SAP,NAOH,KOH,PRODUCT_ID',
      "'Baobab Oil',180 - 200,0.135,0.19,OILBAOBABCPZW789",
      "'Baobab Oil, Unrefined',140 - 205,0.123,0.173,OILBAOBABEXPFEU614",
    ].join('\n');
    const index = buildFnwlIndex(parseFnwlCsv(text));
    expect(findFnwlMatch('Baobab Oil', index)?.sapKoh).toBe(0.19);
    // No exact name → the documented median rule still applies.
    expect(findFnwlMatch('Baobab Oil, Organic', index)?.sapKoh).toBe(0.173);
  });

  it('takes the median among several rows that all carry the exact name (kukui has four)', () => {
    const text = [
      'OIL,SAP,NAOH,KOH,PRODUCT_ID',
      // A non-median row FIRST in chart order, so a first-match implementation fails this.
      "'Kukui Nut Oil',175 - 195,0.132,0.185,K2",
      "'Kukui Nut Oil',180 - 200,0.135,0.19,K1",
      "'Kukui Nut Oil',185 - 205,0.139,0.195,K3",
    ].join('\n');
    const index = buildFnwlIndex(parseFnwlCsv(text));
    expect(findFnwlMatch('Kukui Nut Oil', index)?.productId).toBe('K1'); // the 0.19 median row
  });
});

describe('review fixes 2026-09-21: the exact-name preference survives the alias path', () => {
  it('prefers the chart row the ALIAS names, though the alias carries no punctuation', () => {
    // LEGACY_TO_FNWL_ALIASES stores already-normalized names ('jojoba oil natural'), while
    // the chart carries the raw product name ('Jojoba Oil, Natural'). Comparing the two
    // verbatim can never match, so every alias-routed oil silently fell back to the group's
    // median representative — the rule fired only for aliases that survive normalization
    // byte-for-byte (grape seed, lard).
    const text = [
      'OIL,SAP,NAOH,KOH,PRODUCT_ID',
      "'Jojoba Oil, Natural',95 - 100,0.069,0.097,J-NAT",
      // 'organic' is stripped by normalizeOilName, so this lands in the SAME group.
      "'Jojoba Oil, Natural Organic',85 - 95,0.063,0.089,J-ORG",
    ].join('\n');
    const index = buildFnwlIndex(parseFnwlCsv(text));
    // The legacy display name normalizes to 'jojoba oil', which the alias table bridges.
    const hit = findFnwlMatch('Jojoba Oil (a Liquid Wax Ester)', index);
    expect(hit?.productId).toBe('J-NAT');
    expect(hit?.sapKoh).toBe(0.097);
  });
});
