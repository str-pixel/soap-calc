// @vitest-environment jsdom
/**
 * THE FORMER DILUTION DEFECTS, NOW PINNED AS FIXED BEHAVIOUR.
 *
 * Every assertion in this file used to pin behaviour that was WRONG — four defects found in
 * review, deliberately deferred, and described only in prose, so nothing stopped them
 * drifting. Each test carried the correct behaviour in its comment and said that a failure
 * was the signal the defect had been FIXED. All four were then fixed together, and every
 * assertion here was flipped to the corrected expectation: this file now guards the fixes
 * rather than the bugs. A failure here means a fix regressed. A fifth (the measured-paste
 * floor, below) was found and fixed afterwards and is pinned here for the same reason: it is
 * the same wiring, and it is only visible end to end.
 *
 * The figures are driven end-to-end — the real `useRecipeViewModel`, the real
 * `DilutionPanel` / `BatchSheet`, wired the way `App.tsx` wires them — so a regression
 * anywhere along that chain shows up here.
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

describe('DEFECT 1 (fixed): a corrected paste past the target says so instead of printing "0 g" bare', () => {
  // WHAT USED TO HAPPEN. `correctedDilutionWaterGrams` clamps `solutionGrams -
  // wholeBatchPasteGrams` at zero (lib/measuredPaste). A big low-water alternative liquid can
  // push the CORRECTED paste past the whole target solution while `targetExceedsPaste` —
  // computed by calculateDilution from anhydrous + WATER only, so blind to the liquid's
  // solids — stays false. The clamp then fires and the batch row prints "0 g", while every
  // alert that could explain it was gated on `targetExceedsPaste` (DilutionPanel's "already
  // more dilute" branch) or on a MEASURED reading (`measurementRejection.exceedsSolution`).
  // Neither is in play, so the panel and the printed sheet said nothing at all.
  //
  // The 0 g is HONEST — the pot really cannot reach the target, so there is no water to add.
  // The silence was the defect.
  //
  // WHAT IT GUARANTEES NOW. An alert on the same footing as the targetExceedsPaste one and
  // mutually exclusive with it, keyed on the corrected pot exceeding the target solution
  // (`wholeBatchPasteGrams > solutionGrams`) rather than on the water-only flag — quoting
  // both figures, and naming the same remedy Custom amount names for the identical state.
  // The printed sheet carries the twin. Nothing about the guards changed: the 0 g is still
  // the honest number, and this is display only.

  it('glycerin 400 g at a 65% target: 0 g on screen, and one alert saying why', () => {
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
    // FIXED: exactly one alert, and it accounts for the zero — no more, since the
    // targetExceedsPaste branch this one subsumes must not fire alongside it.
    const alerts = screen.queryAllByRole('alert');
    expect(alerts.length).toBe(1);
    const alert = alerts[0]!.textContent!.replace(/\s+/g, ' ');
    // Both sides of the comparison it asserts, so the maker can check the claim…
    expect(alert).toContain('already more dilute than the target above');
    expect(alert).toContain('1,945 g');
    expect(alert).toContain('1,870 g');
    // …and the remedy Custom amount gives for the same state, from the same shared wording.
    expect(alert).toContain('Lower the target concentration above (more water)');
    expect(hintTexts().some((t) => /more dilute|cannot be diluted|past the target/.test(t))).toBe(
      true,
    );
  });

  it('1,600 g canned coconut milk on 1,000 g oils at a 40% target: 0 g on screen, one alert', () => {
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
    // FIXED: one alert, quoting this recipe's own two figures rather than the glycerin
    // case's — the branch reads the pot it was given, it does not hard-code a scenario.
    const alerts = screen.queryAllByRole('alert');
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.textContent!.replace(/\s+/g, ' ')).toContain(
      'it weighs 3,145 g against the 3,038 g its soap makes at that concentration',
    );
    // The head-start hint still prints alongside and still explains the DEDUCTION rather
    // than the zero — the two paragraphs answer different questions and both belong.
    expect(
      hintTexts().some((t) => t.startsWith('Already 1,600 g lighter')),
    ).toBe(true);
  });

  it('Custom amount still explains the state Whole batch used to print bare', () => {
    // The sharpest form of the defect, and the shortest road that was taken to the fix: the
    // predicate, the wording, the remedy and the mutual exclusion with targetExceedsPaste
    // ALREADY existed, in PortionDilutionResults' `unmeasuredPasteAlreadyThinner`
    // (solutionGrams - wholeBatchPasteBasis < 0). Custom amount refused and said why; Whole
    // batch, same recipe, same panel, one radio apart, printed "0 g" and nothing else. This
    // case is unchanged by the fix and stays as the anchor the Whole-batch twin is worded
    // against — if this sentence moves, that one has to move with it.
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

  it('the printed batch sheet carries the twin note', () => {
    // The sheet is the page carried to the bench, so it is a second surface the fix had to
    // cover — it prints the same corrected figure through the same shared helper and had no
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
    // FIXED: exactly one note, quoting the same two figures the panel does. The sheet has
    // no dilution-mode toggle, so it names the concentration outright where the panel
    // defers to dilutionTargetWording.
    const notes = dilutionSection.querySelectorAll('.batch-sheet__note');
    expect(notes.length).toBe(1);
    const note = notes[0]!.textContent!.replace(/\s+/g, ' ');
    expect(note).toContain('already more dilute than 65%');
    expect(note).toContain('it weighs 1,945 g against the 1,870 g');
    expect(note).toContain('there is no dilution water to add');
  });
});

describe('DEFECT 2 (fixed, was pre-existing): a measured paste no longer over-counts the solids', () => {
  // WHAT USED TO HAPPEN. `correctedDilutionWaterGrams` short-circuits on a valid whole-batch
  // measurement and returns `solutionGrams - measured` WITHOUT ever reading
  // `wholeBatchPasteGrams` — which is correct for a POUR: the measurement is the pot,
  // whatever it is made of. `computeBottledSolutionGrams` then built
  // `base = measured + (solutionGrams - measured)` = exactly `solutionGrams`, and added
  // `extrasGrams - splitLiquidPasteWaterGrams` on top — the alternative liquid's SOLIDS plus
  // any additives. But the measured pot already contains those solids: the maker weighed
  // them. So the finished-product mass came out over by the solids, and it scaled with the
  // liquid rather than being a fixed offset.
  //
  // Pre-existing, not a regression: both branches over-counted before the solids work
  // (the unmeasured base was anhydrous + cookWater + dilutionWaterGrams, also exactly
  // solutionGrams). That work fixed the unmeasured branch and left this one byte-identical,
  // which is why the two came to disagree.
  //
  // WHAT IT GUARANTEES NOW. 4,051.11 g with a measurement, the same as without one: the
  // solids are counted once, and the measurement already counts them. Fixed in
  // computeBottledSolutionGrams, at the point that knows what its base contains — the pour
  // helper is unchanged, because its short-circuit was never wrong for the pour.

  const settings = {
    lyeType: 'koh' as const,
    soapConcentrationPercent: '30',
    splitLiquids: [MILK_200],
  };
  // The corrected pot, rounded — a scale reading a maker of this batch would plausibly get,
  // and comfortably inside both measured-paste guards (>= 1,215.33 anhydrous,
  // <= 4,051.11 solution), so it is applied rather than rejected.
  const MEASURED = '1745';

  it('the same recipe prices the same with a measurement as without one', () => {
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

    // FIXED: measured, the same batch prices identically — the milk's solids are in the
    // reading, so they are not added on top of it.
    expect(measured.bottledSolutionGrams!).toBeCloseTo(4051.11, 1);
    expect(measured.bottledSolutionGrams! - unmeasured.bottledSolutionGrams!).toBeCloseTo(0, 6);
  });

  it('and the panel no longer prints an inflated "≈ Finished product" beside the solution', () => {
    const measured = viewModelFor(settings, MEASURED, false);
    renderPanel(measured, settings.soapConcentrationPercent, MEASURED, false);
    // The row used to appear only because the over-count pushed the bottled mass past the
    // solution (it prints when the two differ). They match now, so it is suppressed — the
    // same way it already was without a measurement, asserted below.
    expect(screen.queryByText('≈ Finished product')).toBeNull();
    expect(rowText('Finished solution')).toBe('4,051 g');
    // …and the volume the bottle count is derived from follows: 4,051.11 / 1.03, not
    // 4,115.11 / 1.03 (3,995 ml).
    expect(rowText('≈ Finished volume')).toBe('3,933 ml');

    cleanup();
    const unmeasured = viewModelFor(settings);
    renderPanel(unmeasured, settings.soapConcentrationPercent);
    expect(screen.queryByText('≈ Finished product')).toBeNull();
    expect(rowText('≈ Finished volume')).toBe('3,933 ml');
  });

  it('the corrected pot is now decisive on the measured path too, not just the unmeasured one', () => {
    // Passing the corrected pot or omitting it used to make no difference once a valid
    // measurement was present — the short-circuit, and what made this branch byte-identical
    // to its pre-solids-work self. It is decisive on both paths now, and by the same 64 g:
    // the solids are knowable only from wholeBatchPasteGrams, so a caller that supplies none
    // still falls back to the pre-correction formula on either path.
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
    // FIXED: the correction bites here too — the uncorrected call is the old, heavy answer.
    expect(withoutCorrection - withCorrection).toBeCloseTo(64, 3);
    expect(withCorrection).toBeCloseTo(4051.11, 1);

    // The control, unchanged: with no measurement the same argument is decisive.
    expect(
      computeBottledSolutionGrams({ ...args, wholeBatchPasteGrams: undefined }) -
        computeBottledSolutionGrams(args),
    ).toBeCloseTo(64, 3);
  });
});

describe('DEFECT 3 (fixed): the head-start hint renders on a glycerin recipe', () => {
  // WHAT USED TO HAPPEN. The "Already N g lighter" paragraph was gated on
  // `altLiquidWaterGrams > 0` (DilutionPanel), which is `splitLiquidPasteWater` from the view
  // model — the liquid's WATER only. Glycerin's waterFraction is 0, so that is exactly 0 for
  // any amount of it, and the paragraph was gated off entirely. Meanwhile the pour figure is
  // derived from `wholeBatchPasteGrams`, which counts the glycerin as SOLIDS — so it dropped
  // by the full glycerin mass with nothing on screen explaining why.
  //
  // WHAT IT GUARANTEES NOW. The gate is "this liquid took something off the water to add" —
  // water OR solids — so a zero-water liquid gets the paragraph, in solids-only wording of
  // its own rather than the mixed one ("0 g of water that went into the paste" is a clause
  // about nothing). The mixed and water-only wordings are untouched.

  const AT_30 = { lyeType: 'koh' as const, soapConcentrationPercent: '30' };

  it('400 g of glycerin takes 400 g off the pour, and the paragraph says so', () => {
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
    // FIXED: the 400 g drop is accounted for, and the paragraph quotes the whole 400 g
    // rather than a water term that would have read "0 g".
    expect(
      hintTexts().some((t) =>
        t.startsWith(
          'Already 400 g lighter: the alternative liquid brought no water, and all of it is solids that take up room in the finished solution.',
        ),
      ),
    ).toBe(true);
    // Still not an alert: nothing here is wrong or impossible. At a 30% target this pot is
    // nowhere near the solution, so defect 1's branch is correctly silent — the two answer
    // different questions and must not be conflated.
    expect(screen.queryAllByRole('alert').length).toBe(0);
  });

  it('the mixed water+solids wording is unchanged for a liquid that carries both', () => {
    // Same panel, same solids-aware wording, on a liquid that happens to carry water. This
    // was the control that kept the assertion above honest — the paragraph was never
    // missing, only gated off — and it now doubles as the pin that widening the gate left
    // the wording it already had alone.
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

describe('DEFECT 4 (fixed): "Total water" reconciles with the pour again', () => {
  // WHAT USED TO HAPPEN. "Total water" printed `dilution.totalWaterGrams` — solutionGrams -
  // anhydrous, core's WATER-only figure. "Dilution water to add" is the solids-corrected
  // `solutionGrams - wholeBatchPasteGrams`. Subtracting one from the other used to recover
  // the water already in the paste; it over-stated it by exactly the alternative liquid's
  // solids, and the gap scaled with the liquid. Nothing on screen named the difference, and
  // the two rows sit one above the other in the same grid.
  //
  // WHAT IT GUARANTEES NOW. The row is the water the finished solution actually holds:
  // core's total less the room the liquid's solids take up in it. That was the choice
  // between the two available fixes — the alternative was to leave the row alone and add a
  // solids line beside it — because core's figure was not merely unreconcilable, it was
  // WRONG about the bottle: the corrected pour fills the pot to solutionGrams with the
  // solids inside it, so the water that ends up there really is a solids' worth less. A row
  // labelled "Total water" claiming water that is not in the bottle cannot be rescued by a
  // footnote. The subtraction works again as a consequence, not as the goal.

  it('milk 200 g at 30%: the rows imply exactly the 466 g of water the paste holds', () => {
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
    // FIXED: 2,836 g less the milk's 64 g of solids. Core's own figure is untouched — only
    // what the panel prints for the finished solution changed.
    expect(rowText('Total water')).toBe('2,772 g');
    expect(rowText('Dilution water to add')).toBe('2,306 g');
    const implied = rowGrams('Total water') - rowGrams('Dilution water to add');
    expect(implied).toBe(466);
    expect(implied - vm.cookWaterGrams).toBeCloseTo(0, 0);
  });

  it('glycerin 400 g at 30%: it closes there too, and by the whole 400 g', () => {
    // The correction scales with the liquid, so this is the case that would survive a fix
    // hard-coded to one recipe: none of the glycerin is water, so the row moves by all of it.
    const vm = viewModelFor({
      lyeType: 'koh',
      soapConcentrationPercent: '30',
      splitLiquids: [GLYCERIN_400],
    });
    expect(vm.cookWaterGrams).toBeCloseTo(330, 3);

    renderPanel(vm, '30');
    expect(rowText('Total water')).toBe('2,436 g');
    expect(rowText('Dilution water to add')).toBe('2,106 g');
    const implied = rowGrams('Total water') - rowGrams('Dilution water to add');
    expect(implied).toBe(330);
    expect(implied - vm.cookWaterGrams).toBeCloseTo(0, 0);
  });

  it('a recipe with no alternative liquid is byte-identical, and still reconciles exactly', () => {
    // The control: the correction is the SOLIDS, so with no solids there is nothing to
    // correct and this row prints core's own figure unchanged. Without this the two
    // assertions above could pass on a panel that was simply wrong everywhere.
    const vm = viewModelFor({ lyeType: 'koh', soapConcentrationPercent: '30' });
    renderPanel(vm, '30');
    expect(rowGrams('Total water')).toBe(Math.round(vm.dilution!.totalWaterGrams));
    expect(rowGrams('Total water') - rowGrams('Dilution water to add')).toBe(
      Math.round(vm.cookWaterGrams),
    );
  });
});

describe('DEFECT 5 (fixed): the paste floor counts solids that cannot boil off', () => {
  // WHAT USED TO HAPPEN. `measuredPasteRejectionFor` floored a measured paste at the
  // ANHYDROUS soap alone. But the pot also holds the cook water and, on a split-liquid
  // recipe, the alternative liquid's non-water SOLIDS — and solids do not leave during the
  // cook. So a reading below anhydrous + solids describes a pot that cannot exist, and every
  // guard passed it: the panel and the printed sheet then poured from it.
  //
  // Cook water is deliberately NOT in the floor. It evaporates — that is the whole reason
  // the reference tells the maker to weigh the paste — so a reading lighter than the recipe
  // predicts is the expected, meaningful case the feature exists to accept.
  //
  // WHAT IT GUARANTEES NOW. 385 g of glycerin (all of it solids) on the starter recipe makes
  // a 1,930 g pot whose undissolvable contents weigh 1,600 g. A typed 1,400 g is refused,
  // with an alert naming that floor and why it is there, and every figure downstream — the
  // batch row, the printed sheet, the bottled mass — falls back to the corrected pot
  // together. Nothing rejects in one place and applies in another.

  const GLYCERIN_385: SplitLiquidRow = { ...GLYCERIN_400, key: 'g2', amount: '385' };
  const SETTINGS = {
    lyeType: 'koh' as const,
    soapConcentrationPercent: '30',
    splitLiquids: [GLYCERIN_385],
  };
  const IMPOSSIBLE = '1400';

  it('the reading is refused, and the alert names the floor it missed', () => {
    const vm = viewModelFor(SETTINGS, IMPOSSIBLE, false);
    // The pot, and the mass in it that cannot boil off.
    expect(vm.cookWaterGrams).toBeCloseTo(330, 3);
    expect(vm.wholeBatchPasteGrams!).toBeCloseTo(1930.33, 1);
    expect(vm.dilution!.anhydrousGrams + 385).toBeCloseTo(1600.33, 1);
    // …and the reading clears the OLD floor by 185 g, which is why nothing caught it.
    expect(Number(IMPOSSIBLE)).toBeGreaterThan(vm.dilution!.anhydrousGrams);

    renderPanel(vm, SETTINGS.soapConcentrationPercent, IMPOSSIBLE, false);
    const alerts = screen.queryAllByRole('alert');
    expect(alerts.length).toBe(1);
    const alert = alerts[0]!.textContent!.replace(/\s+/g, ' ');
    expect(alert).toContain('less than the 1,600 g of soap and alternative-liquid solids');
    expect(alert).toContain('the cook boils off water, not solids');
  });

  it('the row, the pour and the bottled mass all fall back to the corrected pot together', () => {
    const rejected = viewModelFor(SETTINGS, IMPOSSIBLE, false);
    const blank = viewModelFor(SETTINGS);

    renderPanel(rejected, SETTINGS.soapConcentrationPercent, IMPOSSIBLE, false);
    // 4,051 − 1,930, not the 4,051 − 1,400 = 2,651 g the accepted reading used to pour: a
    // 530 g over-dose derived from a pot 200 g lighter than its own glycerin.
    expect(rowText('Dilution water to add')).toBe('2,121 g');
    // No "uses your measured paste" note either — the panel does not claim a reading it
    // refused one paragraph above.
    expect(hintTexts().some((t) => /uses your measured paste/i.test(t))).toBe(false);
    cleanup();

    // The same figure the field-blank panel prints, which is what "falls back" means.
    renderPanel(blank, SETTINGS.soapConcentrationPercent);
    expect(rowText('Dilution water to add')).toBe('2,121 g');
    // The bottled mass follows the same basis: 4,051 g of solution with the glycerin inside
    // it, counted once, measured or not.
    expect(rejected.bottledSolutionGrams!).toBeCloseTo(blank.bottledSolutionGrams!, 6);
    expect(rejected.bottledSolutionGrams!).toBeCloseTo(rejected.dilution!.solutionGrams, 6);
  });

  it('the printed sheet refuses it too — the bench copy cannot disagree with the screen', () => {
    const vm = viewModelFor(SETTINGS, IMPOSSIBLE, false);
    render(<BatchSheet data={vm.batchSheetData} />);
    const dilutionSection = Array.from(
      document.querySelectorAll('.batch-sheet__section'),
    ).find((s) => s.querySelector('h2')?.textContent === 'Dilution')!;
    const text = dilutionSection.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Dilution water to add2,121 g');
    expect(text).not.toContain('uses the measured paste weight');
  });

  it('a reading the cook could actually produce is still accepted, and still wins', () => {
    // The control, and the line the fix must not cross: 1,750 g is 180 g lighter than the
    // computed pot because the cook boiled that water off — exactly the reading weighing the
    // paste exists to capture. It is at or above the 1,600 g floor, so it is applied.
    const vm = viewModelFor(SETTINGS, '1750', false);
    renderPanel(vm, SETTINGS.soapConcentrationPercent, '1750', false);
    expect(screen.queryAllByRole('alert').length).toBe(0);
    expect(rowText('Dilution water to add')).toBe('2,301 g'); // 4,051 − 1,750
    expect(hintTexts().some((t) => /uses your measured paste/i.test(t))).toBe(true);
  });
});
