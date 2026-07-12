import { describe, expect, it } from 'vitest';
import {
  FATTY_ACID_DISPLAY_GROUPS,
  FORMULATION_FATTY_ACID_GUIDE,
  RATIO_SATURATED_ACIDS,
  RATIO_UNSATURATED_ACIDS,
  sumFattyAcids,
} from './index.js';

describe('FATTY_ACID_DISPLAY_GROUPS', () => {
  it('covers every acid the saturated/unsaturated ratio counts (bars reconcile with the total)', () => {
    const covered = new Set(FATTY_ACID_DISPLAY_GROUPS.flatMap((g) => g.acids as readonly string[]));
    for (const acid of [...RATIO_SATURATED_ACIDS, ...RATIO_UNSATURATED_ACIDS]) {
      expect(covered.has(acid), `acid "${acid}" is not shown in any display bar`).toBe(true);
    }
  });

  it('has a guide band for every group key', () => {
    for (const { key } of FATTY_ACID_DISPLAY_GROUPS) {
      expect(FORMULATION_FATTY_ACID_GUIDE[key]).toBeDefined();
    }
  });

  it('represents a long-chain-unsaturated oil (meadowfoam) that was previously all-zero bars', () => {
    const profile = { docosenoic: 16, eicosenoic: 61, docosadienoic: 18 }; // 95% complete
    const group = FATTY_ACID_DISPLAY_GROUPS.find((g) => g.key === 'longChainUnsaturated');
    expect(group).toBeDefined();
    expect(sumFattyAcids(profile, group!.acids)).toBe(95);
  });

  it("surfaces broccoli's dominant erucic (was hidden)", () => {
    const profile = { oleic: 14, erucic: 50, stearic: 1, linoleic: 11, palmitic: 3, linolenic: 9 };
    const longChain = FATTY_ACID_DISPLAY_GROUPS.find((g) => g.key === 'longChainUnsaturated')!;
    expect(sumFattyAcids(profile, longChain.acids)).toBe(50);
  });
});
