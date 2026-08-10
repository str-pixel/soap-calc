import { describe, expect, it } from 'vitest';
import {
  LS_SOLUTION_DENSITY_G_PER_ML,
  lsFinishedVolumeMl,
  lsPartialDilution,
  lsPotAnhydrousShare,
} from './ls-yield.js';

describe('ls-yield', () => {
  it('finished volume = grams / density', () => {
    expect(lsFinishedVolumeMl(1030)).toBeCloseTo(1000); // 1030 g / 1.03
  });

  it('accepts a custom density override', () => {
    expect(lsFinishedVolumeMl(1000, 1)).toBeCloseTo(1000);
  });

  it('guards non-positive/non-finite solution grams', () => {
    expect(lsFinishedVolumeMl(0)).toBeNull();
    expect(lsFinishedVolumeMl(-5)).toBeNull();
    expect(lsFinishedVolumeMl(Infinity)).toBeNull();
  });

  it('exposes the documented density proxy', () => {
    expect(LS_SOLUTION_DENSITY_G_PER_ML).toBe(1.03);
  });
});

describe('lsPartialDilution', () => {
  // A batch: 1,200 g anhydrous, 400 g cook water, 2,400 g dilution water → 4,000 g
  // solution = 3,883 ml at 1.03 g/ml. Paste in hand = anhydrous + cook water = 1,600 g.
  const BATCH = {
    anhydrousGrams: 1200,
    totalWaterGrams: 2800,
    dilutionWaterGrams: 2400,
    solutionGrams: 4000,
  };

  it('scales paste, water and yield linearly to the volume asked for', () => {
    // Half the batch's 3,883 ml.
    const r = lsPartialDilution(BATCH, 1941.7);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.fraction).toBeCloseTo(0.5, 3);
    expect(r.pasteGrams).toBeCloseTo(800, 0); // half of 1,600 g paste
    expect(r.waterGrams).toBeCloseTo(1200, 0); // half the dilution water
    expect(r.solutionGrams).toBeCloseTo(2000, 0);
    expect(r.volumeMl).toBeCloseTo(1941.7, 0);
    expect(r.clamped).toBe(false);
    // Whole-batch mode: the pot's own anhydrous IS the recipe's whole anhydrousGrams, and —
    // unlike pasteGrams/waterGrams/solutionGrams just above — untouched by the half-volume
    // fraction this test asked for.
    expect(r.potAnhydrousGrams).toBe(1200);
  });

  it('clamps to the whole batch when more is asked for than exists', () => {
    const r = lsPartialDilution(BATCH, 99_000);
    expect(r?.fraction).toBe(1);
    expect(r?.pasteGrams).toBeCloseTo(1600, 0);
    expect(r?.waterGrams).toBeCloseTo(2400, 0);
    expect(r?.clamped).toBe(true);
  });

  it('honors a custom density and guards junk input', () => {
    // At 1.0 g/ml the same batch is 4,000 ml, so 2,000 ml is half.
    expect(lsPartialDilution(BATCH, 2000, 1)?.fraction).toBeCloseTo(0.5, 6);
    expect(lsPartialDilution(BATCH, 0)).toBeNull();
    expect(lsPartialDilution(BATCH, Number.NaN)).toBeNull();
    expect(lsPartialDilution({ ...BATCH, solutionGrams: 0 }, 500)).toBeNull();
  });
});

