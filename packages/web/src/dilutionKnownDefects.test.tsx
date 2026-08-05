// @vitest-environment jsdom
/**
 * CHARACTERIZATION TESTS FOR FOUR KNOWN, UNFIXED DILUTION DEFECTS.
 *
 * Every assertion in this file pins behaviour that is WRONG. None of them describes what
 * the app ought to do. They exist because the four defects below were found in review,
 * deliberately deferred, and described only in prose — so nothing stopped them drifting.
 * Each test names the defect, states the correct behaviour, and says plainly that a
 * failure here is the signal the defect was FIXED, not that something broke: when one of
 * these fails, delete the test (or rewrite it as a normal test of the fixed behaviour)
 * rather than restoring the old number.
 *
 * The figures are driven end-to-end — the real `useRecipeViewModel`, the real
 * `DilutionPanel` / `BatchSheet`, wired the way `App.tsx` wires them — so a defect that is
 * fixed anywhere along that chain shows up here.
 *
 * Shared basis for every case below: the starter recipe (1,000 g oils) under LS with KOH
 * at the 90% default purity and a 5% superfat → 215.33 g of lye, 1,215.33 g anhydrous,
 * and 330 g of lye water at the default 33%-of-oils.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BatchSheet } from './components/BatchSheet';
import { DilutionPanel } from './components/DilutionPanel';
import { useRecipeViewModel, type RecipeViewModel } from './hooks/useRecipeViewModel';
import { computeBottledSolutionGrams } from './lib/calculateAdditives';
import {
  createEmptyAdditives,
  createStarterLines,
  DEFAULT_SETTINGS,
  type RecipeSettings,
  type SplitLiquidRow,
} from './lib/recipe';

afterEach(cleanup);

/** Glycerin: waterFraction 0, so 400 g of it is 400 g of SOLIDS in the pot and 0 g of
 * paste water — the split that makes defects 1 and 3 visible at their largest. */
const GLYCERIN_400: SplitLiquidRow = {
  key: 'g1', presetKey: 'glycerin', name: 'Glycerin', customWaterPercent: '',
  sizeMode: 'grams', amount: '400', addAt: 'lye',
};
/** Canned coconut milk: waterFraction 0.68, so 200 g is 136 g of water + 64 g of solids. */
const MILK_200: SplitLiquidRow = {
  key: 'm1', presetKey: 'coconut-milk-canned', name: 'Coconut milk (canned)',
  customWaterPercent: '', sizeMode: 'grams', amount: '200', addAt: 'trace',
};
const MILK_1600: SplitLiquidRow = { ...MILK_200, amount: '1600' };

function viewModelFor(
  settingsOverride: Partial<RecipeSettings>,
  measuredPasteGrams?: string,
  measuredPasteIsRemaining = false,
): RecipeViewModel {
  let captured: RecipeViewModel | undefined;
  function Probe() {
    captured = useRecipeViewModel({
      recipeName: 'Known defects',
      lines: createStarterLines(),
      settings: { ...DEFAULT_SETTINGS, ...settingsOverride },
      additives: createEmptyAdditives(),
      drafts: {},
      weightUnit: 'g',
      process: 'ls',
      measuredPasteGrams,
      measuredPasteIsRemaining,
    });
    return null;
  }
  render(<Probe />);
  cleanup();
  return captured!;
}

/** Exactly App.tsx's own DilutionPanel wiring, in the default (Whole batch, target
 * concentration) state — so what these tests read is what the maker reads. */
