import { describe, expect, it } from 'vitest';
import { poolExternalReferences } from './external-references.js';

describe('poolExternalReferences', () => {
  const table = poolExternalReferences({
    ranges: [
      { appId: 'a', iv: [40, 50], kohSapPpt: [190, 200] },
      { appId: null, iv: [1, 2] }, // no app match — skipped
    ],
    giakoumis: [
      { appId: 'a', reportedIodineValue: 45 },
      { appId: 'p', reportedIodineValue: 43, bandExclude: true }, // dropped
    ],
    toscano: [{ appId: 'a', iodineValue: 48, sapValueKOH: 199 }],
    warra: [],
  });

  it('pools iodine points across sources into one band with distinct source count', () => {
    expect(table.a.iodine).toEqual({
      min: 40,
      max: 50,
      sourceCount: 3,
      sources: ['giakoumis2018', 'oil-property-ranges', 'toscano2012'],
    });
  });

  it('counts a min/max range as ONE source contributing two points', () => {
    // sap from ranges (1 source) + toscano (1 source) = 2 sources, not 3 points = 3
    expect(table.a.sapKoh).toEqual({
      min: 190,
      max: 200,
      sourceCount: 2,
      sources: ['oil-property-ranges', 'toscano2012'],
    });
  });

  it('drops bandExclude points, so an oil with no surviving points is absent', () => {
    expect(table.p).toBeUndefined();
  });

  it('skips null-appId source rows', () => {
    expect(Object.keys(table)).toEqual(['a']);
  });
});
