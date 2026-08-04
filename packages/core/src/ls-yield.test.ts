import { describe, expect, it } from 'vitest';
import { LS_SOLUTION_DENSITY_G_PER_ML, lsBottleCount, lsFinishedVolumeMl, lsPartialDilution } from './ls-yield.js';

describe('ls-yield', () => {
  it('finished volume = grams / density; bottles floor to whole', () => {
    expect(lsFinishedVolumeMl(1030)).toBeCloseTo(1000); // 1030 g / 1.03
    expect(lsBottleCount(1030, 250)).toBe(4); // 1000 ml / 250 = 4
    expect(lsBottleCount(1030, 0)).toBeNull();
  });

  it('accepts a custom density override', () => {
    expect(lsFinishedVolumeMl(1000, 1)).toBeCloseTo(1000);
    expect(lsBottleCount(1000, 500, 1)).toBe(2);
  });

  it('guards non-positive/non-finite solution grams and bottle size', () => {
    expect(lsFinishedVolumeMl(0)).toBeNull();
    expect(lsFinishedVolumeMl(-5)).toBeNull();
    expect(lsFinishedVolumeMl(Infinity)).toBeNull();
    expect(lsBottleCount(0, 250)).toBeNull();
    expect(lsBottleCount(1030, -1)).toBeNull();
    expect(lsBottleCount(1030, Infinity)).toBeNull();
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
});