describe('lsPartialDilution with a measured paste weight', () => {
  // Same batch: 1,200 anhydrous + 400 cook water = 1,600 g predicted paste,
  // 2,400 g dilution water, 4,000 g solution = 3,883 ml.
  const BATCH = {
    anhydrousGrams: 1200, totalWaterGrams: 2800, dilutionWaterGrams: 2400, solutionGrams: 4000,
  };

  it('uses the measured paste and compensates the water for it', () => {
    // Measured 1,480 g — 120 g lighter than predicted, the cook evaporated it. The
    // solution target is fixed by the recipe (anhydrous / concentration), so the missing
    // 120 g must come from the dilution water instead: 4,000 − 1,480 = 2,520 g.
    const r = lsPartialDilution({ ...BATCH, measuredPasteGrams: 1480 }, 3883.5);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.fraction).toBeCloseTo(1, 3);
    expect(r.pasteGrams).toBeCloseTo(1480, 0);
    expect(r.waterGrams).toBeCloseTo(2520, 0);
    expect(r.pasteMeasured).toBe(true);
  });

  it('reports the water:paste ratio the reference dilutes by', () => {
    const r = lsPartialDilution({ ...BATCH, measuredPasteGrams: 1600 }, 1941.7);
    expect(r?.waterPasteRatio).toBeCloseTo(1.5, 2); // 2,400 water : 1,600 paste
    // Halving the portion cannot change the ratio — both sides scale together.
    expect(lsPartialDilution({ ...BATCH, measuredPasteGrams: 1600 }, 3883.5)?.waterPasteRatio)
      .toBeCloseTo(1.5, 2);
  });

  it('falls back to the computed paste, flagged as unmeasured', () => {
    const r = lsPartialDilution(BATCH, 1941.7);
    expect(r?.pasteMeasured).toBe(false);
    expect(r?.pasteGrams).toBeCloseTo(800, 0); // half of the computed 1,600 g
    expect(r?.waterGrams).toBeCloseTo(1200, 0);
  });

  it('refuses a measured paste already at or past the target concentration', () => {
    // 4,100 g of paste cannot be diluted to a 4,000 g solution — it is already thinner.
    expect(lsPartialDilution({ ...BATCH, measuredPasteGrams: 4100 }, 1000)).toBeNull();
    // Junk measurements fall back rather than poisoning the figures.
    expect(lsPartialDilution({ ...BATCH, measuredPasteGrams: 0 }, 1941.7)?.pasteMeasured).toBe(false);
    expect(lsPartialDilution({ ...BATCH, measuredPasteGrams: Number.NaN }, 1941.7)?.pasteMeasured).toBe(false);
  });

  it('returns the predicted paste weight so callers need not recompute it', () => {
    // Predicted (unmeasured) paste is anhydrous + cook water = 1,200 + 400 = 1,600 g,
    // scaled by the portion's fraction (1,000 ml of 3,883 ml full volume here).
    const r = lsPartialDilution(
      { anhydrousGrams: 1200, totalWaterGrams: 2800, dilutionWaterGrams: 2400, solutionGrams: 4000,
        measuredPasteGrams: 1480 },
      1000,
    )!;
    expect(r.predictedPasteGrams).toBeCloseTo(1600, 0);
  });
});

