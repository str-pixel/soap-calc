import { describe, expect, it } from 'vitest';
import { resolvePrimarySap } from './sap-policy.js';

describe('resolvePrimarySap', () => {
  it('uses FNWL when within 5%', () => {
    const r = resolvePrimarySap(0.257, 0.258);
    expect(r.strategy).toBe('fnwl_agrees');
    expect(r.sapKoh).toBe(0.258);
    expect(r.primarySource).toBe('fnwl');
    expect(r.confidence).toBe('verified');
  });

  it('treats an exactly-5% delta as within tolerance despite float rounding', () => {
    const r = resolvePrimarySap(0.2, 0.19);
    expect(r.strategy).toBe('fnwl_agrees');
    expect(r.confidence).toBe('verified');
    expect(r.primarySource).toBe('fnwl');
    expect(r.sapKoh).toBeCloseTo(0.19, 10);
  });

  it('picks the disputed source closest to the profile-derived SAP (not the max)', () => {
    // legacy 0.325, fnwl 0.348, profile 0.328 -> legacy is closest. Higher SAP is NOT safer.
    const r = resolvePrimarySap(0.325, 0.348, 0.328);
    expect(r.strategy).toBe('profile_closest');
    expect(r.sapKoh).toBe(0.325);
    expect(r.primarySource).toBe('legacy_catalog');
    expect(r.confidence).toBe('estimated');
  });

  it('picks FNWL when it is the one closest to the profile', () => {
    // legacy 0.275, fnwl 0.253, profile 0.233 -> fnwl is closest.
    const r = resolvePrimarySap(0.275, 0.253, 0.233);
    expect(r.strategy).toBe('profile_closest');
    expect(r.sapKoh).toBe(0.253);
    expect(r.primarySource).toBe('fnwl');
  });

  it('falls back to the midpoint when the profile cannot judge (incomplete)', () => {
    const r = resolvePrimarySap(0.18, 0.2);
    expect(r.strategy).toBe('midpoint');
    expect(r.sapKoh).toBeCloseTo(0.19, 10);
    expect(r.confidence).toBe('estimated');
  });
});
