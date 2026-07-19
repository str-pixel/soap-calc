import { describe, expect, it } from 'vitest';
import type { ExternalReferenceTable } from './external-references.js';
import {
  classifyExternalReferenceDeviations,
  KNOWN_EXTERNAL_REFERENCE_DEVIATIONS,
} from './external-reference-deviations.js';

const REFS: ExternalReferenceTable = {
  multi: { // 2-source iodine band [40,50], 2-source sap band [190,200]
    iodine: { min: 40, max: 50, sourceCount: 2, sources: ['a', 'b'] },
    sapKoh: { min: 190, max: 200, sourceCount: 2, sources: ['a', 'b'] },
  },
  lone: { iodine: { min: 100, max: 100, sourceCount: 1, sources: ['a'] } },
};
const oil = (over: Partial<{ id: string; iodine: number; sapMgKohPerGram: number }>) => ({
  id: 'multi',
  ...over,
});

describe('classifyExternalReferenceDeviations', () => {
  it('does not flag a value inside the band', () => {
    expect(classifyExternalReferenceDeviations([oil({ iodine: 45 })], REFS)).toEqual([]);
  });

  it('does not flag a value within per-side tolerance of the edge', () => {
    // high edge 50 + T_high(max(5, 0.05*50)=5) = 55; 54 is inside
    expect(classifyExternalReferenceDeviations([oil({ iodine: 54 })], REFS)).toEqual([]);
  });

  it('flags a value above band+tolerance as warn', () => {
    const [d] = classifyExternalReferenceDeviations([oil({ iodine: 60 })], REFS);
    expect(d).toMatchObject({ id: 'multi', property: 'iodine', stored: 60, tier: 'warn' });
    expect(d.deltaOutside).toBeCloseTo(5, 5); // 60 - 55
  });

  it('flags a value below band−tolerance as warn', () => {
    const [d] = classifyExternalReferenceDeviations([oil({ iodine: 30 })], REFS);
    expect(d).toMatchObject({ property: 'iodine', tier: 'warn' });
    expect(d.deltaOutside).toBeCloseTo(-5, 5); // 30 - 35
  });

  it('reports iodine and sap independently for one oil', () => {
    const out = classifyExternalReferenceDeviations([oil({ iodine: 60, sapMgKohPerGram: 250 })], REFS);
    expect(out.map((d) => d.property)).toEqual(['iodine', 'sapKoh']);
  });

  it('surfaces single-source disagreements at base tolerance (no widening)', () => {
    // lone band [100,100], base T = max(5, 0.05*100) = 5 => [95,105]; sourceCount 1 is NOT widened
    expect(classifyExternalReferenceDeviations([{ id: 'lone', iodine: 85 }], REFS)).toHaveLength(1); // below 95
    expect(classifyExternalReferenceDeviations([{ id: 'lone', iodine: 104 }], REFS)).toEqual([]); // inside 95..105
  });

  it('compares SAP in mg KOH/g against sapMgKohPerGram', () => {
    expect(classifyExternalReferenceDeviations([oil({ sapMgKohPerGram: 195 })], REFS)).toEqual([]); // in band
    const [d] = classifyExternalReferenceDeviations([oil({ sapMgKohPerGram: 250 })], REFS);
    expect(d.property).toBe('sapKoh');
  });

  it('acknowledges a deviation registered by id:property, leaving the other property a warn', () => {
    KNOWN_EXTERNAL_REFERENCE_DEVIATIONS['multi:iodine'] = 'reviewed: reference suspect';
    const out = classifyExternalReferenceDeviations([oil({ iodine: 60, sapMgKohPerGram: 250 })], REFS);
    expect(out.find((d) => d.property === 'iodine')).toMatchObject({
      tier: 'acknowledged',
      reason: 'reviewed: reference suspect',
    });
    expect(out.find((d) => d.property === 'sapKoh')).toMatchObject({ tier: 'warn' });
    delete KNOWN_EXTERNAL_REFERENCE_DEVIATIONS['multi:iodine'];
  });

  it('skips oils absent from the reference table', () => {
    expect(classifyExternalReferenceDeviations([{ id: 'unknown', iodine: 999 }], REFS)).toEqual([]);
  });
});