describe('lsPartialDilution with a remaining (already-drawn-down) paste measurement', () => {
  // Worked example from the user-flow review: 1,000 g anhydrous, 600 g cook water (1,600 g
  // predicted whole-batch paste), target 33% soap. 300 ml was already drawn and diluted
  // away earlier, leaving 1,437 g of paste in the pot — still the SAME composition, just
  // less of it.
  //
  // CORRECTION: an earlier version of this test expected 524 g of water here. That figure
  // came from scaling the requested volume against the ORIGINAL RECIPE's full achievable
  // volume (fullVolumeMl ≈ 2,942 ml) — the same fraction whole-batch mode uses. It is
  // wrong: "Amount to make (ml)" must make that amount, and 524 g of water only reaches
  // ~1,078 ml, not the 1,200 ml asked for. The pot no longer holds the whole recipe (part
  // of it was already diluted away), so its OWN achievable volume is smaller
  // (≈2,642 ml) — the fraction must be taken against THAT, not the original recipe's.
  // Do not restore 524/650 as the expectation here.
  const anhydrousGrams = 1000;
  const cookWaterGrams = 600;
  const targetConcentration = 0.33;
  const predictedPasteGrams = anhydrousGrams + cookWaterGrams; // 1,600
  const solutionGrams = anhydrousGrams / targetConcentration; // 3,030.303...
  const dilutionWaterGrams = solutionGrams - predictedPasteGrams;
  const totalWaterGrams = cookWaterGrams + dilutionWaterGrams;
  const BATCH = { anhydrousGrams, totalWaterGrams, dilutionWaterGrams, solutionGrams };

  it('scales the pot from the measurement itself, not the recipe anhydrous, when the paste is what is left', () => {
    // pot anhydrous = 1,437 × (1,000/1,600) = 898 g; pot solution at 33% = 898/0.33 =
    // 2,722 g → 2,643 ml achievable. Asking for 1,200 ml of that: fraction = 1,200/2,643 =
    // 0.454 → 653 g paste, 583 g water (653 + 583 = 1,236 g → 1,200 ml; 408/1,236 = 33.0%).
    const r = lsPartialDilution(
      { ...BATCH, measuredPasteGrams: 1437, measuredPasteIsRemaining: true },
      1200,
    );
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.pasteGrams).toBeCloseTo(653, 0);
    expect(r.waterGrams).toBeCloseTo(583, 0);
  });

  it('"Makes" equals the amount actually asked for, once unclamped — the whole point of "Amount to make"', () => {
    const r = lsPartialDilution(
      { ...BATCH, measuredPasteGrams: 1437, measuredPasteIsRemaining: true },
      1200,
    );
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.volumeMl).toBeCloseTo(1200, 0);
    expect(r.clamped).toBe(false);
  });

  it('clamps on the REMAINING paste\'s own achievable volume (~2,642 ml), not the original recipe\'s (~2,942 ml)', () => {
    // 2,800 ml exceeds what 1,437 g of remaining paste can ever make (≈2,642 ml) but is
    // still less than what the ORIGINAL, undrawn batch could have made (≈2,942 ml) — a
    // fraction taken against the wrong (recipe) volume would wrongly report this as
    // unclamped. The clamped figures must be the whole remaining pot: all 1,437 g of
    // paste, and the water needed to dilute exactly that (2,722 − 1,437 ≈ 1,285 g).
    const r = lsPartialDilution(
      { ...BATCH, measuredPasteGrams: 1437, measuredPasteIsRemaining: true },
      2800,
    );
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.clamped).toBe(true);
    expect(r.fraction).toBe(1);
    expect(r.pasteGrams).toBeCloseTo(1437, 0);
    expect(r.waterGrams).toBeCloseTo(1285, 0);
  });

  it('the same reading produces the wrong (whole-batch) figure when NOT declared remaining — the bug this guards against', () => {
    const r = lsPartialDilution({ ...BATCH, measuredPasteGrams: 1437 }, 1200);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.waterGrams).toBeCloseTo(650, 0);
  });

  it('accepts a remaining measurement below the recipe anhydrous floor — the remainder no longer holds the whole batch', () => {
    // 1,437 g is itself below the FULL anhydrous+cook-water paste of a bigger batch in
    // this case anhydrousGrams (1,000) is still below 1,437, so use a reading that is
    // below anhydrousGrams directly to prove there is no floor in remaining mode.
    const r = lsPartialDilution(
      { ...BATCH, measuredPasteGrams: 500, measuredPasteIsRemaining: true },
      200,
    );
    expect(r).not.toBeNull();
  });

  it('is byte-identical to whole-batch mode when measuredPasteIsRemaining is omitted or false', () => {
    const withFlagFalse = lsPartialDilution({ ...BATCH, measuredPasteGrams: 1437, measuredPasteIsRemaining: false }, 1200);
    const withoutFlag = lsPartialDilution({ ...BATCH, measuredPasteGrams: 1437 }, 1200);
    expect(withFlagFalse).toEqual(withoutFlag);
  });

  it('rejects a remaining reading heavier than the whole batch\'s own predicted paste — a remainder cannot exceed the whole', () => {
    // Review round 2, finding 2: predicted whole-batch paste here is 1,600 g
    // (anhydrousGrams 1,000 + cookWaterGrams 600). A "remaining" reading of 3,000 g would
    // otherwise be accepted and scale to a pot anhydrous of 3,000 × (1,000/1,600) =
    // 1,875 g — MORE soap than the entire batch ever contained. Physically impossible
    // input must not reach the arithmetic at all.
    const r = lsPartialDilution({ ...BATCH, measuredPasteGrams: 3000, measuredPasteIsRemaining: true }, 1200);
    expect(r).toBeNull();
  });

  it('accepts a remaining reading exactly at the predicted whole-batch paste (the boundary)', () => {
    const r = lsPartialDilution({ ...BATCH, measuredPasteGrams: predictedPasteGrams, measuredPasteIsRemaining: true }, 1200);
    expect(r).not.toBeNull();
  });

  it("exposes the pot's own anhydrous share directly, independent of the requested volume", () => {
    // Same pot as the very first test above: 1,437 g of remaining paste carries
    // 1,437 × (1,000/1,600) ≈ 898 g of anhydrous soap. Unlike pasteGrams/waterGrams/
    // solutionGrams, this field is not scaled by `fraction` — it is the pot's FULL
    // anhydrous content, so two different requested volumes on the same pot must report
    // the identical figure. A caller deriving a measured jar's OWN concentration (not a
    // share of what the recipe's target wants from it) reads this rather than
    // re-deriving `measured × anhydrousGrams / wholeBatchPasteGrams` itself.
    const small = lsPartialDilution(
      { ...BATCH, measuredPasteGrams: 1437, measuredPasteIsRemaining: true },
      1200,
    );
    const large = lsPartialDilution(
      { ...BATCH, measuredPasteGrams: 1437, measuredPasteIsRemaining: true },
      2800,
    );
    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    if (!small || !large) return;
    expect(small.potAnhydrousGrams).toBeCloseTo(898, 0);
    expect(large.potAnhydrousGrams).toBeCloseTo(898, 0);
  });
});