function renderPanel(
  vm: RecipeViewModel,
  soapConcentrationPercent: string,
  measuredPasteGrams = '',
  measuredPasteIsRemaining = false,
) {
  render(
    <DilutionPanel
      dilution={vm.dilution}
      soapConcentrationPercent={soapConcentrationPercent}
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      altLiquidWaterGrams={vm.splitLiquidPasteWater}
      unknownLiquidGrams={vm.unknownLiquidGrams}
      overDilutionCertain={vm.overDilutionCertain}
      bottledSolutionGrams={vm.bottledSolutionGrams}
      cookWaterGrams={vm.cookWaterGrams}
      dilutionMode="concentration"
      waterPasteRatio="2"
      measuredPasteGrams={measuredPasteGrams}
      measuredPasteIsRemaining={measuredPasteIsRemaining}
      dilutionScope="batch"
      targetMl=""
      wholeBatchPasteGrams={vm.wholeBatchPasteGrams}
      onMeasuredPasteGramsChange={() => {}}
      onMeasuredPasteIsRemainingChange={() => {}}
      onDilutionScopeChange={() => {}}
      onTargetMlChange={() => {}}
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
}

/** The value cell of a results-grid row, as text ("2,306 g"). */
function rowText(label: string): string {
  return screen.getByText(label).nextElementSibling!.textContent!;
}

/** …and as a number, so a test can do arithmetic on what is actually on screen. */
function rowGrams(label: string): number {
  return Number(rowText(label).replace(/[^0-9.-]/g, ''));
}

/** Every non-alert explanatory paragraph in the panel, whitespace-collapsed. */
function hintTexts(): string[] {
  return Array.from(document.querySelectorAll('.results-hint')).map((n) =>
    (n.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('DEFECT 1 (unfixed): a corrected paste past the target prints "0 g" with no alert', () => {
  // WHAT HAPPENS. `correctedDilutionWaterGrams` clamps `solutionGrams - wholeBatchPasteGrams`
  // at zero (lib/measuredPaste). A big low-water alternative liquid can push the CORRECTED
  // paste past the whole target solution while `targetExceedsPaste` — computed by
  // calculateDilution from anhydrous + WATER only, so blind to the liquid's solids — stays
  // false. The clamp then fires and the batch row prints "0 g", while every alert that could
  // explain it is gated on `targetExceedsPaste` (DilutionPanel's "already more dilute"
  // branch) or on a MEASURED reading (`measurementRejection.exceedsSolution`). Neither is in
  // play, so the panel and the printed sheet say nothing at all.
  //
  // The 0 g is HONEST — the pot really cannot reach the target, so there is no water to add.
  // The silence is the defect.
  //
  // WHAT THE CORRECT BEHAVIOUR WOULD BE. An alert on the same footing as the
  // targetExceedsPaste one, keyed on the corrected pot exceeding the target solution
  // (wholeBatchPasteGrams > solutionGrams) rather than on the water-only flag, telling the
  // maker the pot is already past the target and to lower it (or widen the ratio).
  //
  // A FAILURE HERE IS THE FIX LANDING. The `toBe(0)` alert counts are the assertions that
  // must change; do not "repair" them by re-silencing the panel.

  it('glycerin 400 g at a 65% target: 0 g on screen, zero alerts', () => {
    const settings = {
      lyeType: 'koh' as const,
      soapConcentrationPercent: '65',
      splitLiquids: [GLYCERIN_400],
    };
    const vm = viewModelFor(settings);

    // The state that triggers it. 654.41 g of target water against 330 g of lye water, so
    // the water-only flag is false — but the pot is 1,945.33 g (1,215.33 anhydrous + 330
    // lye water + 400 glycerin solids) against a 1,869.74 g solution at 65%.
    expect(vm.dilution!.targetExceedsPaste).toBe(false);
    expect(vm.dilution!.totalWaterGrams).toBeCloseTo(654.41, 1);
    expect(vm.splitLiquidPasteWater).toBe(0);
    expect(vm.dilution!.solutionGrams).toBeCloseTo(1869.74, 1);
    expect(vm.wholeBatchPasteGrams!).toBeCloseTo(1945.33, 1);
    expect(vm.wholeBatchPasteGrams!).toBeGreaterThan(vm.dilution!.solutionGrams);

    renderPanel(vm, settings.soapConcentrationPercent);
    // The clamped pour figure…
    expect(rowText('Dilution water to add')).toBe('0 g');
    // …with the recipe's own (uncorrected, unclamped) figure still a live 324 g, which is
    // what the maker would have been told to pour before the solids were counted.
    expect(vm.dilution!.dilutionWaterGrams).toBeCloseTo(324.41, 1);
    // DEFECT: nothing on screen explains the zero.
    expect(screen.queryAllByRole('alert').length).toBe(0);
    // Not even a plain (non-alert) paragraph says the pot is past the target. Deliberately
    // narrow: this recipe is ALSO missing the "Already N g lighter" head-start hint, but
    // that is defect 3's gate, and fixing it must not fail a defect-1 test — that hint
    // explains the deduction, never the zero.
    expect(hintTexts().some((t) => /more dilute|cannot be diluted|past the target/.test(t))).toBe(
      false,
    );
  });

  it('1,600 g canned coconut milk on 1,000 g oils at a 40% target: 0 g on screen, zero alerts', () => {
    const settings = {
      lyeType: 'koh' as const,
      soapConcentrationPercent: '40',
      splitLiquids: [MILK_1600],
    };
    const vm = viewModelFor(settings);

    // 1,088 g of the milk is water, so cook water is 1,418 g against 1,823 g of target
    // water — flag still false. The 512 g of milk SOLIDS are what push the 3,145.33 g pot
    // past the 3,038.33 g solution.
    expect(vm.dilution!.targetExceedsPaste).toBe(false);
    expect(vm.splitLiquidPasteWater).toBeCloseTo(1088, 3);
    expect(vm.cookWaterGrams).toBeCloseTo(1418, 3);
    expect(vm.dilution!.solutionGrams).toBeCloseTo(3038.33, 1);
    expect(vm.wholeBatchPasteGrams!).toBeCloseTo(3145.33, 1);

    renderPanel(vm, settings.soapConcentrationPercent);
    expect(rowText('Dilution water to add')).toBe('0 g');
    expect(vm.dilution!.dilutionWaterGrams).toBeCloseTo(405, 1);
    // DEFECT: no alert. The panel DOES print the head-start hint here (the milk carries
    // water, so defect 3's gate passes) — but that paragraph explains the deduction, not
    // the zero, and it is not an alert.
    expect(screen.queryAllByRole('alert').length).toBe(0);
    expect(
      hintTexts().some((t) => t.startsWith('Already 1,600 g lighter')),
    ).toBe(true);
  });

  it('one radio away, Custom amount explains the very state Whole batch prints bare', () => {
    // The sharpest form of the defect, and the shortest road to the fix: the predicate,
    // the wording, the remedy and the mutual exclusion with targetExceedsPaste ALREADY
    // exist, in PortionDilutionResults' `unmeasuredPasteAlreadyThinner`
    // (solutionGrams - wholeBatchPasteBasis < 0). Custom amount refuses and says why; Whole
    // batch, same recipe, same panel, one radio apart, prints "0 g" and nothing else.
    const settings = {
      lyeType: 'koh' as const,
      soapConcentrationPercent: '65',
      splitLiquids: [GLYCERIN_400],
    };
    const vm = viewModelFor(settings);
    render(
      <DilutionPanel
        dilution={vm.dilution}
        soapConcentrationPercent={settings.soapConcentrationPercent}
        onSoapConcentrationChange={() => {}}
        weightUnit="g"
        altLiquidWaterGrams={vm.splitLiquidPasteWater}
        unknownLiquidGrams={vm.unknownLiquidGrams}
        overDilutionCertain={vm.overDilutionCertain}
        bottledSolutionGrams={vm.bottledSolutionGrams}
        cookWaterGrams={vm.cookWaterGrams}
        dilutionMode="concentration"
        waterPasteRatio="2"
        measuredPasteGrams=""
        measuredPasteIsRemaining={false}
        dilutionScope="portion"
        targetMl="500"
        wholeBatchPasteGrams={vm.wholeBatchPasteGrams}
        onMeasuredPasteGramsChange={() => {}}
        onMeasuredPasteIsRemainingChange={() => {}}
        onDilutionScopeChange={() => {}}
        onTargetMlChange={() => {}}
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    expect(
      hintTexts().some((t) =>
        t.startsWith(
          'The paste is already more dilute than the target above, so there is no dilution water to divide up.',
        ),
      ),
    ).toBe(true);
    // Custom amount sizes nothing here, which is right — and is why the whole-batch row
    // being a live-looking "0 g" with no such sentence is the asymmetry to close.
    expect(screen.queryByText('Water to add')).toBeNull();
  });

  it('the printed batch sheet is silent in the same way', () => {
    // The sheet is the page carried to the bench, so it is a second surface the fix has to
    // cover — it prints the same corrected figure through the same shared helper and has no
    // branch for this state either.
    const vm = viewModelFor({
      lyeType: 'koh',
      soapConcentrationPercent: '65',
      splitLiquids: [GLYCERIN_400],
    });
    render(<BatchSheet data={vm.batchSheetData} />);
    const dilutionSection = Array.from(
      document.querySelectorAll('.batch-sheet__section'),
    ).find((s) => s.querySelector('h2')?.textContent === 'Dilution')!;
    const text = dilutionSection.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Dilution water to add0 g');
    // DEFECT: not one note beside it.
    expect(dilutionSection.querySelectorAll('.batch-sheet__note').length).toBe(0);
  });
});

describe('DEFECT 2 (unfixed, pre-existing): a measured paste makes the bottled mass over-count the solids', () => {
  // WHAT HAPPENS. `correctedDilutionWaterGrams` short-circuits on a valid whole-batch
  // measurement and returns `solutionGrams - measured` WITHOUT ever reading
  // `wholeBatchPasteGrams`. `computeBottledSolutionGrams` then builds
  // `base = measured + (solutionGrams - measured)` = exactly `solutionGrams`, and adds
  // `extrasGrams - splitLiquidPasteWaterGrams` on top — which is the alternative liquid's
  // SOLIDS plus any additives. But the measured pot already contains those solids: the
  // maker weighed them. So the finished-product mass is over by the solids.
  //
  // Pre-existing, not a regression: both branches over-counted before the solids work
  // (the unmeasured base was anhydrous + cookWater + dilutionWaterGrams, also exactly
  // solutionGrams). The recent work fixed the unmeasured branch and left this one byte-
  // identical, which is why the two now disagree.
  //
  // WHAT THE CORRECT BEHAVIOUR WOULD BE. 4,051.11 g with a measurement, the same as
  // without one: the solids must be counted once, and the measurement already counts them.
  //
  // A FAILURE HERE IS THE FIX LANDING.

  const settings = {
    lyeType: 'koh' as const,
    soapConcentrationPercent: '30',
    splitLiquids: [MILK_200],
  };
  // The corrected pot, rounded — a scale reading a maker of this batch would plausibly get,
  // and comfortably inside both measured-paste guards (>= 1,215.33 anhydrous,
  // <= 4,051.11 solution), so it is applied rather than rejected.
  const MEASURED = '1745';

  it('the same recipe prices 64 g heavier with a measurement than without one', () => {
    const unmeasured = viewModelFor(settings);
    const measured = viewModelFor(settings, MEASURED, false);

    // Nothing about the batch changed — same solution, same pot, same 64 g of milk solids
    // (200 g at 68% water).
    expect(unmeasured.dilution!.solutionGrams).toBeCloseTo(4051.11, 1);
    expect(measured.dilution!.solutionGrams).toBeCloseTo(4051.11, 1);
    expect(unmeasured.wholeBatchPasteGrams!).toBeCloseTo(1745.33, 1);
    expect(unmeasured.extrasGrams - unmeasured.splitLiquidPasteWater).toBeCloseTo(64, 3);

    // Unmeasured: right. There are no additives and no append-mode post-cook oil here, so
    // the bottled mass IS the solution.
    expect(unmeasured.bottledSolutionGrams!).toBeCloseTo(4051.11, 1);

    // DEFECT: measured, the same batch gains the milk's solids a second time.
    expect(measured.bottledSolutionGrams!).toBeCloseTo(4115.11, 1);
    expect(measured.bottledSolutionGrams! - unmeasured.bottledSolutionGrams!).toBeCloseTo(64, 3);
  });

  it('and the panel prints the inflated mass as "≈ Finished product"', () => {
    const measured = viewModelFor(settings, MEASURED, false);
    renderPanel(measured, settings.soapConcentrationPercent, MEASURED, false);
    // The row only appears at all because the over-count pushed the bottled mass past the
    // solution — unmeasured, the two match and the row is suppressed (asserted below).
    expect(rowText('≈ Finished product')).toBe('4,115 g');
    expect(rowText('Finished solution')).toBe('4,051 g');
    // …and the volume the bottle count is derived from follows it: 4,115.11 / 1.03.
    expect(rowText('≈ Finished volume')).toBe('3,995 ml');

    cleanup();
    const unmeasured = viewModelFor(settings);
    renderPanel(unmeasured, settings.soapConcentrationPercent);
    expect(screen.queryByText('≈ Finished product')).toBeNull();
    expect(rowText('≈ Finished volume')).toBe('3,933 ml');
  });

  it('the cause: the measured branch never reaches the wholeBatchPasteGrams correction', () => {
    // Passing the corrected pot or omitting it makes no difference once a valid measurement
    // is present — that is the short-circuit, and it is what makes this branch byte-
    // identical to its pre-solids-work self. Without a measurement the same argument moves
    // the answer by exactly the solids, which is the correction the measured branch misses.
    const vm = viewModelFor(settings);
    const args = {
      dilution: vm.dilution!,
      cookWaterGrams: vm.cookWaterGrams,
      extrasGrams: vm.extrasGrams,
      splitLiquidPasteWaterGrams: vm.splitLiquidPasteWater,
      wholeBatchPasteGrams: vm.wholeBatchPasteGrams,
    };
    const withCorrection = computeBottledSolutionGrams({
      ...args, measuredPasteGrams: MEASURED, measuredPasteIsRemaining: false,
    });
    const withoutCorrection = computeBottledSolutionGrams({
      ...args, wholeBatchPasteGrams: undefined,
      measuredPasteGrams: MEASURED, measuredPasteIsRemaining: false,
    });
    // DEFECT: identical — the correction is inert on this path.
    expect(withCorrection).toBeCloseTo(withoutCorrection, 6);

    // The control: with no measurement the same argument is decisive.
    expect(
      computeBottledSolutionGrams({ ...args, wholeBatchPasteGrams: undefined }) -
        computeBottledSolutionGrams(args),
    ).toBeCloseTo(64, 3);
  });
});

describe('DEFECT 3 (unfixed): the head-start hint never renders on a glycerin recipe', () => {
  // WHAT HAPPENS. The "Already N g lighter" paragraph is gated on `altLiquidWaterGrams > 0`
  // (DilutionPanel), which is `splitLiquidPasteWater` from the view model — the liquid's
  // WATER only. Glycerin's waterFraction is 0, so that is exactly 0 for any amount of it,
  // and the paragraph is gated off entirely. Meanwhile the pour figure is derived from
  // `wholeBatchPasteGrams`, which counts the glycerin as SOLIDS — so it drops by the full
  // glycerin mass with nothing on screen explaining why.
  //
  // WHAT THE CORRECT BEHAVIOUR WOULD BE. The gate should be "this liquid took something off
  // the water to add" — water OR solids — so a glycerin recipe gets the solids-only wording
  // the paragraph's own branch already contains ("… and N g of solids that take up room in
  // the finished solution").
  //
  // A FAILURE HERE IS THE FIX LANDING.

  const AT_30 = { lyeType: 'koh' as const, soapConcentrationPercent: '30' };

  it('400 g of glycerin takes 400 g off the pour with no paragraph at all', () => {
    const plain = viewModelFor(AT_30);
    const glycerin = viewModelFor({ ...AT_30, splitLiquids: [GLYCERIN_400] });

    // The gate's input is zero however much glycerin is in the pot…
    expect(glycerin.splitLiquidPasteWater).toBe(0);
    // …while the paste the pour is derived from is 400 g heavier than the plain recipe's.
    expect(glycerin.wholeBatchPasteGrams! - plain.wholeBatchPasteGrams!).toBeCloseTo(400, 3);

    renderPanel(plain, AT_30.soapConcentrationPercent);
    expect(rowText('Dilution water to add')).toBe('2,506 g');
    const plainPour = rowGrams('Dilution water to add');
    cleanup();

    renderPanel(glycerin, AT_30.soapConcentrationPercent);
    expect(rowText('Dilution water to add')).toBe('2,106 g');
    expect(plainPour - rowGrams('Dilution water to add')).toBe(400);
    // DEFECT: the 400 g drop is unexplained — no head-start paragraph, and no alert either.
    expect(hintTexts().some((t) => t.startsWith('Already '))).toBe(false);
    expect(screen.queryAllByRole('alert').length).toBe(0);
  });

  it('the paragraph itself works — it is only the water-only gate that withholds it', () => {
    // Same panel, same solids-aware wording, on a liquid that happens to carry water. This
    // is the control that keeps the assertion above honest: the paragraph is not missing,
    // it is gated off.
    const milk = viewModelFor({ ...AT_30, splitLiquids: [MILK_200] });
    expect(milk.splitLiquidPasteWater).toBeCloseTo(136, 3);
    renderPanel(milk, AT_30.soapConcentrationPercent);
    expect(
      hintTexts().some((t) =>
        t.startsWith(
          'Already 200 g lighter: 136 g of water that went into the paste, and 64 g of solids',
        ),
      ),
    ).toBe(true);
  });
});

describe('DEFECT 4 (unfixed): "Total water" no longer reconciles with the pour', () => {
  // WHAT HAPPENS. "Total water" is `dilution.totalWaterGrams` — solutionGrams - anhydrous,
  // a WATER-only figure. "Dilution water to add" is now the solids-corrected
  // `solutionGrams - wholeBatchPasteGrams`. Subtracting one from the other used to recover
  // the water already in the paste; it now over-states it by exactly the alternative
  // liquid's solids, and the gap scales with the liquid.
  //
  // Nothing on screen names the difference, and the two rows sit one above the other in the
  // same grid.
  //
  // WHAT THE CORRECT BEHAVIOUR WOULD BE. Either the total row becomes the corrected pot's
  // total (so the rows reconcile again), or the panel states that the pour figure also
  // displaces the liquid's solids. Today it does neither.
  //
  // A FAILURE HERE IS THE FIX LANDING.

  it('milk 200 g at 30%: the rows imply 530 g of paste water where the paste holds 466 g', () => {
    const vm = viewModelFor({
      lyeType: 'koh',
      soapConcentrationPercent: '30',
      splitLiquids: [MILK_200],
    });
    // Core's own identity is intact — the divergence is entirely between the printed pour
    // and calculateDilution's figure.
    expect(vm.dilution!.totalWaterGrams - vm.cookWaterGrams).toBeCloseTo(
      vm.dilution!.dilutionWaterGrams,
      6,
    );
    expect(vm.cookWaterGrams).toBeCloseTo(466, 3);

    renderPanel(vm, '30');
    expect(rowText('Total water')).toBe('2,836 g');
    expect(rowText('Dilution water to add')).toBe('2,306 g');
    // DEFECT: 530 g implied against 466 g of real paste water — over by the milk's 64 g of
    // solids.
    const implied = rowGrams('Total water') - rowGrams('Dilution water to add');
    expect(implied).toBe(530);
    expect(implied - vm.cookWaterGrams).toBeCloseTo(64, 0);
  });

  it('glycerin 400 g at 30%: the same gap is 400 g, because the gap IS the solids', () => {
    const vm = viewModelFor({
      lyeType: 'koh',
      soapConcentrationPercent: '30',
      splitLiquids: [GLYCERIN_400],
    });
    expect(vm.cookWaterGrams).toBeCloseTo(330, 3);

    renderPanel(vm, '30');
    expect(rowText('Total water')).toBe('2,836 g');
    expect(rowText('Dilution water to add')).toBe('2,106 g');
    const implied = rowGrams('Total water') - rowGrams('Dilution water to add');
    expect(implied).toBe(730);
    // DEFECT: 400 g over — the whole glycerin mass, since none of it is water.
    expect(implied - vm.cookWaterGrams).toBeCloseTo(400, 0);
  });

  it('a recipe with no alternative liquid still reconciles exactly', () => {
    // The control: the gap is the SOLIDS, so with no solids there is no gap. Without this
    // the two assertions above could pass on a panel that was simply wrong everywhere.
    const vm = viewModelFor({ lyeType: 'koh', soapConcentrationPercent: '30' });
    renderPanel(vm, '30');
    expect(rowGrams('Total water') - rowGrams('Dilution water to add')).toBe(
      Math.round(vm.cookWaterGrams),
    );
  });
});
