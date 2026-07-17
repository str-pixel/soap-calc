import { describe, expect, it } from 'vitest';
import {
  deriveChemistryFromProfile,
  FATTY_ACID_DISPLAY_GROUPS,
  FATTY_ACID_PROPERTIES,
  FORMULATION_FATTY_ACID_GUIDE,
  RATIO_SATURATED_ACIDS,
  RATIO_UNSATURATED_ACIDS,
  saturatedUnsaturatedRatio,
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

  it('assigns each acid to exactly one bar (disjoint — no acid double-counted across groups)', () => {
    // Without this, an acid appearing in two groups would make the panel sum it twice
    // (barSum > Saturated+Unsaturated) while the set-based subset checks above still pass.
    const allEntries = FATTY_ACID_DISPLAY_GROUPS.flatMap((g) => g.acids as readonly string[]);
    expect(allEntries.length).toBe(new Set(allEntries).size);
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

  it('keeps lignoceric (C24:0) covered — long-chain saturate, ratio + bar', () => {
    expect(ratioAcids.has('lignoceric')).toBe(true);
    expect(barAcids.has('lignoceric')).toBe(true);
  });

  it('counts elaidic (trans-C18:1) as SATURATED in the ratio while iodine counts it unsaturated', () => {
    // DELIBERATE DIVERGENCE — do not "reconcile" this by deriving the ratio sets from doubleBonds.
    // The sat/unsat ratio is a HARDNESS proxy: trans-C18:1 soap packs and hardens like a saturate,
    // so it sums into the saturated side. The iodine value is pure chemistry: elaidic's one C=C
    // still consumes iodine, identically to its cis isomer oleic. Trans fat is precisely where the
    // two metrics must disagree — binding doubleBonds > 0 to RATIO_UNSATURATED_ACIDS would report
    // partially-hydrogenated oils (soybean-27-5-hydrogenated) as soft when they are hard.
    const ratio = saturatedUnsaturatedRatio({ elaidic: 30, oleic: 10 });
    expect(ratio.saturated).toBe(30); // elaidic, on the hardness side
    expect(ratio.unsaturated).toBe(10); // oleic only

    expect(FATTY_ACID_PROPERTIES.elaidic.doubleBonds).toBe(1); // ...yet chemically unsaturated,
    // and its iodine contribution is identical to oleic's — they are geometric isomers.
    expect(deriveChemistryFromProfile({ elaidic: 95 })!.iodineValue).toBeCloseTo(
      deriveChemistryFromProfile({ oleic: 95 })!.iodineValue,
      6,
    );
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