describe('lsPartialDilution with a wholeBatchPasteGrams basis (split-liquid solids)', () => {
  // Review round 3: predictedPasteGrams (anhydrousGrams + cookWaterGrams) counts only the
  // WATER fraction of an alternative liquid — its non-water solids are real mass sitting
  // in the pot the recipe never counts (see ls-yield.ts, DilutionPanel.tsx,
  // PortionDilutionResults.tsx, all verbatim on this point). So for a split-liquid recipe the
  // TRUE whole-batch paste is structurally heavier than predictedPasteGrams, and round 2's
  // ceiling (which used predictedPasteGrams) both rejected legitimate remaining readings
  // above it AND (via the same basis feeding the composition ratio) understated the pot's
  // true paste mass, overstating its soap fraction.
  //
  // Fixture: 1,000 g anhydrous, 500 g lye water, 200 g split liquid at 50% water
  // (100 g water, 100 g solids). cookWaterGrams = 500 + 100 = 600, so
  // predictedPasteGrams = 1,000 + 600 = 1,600 — but the TRUE whole-batch paste is
  // 1,600 + 100 (the liquid's solids) = 1,700 g. Target 33% soap.
  const anhydrousGrams = 1000;
  const lyeWaterGrams = 500;
  const splitLiquidWaterGrams = 100; // 200 g split liquid @ 0.5 water fraction
  const splitLiquidSolidsGrams = 100;
  const cookWaterGrams = lyeWaterGrams + splitLiquidWaterGrams; // 600
  const predictedPasteGrams = anhydrousGrams + cookWaterGrams; // 1,600
  const wholeBatchPasteGrams = predictedPasteGrams + splitLiquidSolidsGrams; // 1,700
  const targetConcentration = 0.33;
  const solutionGrams = anhydrousGrams / targetConcentration;
  const dilutionWaterGrams = solutionGrams - predictedPasteGrams;
  const totalWaterGrams = cookWaterGrams + dilutionWaterGrams;
  const BATCH = { anhydrousGrams, totalWaterGrams, dilutionWaterGrams, solutionGrams };

  it('accepts an honest remaining reading (1,620 g) that the uncorrected 1,600 g ceiling would have falsely rejected', () => {
    const r = lsPartialDilution(
      { ...BATCH, measuredPasteGrams: 1620, measuredPasteIsRemaining: true, wholeBatchPasteGrams },
      1000,
    );
    expect(r).not.toBeNull();
  });

  it('derives the composition from the TRUE basis (~1,700 g), not the water-only 1,600 g — a lower soap fraction', () => {
    // waterPasteRatio is portion-invariant (scales with fraction), so it isolates the
    // composition basis from the requested-volume arithmetic. The corrected (1,700 g)
    // basis gives ~0.783:1; the uncorrected (1,600 g) basis would give ~0.894:1 — using
    // the wrong basis overstates the pot's soap fraction.
    const r = lsPartialDilution(
      { ...BATCH, measuredPasteGrams: 1620, measuredPasteIsRemaining: true, wholeBatchPasteGrams },
      1000,
    );
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.waterPasteRatio).toBeCloseTo(0.783, 2);
    expect(r.waterPasteRatio).not.toBeCloseTo(0.894, 2);
    expect(r.wholeBatchPasteGrams).toBe(1700);
  });

  it('still rejects a reading above the TRUE whole-batch paste — the ceiling follows the corrected basis, not just loosens', () => {
    const r = lsPartialDilution(
      { ...BATCH, measuredPasteGrams: 3000, measuredPasteIsRemaining: true, wholeBatchPasteGrams },
      1000,
    );
    expect(r).toBeNull();
  });

  describe('and no measurement at all — the pot still holds the solids', () => {
    // The unmeasured pot really is anhydrous + cook water + the liquid's solids, which is
    // what wholeBatchPasteGrams resolves to. Using predictedPasteGrams here left the portion
    // pouring water for a paste 100 g lighter than the one in the pot, so Custom amount and
    // Whole batch printed different figures for the same undivided batch.
    it('takes the paste (and therefore the water) from the corrected basis', () => {
      const r = lsPartialDilution({ ...BATCH, wholeBatchPasteGrams }, 99_000);
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.clamped).toBe(true); // the whole batch, so no fraction to reason about
      expect(r.pasteGrams).toBeCloseTo(1700, 6);
      expect(r.waterGrams).toBeCloseTo(solutionGrams - 1700, 6);
    });

    it('is unchanged when no corrected basis is supplied', () => {
      const r = lsPartialDilution(BATCH, 99_000);
      expect(r?.pasteGrams).toBeCloseTo(predictedPasteGrams, 6);
      expect(r?.waterGrams).toBeCloseTo(dilutionWaterGrams, 6);
    });

    it('is unchanged when there is no split liquid — the two bases are the same figure', () => {
      // A recipe with no alternative liquid has no solids, so the view model's corrected
      // basis IS anhydrous + cook water. Supplying it must therefore change nothing.
      const noSolids = lsPartialDilution({ ...BATCH, wholeBatchPasteGrams: predictedPasteGrams }, 99_000);
      const withoutBasis = lsPartialDilution(BATCH, 99_000);
      expect(noSolids?.pasteGrams).toBeCloseTo(withoutBasis!.pasteGrams, 9);
      expect(noSolids?.waterGrams).toBeCloseTo(withoutBasis!.waterGrams, 9);
    });

    it('is still outranked by a measurement — the scale beats both computed bases', () => {
      const r = lsPartialDilution({ ...BATCH, wholeBatchPasteGrams, measuredPasteGrams: 1750 }, 99_000);
      expect(r?.pasteMeasured).toBe(true);
      expect(r?.pasteGrams).toBeCloseTo(1750, 6);
      expect(r?.waterGrams).toBeCloseTo(solutionGrams - 1750, 6);
    });
  });

  it('falls back to predictedPasteGrams (byte-identical to round 2) when wholeBatchPasteGrams is omitted — a no-split-liquid recipe', () => {
    const withoutBasis = lsPartialDilution({ ...BATCH, measuredPasteGrams: 1620, measuredPasteIsRemaining: true }, 1000);
    // 1,620 g exceeds the uncorrected 1,600 g predicted paste, so without the corrected
    // basis this is (correctly, for a NO-split-liquid recipe) still rejected.
    expect(withoutBasis).toBeNull();
    const atPredicted = lsPartialDilution({ ...BATCH, measuredPasteGrams: 1600, measuredPasteIsRemaining: true }, 1000);
    expect(atPredicted).not.toBeNull();
    expect(atPredicted?.wholeBatchPasteGrams).toBe(predictedPasteGrams);
  });
});

