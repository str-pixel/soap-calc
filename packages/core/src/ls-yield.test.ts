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

  it('refuses a non-finite raw batch field that the null guards further down cannot catch', () => {
    // `potAnhydrousGrams === null` can't catch this: in whole-batch mode potAnhydrousGrams
    // is a bare `batch.anhydrousGrams` assignment that never reaches
    // lsPotAnhydrousShare's own null check, and NaN !== null anyway. `batchWaterGrams < 0`
    // can't catch it either: NaN < 0 is false. A NaN in any of these three raw batch fields
    // must be stopped here, at the top, or it rides ordinary arithmetic all the way to the
    // return value — see the next tests for what that looks like when it isn't stopped.
    expect(lsPartialDilution({ ...BATCH, anhydrousGrams: Number.NaN }, 1941.7)).toBeNull();
    expect(lsPartialDilution({ ...BATCH, totalWaterGrams: Number.NaN }, 1941.7)).toBeNull();
    expect(lsPartialDilution({ ...BATCH, dilutionWaterGrams: Number.NaN }, 1941.7)).toBeNull();
  });

  it('refuses an infinite dilutionWaterGrams — a finite but wrong predicted paste otherwise slips through with no NaN to notice', () => {
    // Without the guard: totalWaterGrams(2800) - Infinity = -Infinity, and the existing
    // Math.max(0, ...) clamp quietly turns that into 0, so predictedPasteGrams becomes
    // anhydrousGrams alone (1,200 g) instead of the correct 1,600 g. No NaN appears
    // anywhere in the result — it is a plausible, finite, wrong number.
    expect(
      lsPartialDilution({ ...BATCH, dilutionWaterGrams: Number.POSITIVE_INFINITY }, 1941.7),
    ).toBeNull();
  });

  it('refuses a negative anhydrousGrams — a batch with no soap is corrupt, not a valid share of one', () => {
    // Not caught by the NaN-only guard above (a negative number is finite) and not caught
    // by lsPotAnhydrousShare's <= 0 check either — in whole-batch mode potAnhydrousGrams is
    // a bare assignment that never routes through that function at all. Needs its own <= 0
    // floor at the top, matching every sibling anhydrousGrams check in this file.
    expect(lsPartialDilution({ ...BATCH, anhydrousGrams: -500 }, 1941.7)).toBeNull();
  });

  it('refuses a negative totalWaterGrams — the same wrong-predicted-paste symptom as Infinity, reached by a negative instead', () => {
    // totalWaterGrams(-500) - dilutionWaterGrams(2400) = -2900, and the existing
    // Math.max(0, ...) clamp turns that into 0 exactly as it did for an infinite
    // dilutionWaterGrams, so predictedPasteGrams becomes anhydrousGrams alone (1,200 g)
    // instead of the correct 1,600 g — the identical wrong-but-finite number, reached
    // through the other side of the same subtraction.
    expect(lsPartialDilution({ ...BATCH, totalWaterGrams: -500 }, 1941.7)).toBeNull();
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
    // A DIFFERENT scenario on the same recipe — a whole-batch reading of 1,600 g against a
    // target so low-water that lsPartialDilution refuses it (solution 1,500 g < the
    // 1,600 g pot) — to show that refusal has no bearing on the (unrelated) share above.
    const refused = lsPartialDilution(
      {
        anhydrousGrams: 1200,
        totalWaterGrams: 300,
        dilutionWaterGrams: 0,
        solutionGrams: 1500,
        wholeBatchPasteGrams: 1600,
        measuredPasteGrams: 1600,
      },
      1000,
    );
    expect(refused).toBeNull();
    expect(lsPotAnhydrousShare({ ...BATCH, potPasteGrams: 400 })).toBeCloseTo(share as number, 9);
  });
});
