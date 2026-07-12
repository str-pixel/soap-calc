import { describe, expect, it } from 'vitest';
import {
  FATTY_ACID_DISPLAY_GROUPS,
  FORMULATION_FATTY_ACID_GUIDE,
  RATIO_SATURATED_ACIDS,
  RATIO_UNSATURATED_ACIDS,
  sumFattyAcids,
} from './index.js';

const ratioAcids = new Set<string>([...RATIO_SATURATED_ACIDS, ...RATIO_UNSATURATED_ACIDS]);
const barAcids = new Set(FATTY_ACID_DISPLAY_GROUPS.flatMap((g) => g.acids as readonly string[]));

describe('FATTY_ACID_DISPLAY_GROUPS', () => {
  it('covers every acid the saturated/unsaturated ratio counts (no hidden weight)', () => {
    for (const acid of ratioAcids) {
      expect(barAcids.has(acid), `acid "${acid}" is not shown in any display bar`).toBe(true);
    }
  });

  it('contains no acid outside the ratio (bars never over-sum the Saturated/Unsaturated totals)', () => {
    for (const acid of barAcids) {
      expect(ratioAcids.has(acid), `bar acid "${acid}" is not counted by the sat/unsat ratio`).toBe(
        true,
      );
    }
  });

  it('has a guide band for every group key', () => {
    for (const { key } of FATTY_ACID_DISPLAY_GROUPS) {
      expect(FORMULATION_FATTY_ACID_GUIDE[key]).toBeDefined();
    }
  });

  it('keeps arachidic (C20:0) covered — tracked by the chemistry oracle, so counted here too', () => {
    expect(ratioAcids.has('arachidic')).toBe(true);
    expect(barAcids.has('arachidic')).toBe(true);
  });

  it('does not fold palmitoleic into the Oleic bar (would misreport macadamia/sea-buckthorn)', () => {
    const oleic = FATTY_ACID_DISPLAY_GROUPS.find((g) => g.key === 'oleic')!;
    expect(oleic.acids).not.toContain('palmitoleic');
    const other = FATTY_ACID_DISPLAY_GROUPS.find((g) => g.key === 'otherUnsaturated')!;
    expect(other.acids).toContain('palmitoleic');
  });

  it('represents a long-chain-unsaturated oil (meadowfoam) that was previously all-zero bars', () => {
    const profile = { docosenoic: 16, eicosenoic: 61, docosadienoic: 18 }; // 95% complete
    const group = FATTY_ACID_DISPLAY_GROUPS.find((g) => g.key === 'otherUnsaturated')!;
    expect(sumFattyAcids(profile, group.acids)).toBe(95);
  });

  it("surfaces broccoli's dominant erucic (was hidden)", () => {
    const profile = { oleic: 14, erucic: 50, stearic: 1, linoleic: 11, palmitic: 3, linolenic: 9 };
    const other = FATTY_ACID_DISPLAY_GROUPS.find((g) => g.key === 'otherUnsaturated')!;
    expect(sumFattyAcids(profile, other.acids)).toBe(50);
  });
});
