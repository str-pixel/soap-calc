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

  it('uses conservative (higher) SAP between 5% and 10%', () => {
    const r = resolvePrimarySap(0.186, 0.173);
    expect(r.strategy).toBe('conservative_blend');
    expect(r.sapKoh).toBe(0.186);
    expect(r.primarySource).toBe('legacy_catalog');
    expect(r.confidence).toBe('estimated');
  });

  it('uses FNWL as primary when conservative blend picks FNWL', () => {
    const r = resolvePrimarySap(0.173, 0.186);
    expect(r.strategy).toBe('conservative_blend');
    expect(r.sapKoh).toBe(0.186);
    expect(r.primarySource).toBe('fnwl');
  });

  it('keeps legacy when FNWL differs by more than 10%', () => {
    const r = resolvePrimarySap(0.247, 0.203);
    expect(r.strategy).toBe('legacy_retained');
    expect(r.sapKoh).toBe(0.247);
    expect(r.primarySource).toBe('legacy_catalog');
    expect(r.confidence).toBe('legacy_only');
  });

  it('uses higher FNWL SAP when legacy retained but FNWL is greater (lye safety)', () => {
    const r = resolvePrimarySap(0.192, 0.223);
    expect(r.strategy).toBe('fnwl_preferred');
    expect(r.sapKoh).toBe(0.223);
    expect(r.primarySource).toBe('fnwl');
    expect(r.confidence).toBe('estimated');
  });
});