describe('lsPotAnhydrousShare — the soap in one weighed pot', () => {
  // The batch above: 1,200 g of anhydrous soap in a 1,600 g pot of paste.
  const BATCH = { anhydrousGrams: 1200, wholeBatchPasteGrams: 1600 };

  it('is the pot’s proportional share, because the paste is homogeneous', () => {
    // A quarter of the paste carries a quarter of the soap.
    expect(lsPotAnhydrousShare({ ...BATCH, potPasteGrams: 400 })).toBeCloseTo(300, 9);
    expect(lsPotAnhydrousShare({ ...BATCH, potPasteGrams: 1600 })).toBeCloseTo(1200, 9);
  });

  it('refuses a pot heavier than the batch’s own paste, and accepts the boundary', () => {
    // Solids and the water already in the paste do not appear from nowhere; weighing out
    // ALL of it is a legitimate share of 1.
    expect(lsPotAnhydrousShare({ ...BATCH, potPasteGrams: 1600.1 })).toBeNull();
    expect(lsPotAnhydrousShare({ ...BATCH, potPasteGrams: 4000 })).toBeNull();
    expect(lsPotAnhydrousShare({ ...BATCH, potPasteGrams: 1600 })).not.toBeNull();
  });

  it('refuses non-positive and non-finite figures rather than returning a number', () => {
    expect(lsPotAnhydrousShare({ ...BATCH, potPasteGrams: 0 })).toBeNull();
    expect(lsPotAnhydrousShare({ ...BATCH, potPasteGrams: -400 })).toBeNull();
    expect(lsPotAnhydrousShare({ ...BATCH, potPasteGrams: NaN })).toBeNull();
    expect(lsPotAnhydrousShare({ anhydrousGrams: 0, wholeBatchPasteGrams: 1600, potPasteGrams: 400 })).toBeNull();
    expect(lsPotAnhydrousShare({ anhydrousGrams: 1200, wholeBatchPasteGrams: 0, potPasteGrams: 400 })).toBeNull();
  });

  it('asks nothing about any target — the share is the same at every concentration', () => {
    // THE POINT OF THE EXTRACTION. lsPartialDilution needs a target volume and refuses
    // outright when the saved target implies a solution lighter than the pot; the jar's own
    // recorded concentration has nothing to do with either, so it must not inherit them.
    const share = lsPotAnhydrousShare({ ...BATCH, potPasteGrams: 400 });
    expect(share).toBeCloseTo(300, 9);
    // The same pot, against a recipe whose target is so low-water that lsPartialDilution
    // refuses it (solution 1,500 g < the 1,600 g pot).
    const refused = lsPartialDilution(
      {
        anhydrousGrams: 1200,
        totalWaterGrams: 300,
        dilutionWaterGrams: 0,
        solutionGrams: 1500,
        wholeBatchPasteGrams: 1600,
        measuredPasteGrams: 400,
        measuredPasteIsRemaining: true,
      },
      1000,
    );
    expect(refused).toBeNull();
    expect(lsPotAnhydrousShare({ ...BATCH, potPasteGrams: 400 })).toBeCloseTo(share as number, 9);
  });

  it('is the very arithmetic lsPartialDilution reports, not a second copy of it', () => {
    // One derivation: potAnhydrousGrams comes back through this function, so a change to
    // the ratio or its ceiling cannot move one caller without the other.
    const r = lsPartialDilution(
      {
        anhydrousGrams: 1200, totalWaterGrams: 2800, dilutionWaterGrams: 2400, solutionGrams: 4000,
        wholeBatchPasteGrams: 1600, measuredPasteGrams: 400, measuredPasteIsRemaining: true,
      },
      500,
    );
    expect(r?.potAnhydrousGrams).toBeCloseTo(
      lsPotAnhydrousShare({ ...BATCH, potPasteGrams: 400 }) as number,
      9,
    );
  });
});
