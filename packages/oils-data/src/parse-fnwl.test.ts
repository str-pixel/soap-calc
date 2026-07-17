import { describe, expect, it } from 'vitest';
import { parseCsvLine, parseFnwlCsv } from './parse-fnwl.js';

describe('parseFnwlCsv', () => {
  it('parses quoted oil names with commas', () => {
    const cols = parseCsvLine("'Almond Oil, Sweet',190 - 200,0.139,0.195,SKU1");
    expect(cols[0]).toBe('Almond Oil, Sweet');
    expect(cols[1]).toBe('190 - 200');
  });

  it('keeps the median sapKoh among duplicate rows (not the high outlier)', () => {
    // Real FNWL has multiple rows per oil; taking the max latched onto outliers
    // (e.g. avocado's 177–226 row). The median is the representative value.
    const text = [
      'OIL,SAP,NAOH,KOH,PRODUCT_ID',
      "'Avocado Oil',177 - 226,0.144,0.202,SKU_HIGH",
      "'Avocado Oil',185 - 200,0.138,0.188,SKU_MID",
      "'Avocado Oil',170 - 200,0.132,0.185,SKU_LOW",
    ].join('\n');

    const rows = parseFnwlCsv(text);
    expect(rows).toHaveLength(1); // deduped to one representative row
    expect(rows[0].sapKoh).toBe(0.188); // median, not the 0.202 high outlier
  });
});
