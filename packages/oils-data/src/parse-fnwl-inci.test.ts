import { describe, expect, it } from 'vitest';
import { buildFnwlInciIndex, parseFnwlInciCsv } from './parse-fnwl-inci.js';
import { normalizeInciName } from './normalize-inci.js';

describe('parseFnwlInciCsv', () => {
  it('parses tab-delimited INCI rows', () => {
    const text = [
      'PRODUCT\tINCI\tPRODUCT_ID',
      'Oil: Olive\tOlea Europaea (Olive) Fruit Oil\toilolivecprfes64',
    ].join('\n');

    const rows = parseFnwlInciCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].inciName).toBe('Olea Europaea (Olive) Fruit Oil');
    expect(rows[0].productId).toBe('oilolivecprfes64');
  });

  it('indexes by product id', () => {
    const index = buildFnwlInciIndex([
      { productName: 'Oil: Olive', inciName: 'Olea Europaea (Olive) Fruit Oil', productId: 'oilolive' },
    ]);
    expect(index.get('oilolive')?.inciName).toContain('Olea');
  });
});

describe('normalizeInciName', () => {
  it('normalizes case and spacing', () => {
    expect(normalizeInciName('Olea Europaea (Olive) Fruit Oil')).toBe(
      'olea europaea (olive) fruit oil',
    );
  });
});
