import { describe, expect, it } from 'vitest';
import { parseCsvLine, parseFnwlCsv } from './parse-fnwl.js';

describe('parseFnwlCsv', () => {
  it('parses quoted oil names with commas', () => {
    const cols = parseCsvLine("'Almond Oil, Sweet',190 - 200,0.139,0.195,SKU1");
    expect(cols[0]).toBe('Almond Oil, Sweet');
    expect(cols[1]).toBe('190 - 200');
  });

  it('keeps highest sapKoh when duplicate normalized names exist', () => {
    const text = [
      'OIL,SAP,NAOH,KOH,PRODUCT_ID',
      "'Coconut Oil, RBD',250 - 264,0.183,0.257,SKU_LOW",
      "'Coconut Oil, Organic',248 - 268,0.184,0.258,SKU_HIGH",
    ].join('\n');

    const rows = parseFnwlCsv(text);
    const coconut = rows.find((r) => r.name.includes('Organic'));
    expect(coconut?.sapKoh).toBe(0.258);
  });
});
