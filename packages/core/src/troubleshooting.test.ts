import { describe, expect, it } from 'vitest';
import { troubleshootingFor } from './troubleshooting.js';

describe('troubleshootingFor', () => {
  it('provides at least three troubleshooting entries per process, each with symptom/cause/fix', () => {
    for (const p of ['cp', 'hp', 'ls'] as const) {
      const entries = troubleshootingFor(p);
      expect(entries.length).toBeGreaterThanOrEqual(3);
      for (const e of entries) {
        expect(e.symptom).toBeTruthy();
        expect(e.cause).toBeTruthy();
        expect(e.fix).toBeTruthy();
      }
    }
  });

  it('coaches MORE water for LS soap that gels/turns stringy — never less', () => {
    // Grounded direction: soap held above its recipe's max concentration thickens or sets
    // solid (LS_MINIMUM_DILUTION_GUIDE), and high-oleic recipes form a stringy gel until
    // the concentration drops below their ~25% ceiling. The fix is always to ADD water.
    const gelEntry = troubleshootingFor('ls').find((e) => /stringy|gelatin/i.test(e.symptom));
    expect(gelEntry).toBeDefined();
    expect(gelEntry!.cause).not.toMatch(/over-?dilut/i);
    expect(gelEntry!.cause).toMatch(/not enough|too little|above/i);
    expect(gelEntry!.fix).toMatch(/more (hot )?water/i);
    expect(gelEntry!.fix).not.toMatch(/less water/i);
  });

  it('is process-gated — HP content differs from CP and LS content', () => {
    const hp = troubleshootingFor('hp');
    const cp = troubleshootingFor('cp');
    const ls = troubleshootingFor('ls');
    expect(hp).not.toBe(cp);
    expect(hp).not.toBe(ls);
    expect(hp.some((e) => /won't gel/.test(e.symptom))).toBe(true);
  });
});
