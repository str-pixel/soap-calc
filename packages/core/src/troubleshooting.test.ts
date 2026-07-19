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

  it('is process-gated — HP content differs from CP and LS content', () => {
    const hp = troubleshootingFor('hp');
    const cp = troubleshootingFor('cp');
    const ls = troubleshootingFor('ls');
    expect(hp).not.toBe(cp);
    expect(hp).not.toBe(ls);
    expect(hp.some((e) => /won't gel/.test(e.symptom))).toBe(true);
  });
});
