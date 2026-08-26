// @vitest-environment jsdom
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { DilutionPanel } from './DilutionPanel';
import { calculateDilution, type DilutionResult } from '@soap-calc/core';
// The accessible-name algorithm (aria-label, then aria-labelledby, then the wrapping
// <label>) — shared with SoapingTemperaturePanel.test.tsx and PricingPanel.test.tsx, which
// assert the same Label-in-Name property on their own controls. See the helper's own doc
// comment for why it's written out rather than pulled from a library.
import { accessibleNameOf } from '../testing/accessibleName';

afterEach(cleanup);

const RESULT: DilutionResult = {
  anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
  dilutionWaterGrams: 2400, glycerinGrams: 110, soapConcentrationPercent: 30, targetExceedsPaste: false,
};

// The props every scope/unit test needs but none of them varies. Declared here rather
// than repeated per test because these tests pass twice as many props as the older ones.
const BASE = {
  dilution: RESULT,
  soapConcentrationPercent: '30',
  onSoapConcentrationChange: () => {},
  weightUnit: 'g' as const,
  measuredPasteGrams: '',
  onMeasuredPasteGramsChange: () => {},
  onTargetMlChange: () => {},
  onDilutionScopeChange: () => {},
};

// The alert channel is where this panel's one-verdict-per-target rule is enforced, so
// several tests below count and IDENTIFY paragraphs rather than asserting a single string:
// the same state can regress in two opposite directions — nothing said, or two paragraphs
// saying it — and only a count that names what it counted tells those apart.
const alertTexts = () =>
  screen.queryAllByRole('alert').map((a) => a.textContent!.replace(/\s+/g, ' '));
const SOLUBILITY_CEILING = /above what even a coconut-heavy recipe can fully dissolve/i;
// Everything this panel says to refuse a READING or a target outright, as opposed to the
// solubility sentence, which describes the target and refuses nothing.
const refusalAlerts = () =>
  alertTexts().filter((t) =>
    /cannot be diluted to|already weighs more than|cannot be all of the paste|more than zero|thousands separator|already more dilute/i.test(
      t,
    ),
  );

test('renders the dilution figures', () => {
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  expect(screen.getByText('Dilution water to add')).toBeTruthy();
  // The pour figure shows a single unit at a time, switchable beside the heading.
  expect(screen.getByText('2,400 g')).toBeTruthy();
});

test('shows the finished volume and names the density', () => {
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  // 4,000 g ÷ 1.03 g/ml = 3,883 ml. Volume is what sizes the dilution vessel and the
  // packaging.
  expect(screen.getByText('≈ Finished volume')).toBeTruthy();
  expect(screen.getByText('3,883 ml')).toBeTruthy();
  // The density is a planning proxy, not a measured value — the panel must say so.
  expect(screen.getByText(/1\.03 g\/ml/)).toBeTruthy();
});

test('shows the target-exceeds-paste warning', () => {
  render(<DilutionPanel dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }} soapConcentrationPercent="90" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  expect(screen.getByRole('alert').textContent).toContain('more dilute');
});

test('shows a hint when dilution is null', () => {
  render(<DilutionPanel dilution={null} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  expect(screen.getByText(/Enter oils and a target/)).toBeTruthy();
});

test('editing the concentration calls onSoapConcentrationChange', () => {
  const onChange = vi.fn();
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={onChange} weightUnit="g" />);
  fireEvent.change(screen.getByLabelText('Target soap concentration percent'), { target: { value: '25' } });
  expect(onChange).toHaveBeenCalledWith('25');
});

test('shows the finished-product mass when extras make it exceed the solution', () => {
  // Solution-dosed additives (fragrance, pearlizer) and after-cook thickeners end up in the
  // product too: 4,000 g solution + 515 g extras. That mass is what the finished VOLUME is
  // derived from, so it must be on screen or the volume cannot be reconciled with the rows
  // above it (code-review 2026-08-01).
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      bottledSolutionGrams={4515}
    />,
  );
  expect(screen.getByText(/Finished product/)).toBeTruthy();
  expect(screen.getByText('4,515 g')).toBeTruthy();
  // 4,515 g ÷ 1.03 = 4,383 ml — the volume follows the product mass, not the solution.
  expect(screen.getByText('4,383 ml')).toBeTruthy();
});

test('omits the finished-product row when it matches the solution', () => {
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
    />,
  );
  expect(screen.queryByText(/Finished product/)).toBeNull();
});

describe('intended-use dilution targets', () => {
  const dilution = {
    anhydrousGrams: 1000, solutionGrams: 3333, totalWaterGrams: 2333,
    dilutionWaterGrams: 2000, glycerinGrams: 100, soapConcentrationPercent: 30,
    targetExceedsPaste: false,
  };
  const render30 = (percent = '30') =>
    render(
      <DilutionPanel
        dilution={{ ...dilution, soapConcentrationPercent: Number(percent) }}
        soapConcentrationPercent={percent}
        onSoapConcentrationChange={() => {}}
        weightUnit="g"
      />,
    );

  it('names the uses the current target suits', () => {
    render30('30');
    // 30% is the top of hand soap, the bottom of mechanic, and inside body wash.
    const summary = screen.getByText(/at 30% this suits/i);
    expect(summary.textContent?.toLowerCase()).toContain('hand soap');
    expect(summary.textContent?.toLowerCase()).toContain('mechanic');
  });

  it('lists every use with its range, and says so when none fits', () => {
    render30('55');
    expect(screen.getByText(/no common use calls for 55%/i)).toBeTruthy();
    // The full table still renders as reference.
    expect(screen.getByText('Dish soap')).toBeTruthy();
    expect(screen.getByText('Baby or gentle soap')).toBeTruthy();
  });

  it('warns when the target is above what any recipe can fully dissolve', () => {
    render30('55');
    // The warning's consequence is solubility, not viscosity: above every ceiling means no
    // recipe dissolves that much soap (LS:1519 supersaturated, lumps or a goopy layer) —
    // not that the pot "holds as a liquid" refuses to, which was the old wording's claim.
    const warning = screen.getByText(/above what even a coconut-heavy recipe/i);
    expect(warning.textContent).toMatch(/fully dissolve/i);
    expect(warning.textContent).not.toMatch(/as a liquid|thickens|\bsets?\b/i);
    cleanup();
    render30('30');
    expect(screen.queryByText(/above what even a coconut-heavy recipe/i)).toBeNull();
  });

  it('does not affirm a use band the soap cannot dissolve without warning in the same state', () => {
    // The one window where the affirmation and the ceiling cross: dish and laundry ranges
    // reach 45% while the solubility ceiling is 40%, so at a 45% target the uses summary
    // says "this suits dish soap, laundry soap" — and a round that filed the can't-dissolve
    // sentence under collapsed reference left that affirmation standing inline with zero
    // warnings, defended by a claim ("the summary already says no common use calls for N%")
    // that is false exactly here. The warning is a role="alert" — outside the prose budget
    // by the budget describe's own counting rule, and INSIDE the panel's one-verdict-per-
    // target rule: when something on screen is already answering for targetExceedsPaste, or
    // the corrected-pot verdict or an exceeds-solution rejection is, this stays silent
    // (those states assert something strictly stronger about the same target). Each of those
    // is asked as a RENDERING, not as a flag — see the Task 12 describe below for what the
    // difference was worth.
    render30('45');
    const summary = screen.getByText(/at 45% this suits/i);
    expect(summary.textContent?.toLowerCase()).toContain('dish soap');
    const warning = screen.getByRole('alert');
    expect(warning.textContent).toMatch(/above what even a coconut-heavy recipe/i);
    expect(warning.textContent).toMatch(/fully dissolve/i);
    // Live, not reference: it must be inline — never inside the collapsed notes.
    expect(warning.closest('details')).toBeNull();
  });

  it('does not go silent under a record, where the alert that used to subsume it is silent too', () => {
    // RETIRED WITH THE MODES, KEPT AS A CLAIM. Two cases stood here — one for ratio mode, one
    // for gradual (Tasks 1 and 9 of 2026-08-12-whole-app-review-fixes) — and both pinned the
    // same thing: the exceeds-solution refusal is excluded from a state that is not aiming at
    // the saved target, and keying this suppression to that refusal's FLAG rather than to its
    // RENDERING left a maker whose target sits above the solubility ceiling told nothing at
    // all. The states are gone; the exclusion is not — it is `planGoverns` now (spec §4), and
    // the record arm is the state that is not aiming at a target. So the hole is reachable by
    // exactly the same route and this is the cell that proves it is still closed.
    //
    // A 2,500 g reading against the saved 50% target's 2,400 g solution: exceedsSolution is
    // true, and its paragraph is plan-governs only, so it does not render. 2,500 g clears the
    // 1,200 g solids floor, so it IS the pot the record counts from — 1,200 / 2,500 = 48%,
    // eight points above the 40% no recipe dissolves past. One alert, and it is the record's
    // own wording, because the record arm has no target to call "this target".
    render(
      <DilutionPanel
        {...BASE}
        soapConcentrationPercent="50"
        dilution={{
          anhydrousGrams: 1200, solutionGrams: 2400, totalWaterGrams: 1200,
          dilutionWaterGrams: 1200, glycerinGrams: 110, soapConcentrationPercent: 50,
          targetExceedsPaste: false,
        }}
        measuredPasteGrams="2500"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        gradualWaterGrams="0"
        onGradualWaterChange={() => {}}
      />,
    );
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText(/The batch so far is at 48% — above what any recipe fully dissolves/i)).toBeTruthy();
    // The plan's own wording may not appear here: there is no target being aimed at.
    expect(screen.queryByText(/even a coconut-heavy recipe/i)).toBeNull();
  });

  it('speaks alongside a refusal that is only about the reading, not about the target', () => {
    // Task 13 (2026-08-12-whole-app-review-fixes). The same fixture as the two cases above —
    // a saved 50% target the recipe's own paste can reach, so targetExceedsPaste is false —
    // with a reading refused by the solids floor instead: 900 g is less than the 1,200 g of
    // soap the batch makes, so it cannot be all of the paste. That refusal is a
    // claim about the READING, and the flag it would otherwise stand in for is not set, so
    // nothing on screen is answering for this target and both paragraphs belong here.
    //
    // Pinned as the flag-FALSE anchor of the 2026-08-16 decision: a refusal about the
    // READING must never silence a sentence about the target. (When first written this
    // exercised the `targetExceedsPaste` gate on `overDilutionSpokenFor`'s rejection
    // disjunct from the FALSE side; that disjunct is gone — the flag-TRUE side now shows
    // the same pair, in the rewritten "speaks beside a rejection alert" loop below.)
    // Re-add any rejection-keyed suppression that no target verdict gates and the two
    // alerts here collapse to one — in exactly the state where the target has no other
    // voice.
    render(
      <DilutionPanel
        {...BASE}
        soapConcentrationPercent="50"
        dilution={{
          anhydrousGrams: 1200, solutionGrams: 2400, totalWaterGrams: 1200,
          dilutionWaterGrams: 1200, glycerinGrams: 110, soapConcentrationPercent: 50,
          targetExceedsPaste: false,
        }}
        measuredPasteGrams="900"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
      />,
    );
    // Document order: the reading's own refusal renders beside the input it describes, the
    // ceiling sentence below the figures.
    expect(alertTexts()).toEqual([
      expect.stringMatching(/cannot be all of the paste/i),
      expect.stringMatching(SOLUBILITY_CEILING),
    ]);
  });

  // The per-ARM props the two ceiling describes below both render with — one definition, so
  // their fixtures cannot drift apart on what an arm needs to mount. This replaces a
  // per-MODE map of the same shape: the three modes were the axis these suppressions had to
  // be swept along, and the axis is now which arm governs (spec §4). A 0 g record is used
  // for the record arm deliberately — ZERO IS A RECORD, so it exercises the arm at its
  // smallest, and it keeps the resolved concentration exactly anhydrous ÷ pot, which is what
  // makes each expectation below checkable by hand.
  const ARM_PROPS = {
    plan: {},
    record: { gradualWaterGrams: '0', onGradualWaterChange: () => {} },
  } as const;
  // The ceiling sentence in the record arm's own wording — it may not say "this target",
  // because the record arm has no target (spec §4's conversion table).
  const recordCeiling = (percent: string) =>
    new RegExp(`The batch so far is at ${percent}% — above what any recipe fully dissolves`, 'i');

  // ── Task 12 (2026-08-12-whole-app-review-fixes): the last flag-keyed clause ──
  // The suppression above stands down for a STRONGER VERDICT about the same target. Its
  // first clause read the raw targetExceedsPaste flag, but that flag's own alert is
  // suppressed by a valid paste reading — a measurement outranks the assumed cook water the
  // flag is derived from — so a reading silenced the verdict and the flag went on silencing
  // this sentence, leaving nothing at all on screen at a target ten points past what
  // dissolves. The cases below pin both directions: the sentence speaks wherever nothing
  // else does, and stays silent wherever something else already does.
  describe('the solubility ceiling, when the alert its suppression defers to is silent', () => {
    // Built by core rather than hand-written so the flag under test is core's own verdict:
    // 1,200 g of anhydrous soap cooked in 1,400 g of water at a saved 50% target makes a
    // 2,400 g solution holding 1,200 g of water, and 1,200 < 1,400 is targetExceedsPaste.
    // 50% is ten points above LS_MINIMUM_DILUTION_GUIDE's highest ceiling (40%,
    // coconut-heavy), so the solubility sentence is true of this target in every state
    // below — no reading about a pot can make an undissolvable target dissolvable.
    const OVER_CEILING = calculateDilution({
      anhydrousGrams: 1200,
      cookWaterGrams: 1400,
      kohGrams: 240,
      naohGrams: 0,
      soapConcentrationPercent: 50,
    })!;
    // A possible pot, and therefore an ACCEPTED reading: above the 1,200 g solids floor
    // (no split liquid, so the floor is the anhydrous soap) and under the 2,400 g solution.
    // Deliberately none of the fixture's other figures — 1,200 / 1,400 / 2,400 / 2,600 are
    // all distinct from it and from each other, so no assertion below can pass by matching
    // the wrong quantity.
    const VALID_READING = '2000';
    const renderOverCeiling = (
      arm: keyof typeof ARM_PROPS,
      props: Partial<ComponentProps<typeof DilutionPanel>> = {},
    ) =>
      render(
        <DilutionPanel
          {...BASE}
          soapConcentrationPercent="50"
          dilution={OVER_CEILING}
          cookWaterGrams={1400}
          wholeBatchPasteGrams={2600}
          {...ARM_PROPS[arm]}
          {...props}
        />,
      );
    const CEILING = SOLUBILITY_CEILING;
    const PASTE_ALREADY_THINNER = /the paste is already more dilute than 50%/i;

    it('is the fixture the flag is actually set on, and the reading is actually accepted', () => {
      // The positive control for everything below: without core's flag there is no
      // suppression to test, and without an ACCEPTED reading the state under test is the
      // rejected one instead. The paste-basis hint renders only on measuredPasteValid, and
      // it quotes the reading, so it witnesses both halves.
      expect(OVER_CEILING.targetExceedsPaste).toBe(true);
      renderOverCeiling('plan', { measuredPasteGrams: VALID_READING });
      expect(screen.getByText(/uses your measured paste \(2,000 g\)/i)).toBeTruthy();
    });

    it('speaks when a valid reading has silenced the alert it defers to', () => {
      // THE DEFECT (Task 12). The reading is accepted, so the "already more dilute" alert
      // stands down by design (a measurement outranks the flag) — and the ceiling sentence
      // used to stand down with it, keyed on the flag rather than on that alert's rendering.
      // Swept across all three modes when there were three; the modes are gone and the
      // record arm's own cell is below, so this is the plan arm's.
      renderOverCeiling('plan', { measuredPasteGrams: VALID_READING });
      const alerts = alertTexts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatch(CEILING);
    });

    it('still yields to the alert it defers to, with the reading cleared', () => {
      // The other direction, and the reproduction's own control: clear the field and the
      // stronger verdict is back on screen, so this sentence must not stack a second
      // paragraph on top of it.
      renderOverCeiling('plan', { measuredPasteGrams: '' });
      const alerts = alertTexts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatch(PASTE_ALREADY_THINNER);
      expect(alerts[0]).not.toMatch(CEILING);
    });

    it('speaks beside a rejection alert — a refusal about the reading is no verdict about the target', () => {
      // DECIDED 2026-08-16 (Task 14). 900 g is below the 1,200 g of soap the batch makes, so
      // the refusal says the reading "cannot be all of the paste" — a claim about the scale,
      // with nothing in it about what a 50% target can dissolve — and the ceiling speaks
      // beside it. The exact pair, in document order: the refusal beside the field it
      // describes, the ceiling below the figures — and never the same claim twice.
      renderOverCeiling('plan', { measuredPasteGrams: '900' });
      expect(alertTexts()).toEqual([
        expect.stringMatching(/cannot be all of the paste/i),
        expect.stringMatching(CEILING),
      ]);
    });

    it("speaks beside the can't-tell hedge — an uncertainty about the batch is not a verdict about the target", () => {
      // DECIDED 2026-08-16 (second round): the hedge says the BATCH's water is unknowable —
      // whether 50% is reachable with an undeclared liquid in the pot — while the ceiling
      // sentence is about the target, which no liquid moves. Both true, both render: the
      // ceiling as the one alert, the hedge as the plain paragraph it has always been.
      renderOverCeiling('plan', { measuredPasteGrams: '', unknownLiquidGrams: 300 });
      expect(alertTexts()).toEqual([expect.stringMatching(CEILING)]);
      expect(screen.getByText(/can't tell whether 50% is reachable/i)).toBeTruthy();
    });

    // ── THE RECORD ARM'S OWN SWEEP ─────────────────────────────────────────────────────
    // The cells the ratio and gradual iterations of the loop above used to hold. Their
    // subject — a state that is not aiming at the saved target, where every plan verdict is
    // gated off and the ceiling is the only thing left that can speak — is the record arm
    // now, and it is reachable by exactly the same route: `planGoverns` replaced the two
    // mode exclusions verbatim (spec §4). The wording changes with the arm and the figure
    // changes with it too: every % in record-governed copy is the RESOLVED %.
    describe('the record arm, where every plan verdict it defers to is gated off', () => {
      it('speaks in the record\'s own words, about the record\'s own concentration', () => {
        // 2,000 g pot, 0 g recorded → 1,200 / 2,000 = 60%, twenty points past the ceiling.
        // The plan's "already more dilute than 50%" alert is plan-governs only, so the
        // ceiling is the one voice — and it describes the batch rather than naming a target.
        renderOverCeiling('record', { measuredPasteGrams: VALID_READING });
        expect(alertTexts()).toEqual([expect.stringMatching(recordCeiling('60'))]);
        expect(screen.queryByText(CEILING)).toBeNull();
        expect(screen.queryByText(PASTE_ALREADY_THINNER)).toBeNull();
      });

      it('speaks with the reading cleared too, where the plan alert used to answer', () => {
        // The plan arm's own version of this cell yields to "already more dilute than 50%".
        // Under a record that verdict has no subject and is gated off — so unguarded, this
        // is the cell that would go silent at a batch past the ceiling. The computed pot is
        // 2,600 g: 1,200 / 2,600 = 46.15%, printed at the panel's 1 dp.
        renderOverCeiling('record', { measuredPasteGrams: '' });
        expect(alertTexts()).toEqual([expect.stringMatching(recordCeiling('46.2'))]);
      });

      it('speaks beside a refusal about the reading, exactly as the plan arm does', () => {
        renderOverCeiling('record', { measuredPasteGrams: '900' });
        expect(alertTexts()).toEqual([
          expect.stringMatching(/cannot be all of the paste/i),
          expect.stringMatching(recordCeiling('46.2')),
        ]);
      });

      it("drops the can't-tell hedge with the verdict it hedges over, and leaves no bare zero", () => {
        // The hedge is a claim about whether the PLAN's 50% is reachable, and it consumes
        // `overDilutionCertain` — which the view model makes false under a record. Left
        // ungated it would have printed "can't tell whether 50% is reachable" in the cells
        // where the app can tell. It goes with the verdict; what takes its place is the
        // plan-labelled caption §4 requires, so the plan's own "0 g" water row is never bare.
        renderOverCeiling('record', { measuredPasteGrams: '', unknownLiquidGrams: 300 });
        expect(alertTexts()).toEqual([expect.stringMatching(recordCeiling('46.2'))]);
        expect(screen.queryByText(/can't tell whether/i)).toBeNull();
        expect(screen.getByText(/^Plan: at 50%/)).toBeTruthy();
      });

      it('accounts for the plan\'s zero even where NOTHING is above the ceiling to warn about', () => {
        // The one cell with no alert at all, and the reason it is safe. A 3,000 g reading
        // exceeds the plan's 2,400 g solution — that refusal is plan-governs only — and the
        // plan's own over-dilute verdict is too, so both are silent. The batch itself is at
        // 1,200 / 3,000 = 40.0%, exactly AT the ceiling and not above it, so the ceiling has
        // nothing true to say either. What must not happen is the plan's water row printing a
        // bare "0 g" with nothing on screen accounting for it — the state
        // correctedDilutionWaterGrams' own doc warns every consumer of that figure about.
        renderOverCeiling('record', { measuredPasteGrams: '3000' });
        expect(alertTexts()).toEqual([]);
        expect(screen.getByText('Dilution water to add (plan)')).toBeTruthy();
        expect(screen.getByText(/^Plan: at 50%/)).toBeTruthy();
        // And the batch's own figures are on screen saying what it actually is.
        expect(screen.getByText(/The batch so far is at 40(\.00)?% soap/)).toBeTruthy();
      });
    });

    it('speaks in Custom amount scope, where the flag has no alert of its own at all', () => {
      // The "already more dilute" alert is Whole-batch only; in Custom amount the child says
      // it instead, and with a valid reading the child sizes a portion and says nothing. The
      // target is still ten points past the ceiling.
      renderOverCeiling('plan', {
        measuredPasteGrams: VALID_READING,
        dilutionScope: 'portion',
        targetMl: '500',
      });
      const alerts = alertTexts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatch(CEILING);
    });

    it('speaks in Custom amount scope with a recorded jar, where nothing else can', () => {
      // Task 13's cell, rewritten to the surface that replaced its mode.
      // `pasteAlreadyThinnerAlert` carries `dilutionScope === 'batch'` for a plain reason at
      // its render site (it lives inside the batch-scope block), but it is ALSO read as a
      // voice by `overDilutionSpokenFor`, and there the gate is the whole of what stops it
      // claiming a voice it does not have.
      //
      // Custom amount with a JAR RECORDED and no whole-batch reading is the state with no
      // other voice at all: the child that words this verdict in Custom amount stands down
      // for a governing jar (a stale `targetMl` would otherwise put its whole plan-sized grid
      // on screen beside the jar's recorded figures), there is no reading to refuse, and no
      // undeclared liquid to hedge over. Drop the scope gate and the const goes true here
      // while nothing renders for it, so this cell falls back to ZERO alerts at a target ten
      // points past what any recipe dissolves.
      //
      // THE JAR'S OWN WORDING (Phase 2b, spec §1/§4): the batch record participates nowhere
      // in portion scope, but the JAR does — resolveDilution's portion arm makes the jar's
      // own resolved % the figure this ceiling reads and names, never the plan's 50%. 2,000 g
      // of paste is a 2,000/2,600 share of the 1,200 g anhydrous soap (923.08 g) plus 200 g of
      // water is 2,200 g at 41.96% — above the ceiling on its OWN reading, distinct from the
      // plan's 50% so no assertion below can pass by matching the wrong number.
      renderOverCeiling('plan', {
        measuredPasteGrams: '',
        dilutionScope: 'portion',
        portionPasteGrams: '2000',
        portionWaterGrams: '200',
        onPortionPasteChange: () => {},
        onPortionWaterChange: () => {},
      });
      expect(alertTexts()).toEqual([
        expect.stringMatching(/The jar so far is at 41\.96% — above what any recipe fully dissolves; keep adding water\./i),
      ]);
    });

    it('still yields to the child that says it in Custom amount scope', () => {
      // No reading: PortionDilutionResults refuses the portion in its own words ("no
      // dilution water to divide up"), which is the same verdict the shell's alert makes in
      // Whole batch. One verdict per target across the scope seam, so no alert here.
      renderOverCeiling('plan', {
        measuredPasteGrams: '',
        dilutionScope: 'portion',
        targetMl: '500',
      });
      expect(alertTexts()).toHaveLength(0);
      expect(screen.getByText(/no dilution water to divide up/i)).toBeTruthy();
    });

    {
      it(`speaks beside the child's hedge in Custom amount — the child's hedge is not a verdict about the target either`, () => {
        // DECIDED 2026-08-17 (the code-review round): the second-round rule — an
        // uncertainty about the batch is not a verdict about the target — extends to the
        // child's voice. `overDilutionSpokenFor` counted `portionState.pasteAlreadyThinner`,
        // the child's FLAG, which is also true in this state — an undeclared liquid and no
        // reading — where what the child renders is its can't-tell hedge ("No portion can
        // be sized yet…"), not its wording of the verdict. So one radio flip gave opposite
        // answers: Whole batch showed ceiling + hedge (the batch-scope test above), Custom
        // amount showed ZERO alerts under the same 50% target. The child's voice now counts
        // only when the child actually words the verdict; beside its hedge the ceiling
        // speaks, exactly as it does beside the shell's own hedge one radio over. Gradual
        // has no cell here — the child does not render in that mode, and its twin is
        // pinned above ("speaks in Custom amount scope in gradual mode").
        renderOverCeiling('plan', {
          measuredPasteGrams: '',
          unknownLiquidGrams: 300,
          dilutionScope: 'portion',
          targetMl: '500',
        });
        expect(alertTexts()).toEqual([expect.stringMatching(CEILING)]);
        expect(screen.getByText(/no portion can be sized yet/i)).toBeTruthy();
      });
    }

    it('stays silent for a target the guide says is dissolvable, flag or no flag', () => {
      // The control that keeps the fix from degenerating into "always render": 1,200 g of
      // soap cooked in 3,000 g of water at 30% is the same targetExceedsPaste state — 2,800
      // g of total water against 3,000 g of cook water — but 30% is inside every recipe
      // type's solubility ceiling, so this sentence is not true and must not appear.
      const UNDER_CEILING = calculateDilution({
        anhydrousGrams: 1200,
        cookWaterGrams: 3000,
        kohGrams: 240,
        naohGrams: 0,
        soapConcentrationPercent: 30,
      })!;
      expect(UNDER_CEILING.targetExceedsPaste).toBe(true);
      render(
        <DilutionPanel
          {...BASE}
          soapConcentrationPercent="30"
          dilution={UNDER_CEILING}
          cookWaterGrams={3000}
          wholeBatchPasteGrams={4200}
          measuredPasteGrams="3500"
        />,
      );
      expect(alertTexts()).toHaveLength(0);
      expect(screen.queryByText(CEILING)).toBeNull();
    });
  });

  // ── Task 14 (2026-08-12-whole-app-review-fixes), commit 2: the corrected-pot clause ──
  // The ceiling's second suppression clause deferred to the bare pasteAlreadyPastTarget
  // predicate, while the alert that predicate stands for renders in Whole-batch scope only
  // and the child's own wording of it requires an unrejected reading. The cell where all
  // three of that verdict's voices are gated off at once — Custom amount, a rejected
  // reading whose own refusal is excluded from the mode — showed literally nothing at a
  // target ten points past what dissolves. Same render-keying discipline as the describe
  // above: the clause now asks what is on screen, and these cases pin both directions.
  describe("the ceiling's corrected-pot clause, keyed on what renders rather than on the predicate", () => {
    // Built by core: 1,200 g of anhydrous soap at a saved 50% target makes a 2,400 g
    // solution holding 1,200 g of water, and 1,000 g of cook water keeps targetExceedsPaste
    // FALSE (1,200 >= 1,000) — this is the OTHER over-dilute verdict's fixture. The
    // corrected pot is 2,500 g (1,200 soap + 1,000 cook water + 300 g of alternative-liquid
    // solids), heavier than the 2,400 g solution, so pasteAlreadyPastTarget fires; the
    // solids floor is 1,500 g. Every figure distinct — 900 / 1,000 / 1,200 / 1,500 / 2,400 /
    // 2,500 / 3,000 — so no assertion below can pass by matching the wrong quantity.
    const PAST_TARGET_POT = calculateDilution({
      anhydrousGrams: 1200,
      cookWaterGrams: 1000,
      kohGrams: 240,
      naohGrams: 0,
      soapConcentrationPercent: 50,
    })!;
    const renderPastTargetPot = (
      arm: keyof typeof ARM_PROPS,
      props: Partial<ComponentProps<typeof DilutionPanel>> = {},
    ) =>
      render(
        <DilutionPanel
          {...BASE}
          soapConcentrationPercent="50"
          dilution={PAST_TARGET_POT}
          cookWaterGrams={1000}
          wholeBatchPasteGrams={2500}
          {...ARM_PROPS[arm]}
          {...props}
        />,
      );

    it('is the fixture the corrected-pot verdict fires on, with the water-only flag clear', () => {
      // The positive control: the predicate under test is the corrected pot outweighing the
      // solution WITHOUT targetExceedsPaste — the batch alert below witnesses it renders.
      expect(PAST_TARGET_POT.targetExceedsPaste).toBe(false);
      expect(PAST_TARGET_POT.solutionGrams).toBe(2400);
      renderPastTargetPot('plan', { measuredPasteGrams: '' });
      expect(screen.getByText(/it weighs 2,500 g against the 2,400 g/i)).toBeTruthy();
    });

    it('the ceiling now answers for the JAR, and a 3,000 g reading genuinely leaves it nothing to say', () => {
      // THE HOLE this cell used to demonstrate (pre-Phase-2b; user decided 2026-08-16 to fix
      // it on this branch): a 3,000 g whole-batch reading exceeds the 2,400 g solution, but
      // that refusal is plan-governs only and a recorded jar governs Custom amount; the
      // corrected-pot alert is Whole-batch only; and the child's own wording needs an
      // unrejected reading and does not render for a governing jar at all. Three voices, all
      // gated off at once — and in 2a the ceiling was what filled the silence, because it
      // spoke of the PLAN's 50%, which nothing here changes.
      //
      // PHASE 2B CHANGES WHAT THE CEILING SAYS, and this exact fixture is where that change
      // produces a genuinely different, and correct, answer: the reading is a valid
      // TARGET-INDEPENDENT pot basis (measuredPasteDescribesPotFor only checks the solids
      // floor, never the solution ceiling — see that function's own doc — so 3,000 g stands
      // even though it is heavier than the 2,400 g solution), which makes it the batch this
      // jar is drawn FROM. 1,200 g of anhydrous soap over a 3,000 g pot is 40.0% AT the
      // paste's own concentration, with zero water added — the guide's own ceiling, not
      // above it — so no jar drawn from this pot, at any positive water, can ever exceed 40%
      // either. The ceiling has nothing true left to say about a jar it is structurally
      // incapable of finding over 40%, so it falls silent — correctly, not as a regression:
      // the three other voices stay gated off for the same reasons as before, and the
      // ceiling's own new voice (the jar's) has genuinely nothing to report here. 2,000 g
      // paste / 100 g water is a 2,000/3,000 share of the 1,200 g anhydrous soap (800 g) over
      // 2,100 g finished — 38.1%, comfortably under the guide's ceiling.
      renderPastTargetPot('plan', {
        measuredPasteGrams: '3000',
        dilutionScope: 'portion',
        portionPasteGrams: '2000',
        portionWaterGrams: '100',
        onPortionPasteChange: () => {},
        onPortionWaterChange: () => {},
      });
      expect(alertTexts()).toEqual([]);
      expect(screen.getByText(/At 38\.1% this suits/)).toBeTruthy();
    });

    it('still yields to the corrected-pot alert in Whole batch, where the refusal is the one that renders', () => {
      // The trap, direction one: same rejected reading, one radio over. In Whole batch the
      // plan governs, so the exceeds-solution refusal DOES render — it names the maker's own
      // typed figure against the very solution the corrected-pot verdict compares the pot
      // to, so that verdict yields to it and the ceiling yields to it as well. Exactly one
      // alert either way; what must never happen is two verdicts about one target, or none.
      renderPastTargetPot('plan', { measuredPasteGrams: '3000' });
      expect(alertTexts()).toEqual([expect.stringMatching(/already weighs more than/i)]);
    });

    it('leaves no bare zero in Whole batch under a record, where both verdicts are gated off', () => {
      // The record arm's own cell for this describe, and the successor to the ratio-mode one
      // it replaces. Under a record BOTH the exceeds-solution refusal and the corrected-pot
      // verdict are plan-governs only, so neither renders — and the plan's water row still
      // clamps to "0 g", because a 2,500 g pot cannot be diluted INTO a 2,400 g solution.
      // §4's plan-labelled caption is what accounts for it; the batch's own figures say what
      // the batch actually is. The ceiling stays silent because 1,200 / 3,000 is 40.0%,
      // exactly AT the guide's highest ceiling rather than above it.
      renderPastTargetPot('record', { measuredPasteGrams: '3000' });
      expect(alertTexts()).toEqual([]);
      expect(screen.getByText(/^Plan: at 50%/)).toBeTruthy();
      expect(screen.getByText('Dilution water to add (plan)')).toBeTruthy();
      expect(screen.getByText(/The batch so far is at 40(\.00)?% soap/)).toBeTruthy();
    });

    it('still yields to the child that words the verdict in Custom amount, with no reading', () => {
      // The trap, direction two: with nothing in the field the child speaks
      // (unmeasuredPasteAlreadyThinner — "no dilution water to divide up"), so the ceiling
      // stays out of its way and the alert count stays at zero.
      renderPastTargetPot('plan', {
        measuredPasteGrams: '',
        dilutionScope: 'portion',
        targetMl: '500',
      });
      expect(alertTexts()).toHaveLength(0);
      expect(screen.getByText(/no dilution water to divide up/i)).toBeTruthy();
    });

    it('speaks beside a refusal that DOES render — a refusal about the reading does not speak for the corrected pot either', () => {
      // REWRITTEN BY DECISION (2026-08-16, second round) from "still yields to a refusal
      // that DOES render": this case used to pin exactly one alert, because a rejection
      // disjunct in `pasteAlreadyPastTargetSpokenFor` — kept for one round as the
      // not-yet-decided side — let any rendering refusal silence the ceiling wherever the
      // corrected-pot predicate held. The user decided the same rule reaches this side:
      // only a verdict about the TARGET may silence the target's warning. 900 g is under
      // the 1,500 g solids floor — a claim about the scale, with nothing in it about what
      // a 50% target can dissolve — so the ceiling now speaks beside it, exactly the pair
      // the targetExceedsPaste side shows ("speaks beside a rejection alert", above). The
      // exact pair, in document order: the refusal beside the field it describes, the
      // ceiling below the figures — and never the same claim twice. (Phase 2b: the ceiling's
      // own wording is the JAR'S, same 2,000 g / 100 g jar as the sibling test above — 45.71%,
      // distinct from the plan's 50%; the rejected 900 g reading is the WHOLE-BATCH measured
      // paste field, unrelated to the jar, and is why the batch pot falls back to the
      // recipe's own 2,500 g computed figure the jar's own share is still taken from.)
      renderPastTargetPot('plan', {
        measuredPasteGrams: '900',
        dilutionScope: 'portion',
        portionPasteGrams: '2000',
        portionWaterGrams: '100',
        onPortionPasteChange: () => {},
        onPortionWaterChange: () => {},
      });
      expect(alertTexts()).toEqual([
        expect.stringMatching(/cannot be all of the paste/i),
        expect.stringMatching(/The jar so far is at 45\.71% — above what any recipe fully dissolves; keep adding water\./i),
      ]);
    });

    it('three distinct claims may stack: the reading refused, the ask refused, the target above the ceiling', () => {
      // DECIDED 2026-08-17 (the code-review round): this composition is intended, and this
      // test stops it being an accident of gate order. Custom amount, concentration mode,
      // three independent things wrong at once — a 900 g reading under the 1,500 g solids
      // floor (a claim about the SCALE), an amount asked to the hundredth of a millilitre
      // (a claim about the ASK's typed string), and a saved 50% target above what any
      // recipe dissolves (a claim about the TARGET). No two are about the same thing, so
      // the panel's one-verdict-per-target rule suppresses none of them: the ceiling
      // renders because every voice it defers to is silent here (the corrected-pot alert
      // is Whole-batch only, the child's wording needs an unrejected reading, and the
      // exceeds-solution refusal did not fire), and neither refusal replaces the other.
      // Exactly three, in document order — each beside the thing it describes — and never
      // the same claim twice.
      renderPastTargetPot('plan', {
        measuredPasteGrams: '900',
        dilutionScope: 'portion',
        targetMl: '500.25',
      });
      expect(alertTexts()).toEqual([
        expect.stringMatching(/cannot be all of the paste/i),
        expect.stringMatching(/received 500\.25 ml/i),
        expect.stringMatching(SOLUBILITY_CEILING),
      ]);
    });

    it('the corrected-pot paragraph yields to the exceeds-solution rejection — two verdicts about one target are one too many', () => {
      // DECIDED 2026-08-16 (second round). Same fixture, concentration mode, Whole batch:
      // a 3,000 g reading exceeds the 2,400 g solution, so the exceeds-solution rejection
      // renders — and it names the maker's own typed figure against the very solution this
      // verdict compares the corrected pot against. The corrected-pot paragraph's account
      // of the 0 g row is redundant there (the rejection already explains the state), so
      // it yields: one verdict about this target, not two. The ceiling stays down as well,
      // held by its own `!exceedsSolutionAlert` clause rather than by the yielded
      // paragraph — which is why this asserts the exact singleton and not a mere absence.
      // The yield is keyed on the rejection's RENDER (`exceedsSolutionAlert`), never its
      // flag: in ratio mode the flag is true while the paragraph is excluded, and the
      // Whole-batch test above pins that the corrected-pot alert still speaks there.
      renderPastTargetPot('plan', { measuredPasteGrams: '3000' });
      expect(alertTexts()).toEqual([expect.stringMatching(/already weighs more than/i)]);
    });
  });

  it('does not offer a hair use', () => {
    render30('12');
    expect(screen.queryByText(/^shampoo/i)).toBeNull();
    expect(screen.getByText(/not recommended for hair/i)).toBeTruthy();
  });

  it('makes the hair caveat about the soap, not about the salt sentence it follows', () => {
    // LS:1690's claim is a row in the intended-use list — liquid soap as shampoo is not
    // recommended, full stop — and LS:3089 lists shampoos among the products salt IS used
    // in. Sitting straight after "thickening with salt is the cheaper way…", a bare "Not
    // recommended for hair." read as a warning about salt-thickened soap. The sentence
    // must name its subject and must not lean on the salt clause for one.
    render30('12');
    const paragraph = screen.getByText(/not recommended for hair/i).textContent ?? '';
    const hairSentence = paragraph
      .split(/(?<=\.)\s+/)
      .find((s) => /hair/i.test(s))!;
    expect(hairSentence).toBeTruthy();
    expect(hairSentence).toMatch(/liquid soap/i);
    expect(hairSentence).not.toMatch(/salt/i);
  });
});

describe('each intended use carries the water:paste ratio that reaches it', () => {
  // The two scales the panel offers were derived from different places and never met: the
  // "Starting points" buttons are water:paste ratios, the uses list is % soap, and a maker
  // reading one had no way to see where the other landed. Same pot for both, so each use can
  // state its own starting point.
  //
  // 1,200 g anhydrous + 400 g cook water = a 1,600 g pot, the fixture this file already uses
  // for the preset arithmetic. At 15% the solution is 8,000 g, so 6,400 g of water — 4:1. At
  // 30% it is 4,000 g, so 2,400 g — 1.5:1. Hand soap is 15–30%, so it spans them.
  const POT = {
    dilution: {
      anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
      dilutionWaterGrams: 2400, glycerinGrams: 100, soapConcentrationPercent: 30,
      targetExceedsPaste: false,
    },
    cookWaterGrams: 400,
  };

  const renderPanel = (props: Record<string, unknown> = {}) =>
    render(
      <DilutionPanel
        {...POT}
        soapConcentrationPercent="30"
        onSoapConcentrationChange={() => {}}
        weightUnit="g"
        {...props}
      />,
    );

  /** The <dd> beside a use's label in the collapsed reference list. */
  const useRow = (label: string): string => {
    const dt = screen.getByText(label);
    return dt.parentElement?.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  };

  it('states the ratio range beside the percentage range', () => {
    renderPanel();
    // Ascending by ratio, which inverts the percentages: more water is a thinner soap.
    expect(useRow('Hand soap')).toContain('1.5:1 – 4:1');
  });

  it('reaches the 10–15% uses no preset button can', () => {
    renderPanel();
    // The whole point of showing both scales: 1:1 through 3:1 cannot get here, and until the
    // ratio was on the row nothing on screen said what could.
    expect(useRow('Baby or gentle soap')).toContain('4:1 – 6.5:1');
  });

  it('prints a sub-1 ratio honestly where the use wants less water than paste', () => {
    renderPanel();
    // Dish soap at 45% is a 2,667 g solution from a 1,600 g pot — 1,067 g of water, 0.7:1.
    expect(useRow('Dish soap')).toContain('0.7:1 – 1.1:1');
  });

  it('takes the pot from the scale when a measurement describes one', () => {
    // A weighed 2,000 g pot, not the recipe's computed 1,600 g: at 30% the same 4,000 g
    // solution now needs 2,000 g of water, so hand soap's tight end moves 1.5:1 → 1:1.
    renderPanel({ measuredPasteGrams: '2000', wholeBatchPasteGrams: 1600 });
    expect(useRow('Hand soap')).toContain('1:1 – 3:1');
  });

  it('names the band without the filler word — the list is all soap', () => {
    renderPanel();
    expect(screen.getByText('Hand soap')).toBeTruthy();
    expect(screen.queryByText('General hand soap')).toBeNull();
  });

  it('stands open, so the bands are readable without a click', () => {
    renderPanel();
    // The correlation between the two scales is the point of the block; behind a disclosure
    // most makers never see it. Reference that answers "what am I aiming at" is not the
    // always-true prose the budget files away.
    const list = document.querySelector('details.dilution-uses') as HTMLDetailsElement;
    expect(list.open).toBe(true);
  });

  it('stays shut once the maker shuts it, through the re-render a keystroke causes', () => {
    // The panel re-renders on every keystroke in the target field. A bare `open` attribute
    // would reassert itself; the maker's own collapse has to outlive it.
    const { rerender } = renderPanel();
    const list = document.querySelector('details.dilution-uses') as HTMLDetailsElement;
    fireEvent.click(list.querySelector('summary')!);
    expect(list.open).toBe(false);
    rerender(
      <DilutionPanel
        {...POT}
        soapConcentrationPercent="31"
        onSoapConcentrationChange={() => {}}
        weightUnit="g"
      />,
    );
    expect((document.querySelector('details.dilution-uses') as HTMLDetailsElement).open).toBe(false);
  });

  it('offers no ratio for a use this paste cannot reach', () => {
    // A 1,200 g pot holding only 400 g of soap is already 33.3% — thinner than dish soap's
    // whole 35–45% band, so there is no amount of water that reaches it. A ratio would have
    // to be negative, and a negative pour is not an instruction.
    renderPanel({
      dilution: {
        anhydrousGrams: 400, solutionGrams: 1333, totalWaterGrams: 933,
        dilutionWaterGrams: 133, glycerinGrams: 40, soapConcentrationPercent: 30,
        targetExceedsPaste: false,
      },
      cookWaterGrams: 800,
    });
    expect(useRow('Dish soap')).toContain('35–45% soap');
    expect(useRow('Dish soap')).not.toMatch(/:1/);
  });
});

describe('a starting point says what it starts', () => {
  // The other half of the correlation. A bare "2:1" is a quantity of water; what a maker is
  // choosing is a PRODUCT, and until the button said so the only way to find out was to
  // click it and read the percentage back off the field.
  //
  // 1,200 g anhydrous + 400 g cook water = a 1,600 g pot. 1:1 makes a 3,200 g solution —
  // 37.5% soap, inside dish and laundry's 35–45%. 2:1 makes 4,800 g — 25%, inside body
  // wash's 10–35% and hand soap's 15–30%.
  const POT = {
    dilution: {
      anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
      dilutionWaterGrams: 2400, glycerinGrams: 100, soapConcentrationPercent: 30,
      targetExceedsPaste: false,
    },
    cookWaterGrams: 400,
  };

  const renderPanel = (props: Record<string, unknown> = {}) =>
    render(
      <DilutionPanel
        {...POT}
        soapConcentrationPercent="30"
        onSoapConcentrationChange={() => {}}
        weightUnit="g"
        {...props}
      />,
    );

  /** A preset button's whole label, ratio line and name line together. */
  const preset = (ratio: string): string =>
    screen
      .getByRole('button', { name: new RegExp(`^${ratio.replace('.', '\\.')}\\b`) })
      .textContent?.replace(/\s+/g, ' ')
      .trim() ?? '';

  it('names every use the ratio lands in', () => {
    renderPanel();
    expect(preset('1:1')).toContain('dish soap, laundry soap');
    expect(preset('2:1')).toContain('body wash, hand soap');
  });

  it('keeps the ratio itself as the button\'s heading', () => {
    renderPanel();
    // The reference's own vocabulary stays primary: the name explains the ratio, the ratio
    // is still what the maker picked.
    expect(preset('2:1').startsWith('2:1')).toBe(true);
  });

  it('follows the pot when the paste is weighed', () => {
    // A weighed 2,400 g pot: 1:1 now makes 4,800 g — 25% soap, which is body wash and hand
    // soap, not the dish soap the recipe's lighter computed pot put it in.
    renderPanel({ measuredPasteGrams: '2400', wholeBatchPasteGrams: 1600 });
    expect(preset('1:1')).toContain('body wash, hand soap');
    expect(preset('1:1')).not.toContain('dish soap');
  });

  it('shows the ratio alone when it lands in no common use', () => {
    // A 400 g pot of soap in 1,200 g of paste is 33.3%; at 3:1 the solution is 4,800 g and
    // the target 8.3% — below every band in the list, so there is no name to give.
    renderPanel({
      dilution: {
        anhydrousGrams: 400, solutionGrams: 1333, totalWaterGrams: 933,
        dilutionWaterGrams: 133, glycerinGrams: 40, soapConcentrationPercent: 30,
        targetExceedsPaste: false,
      },
      cookWaterGrams: 800,
    });
    expect(preset('3:1')).toBe('3:1');
  });
});

test('unknown-liquid hints never repeat "declare its % water" on one screen', () => {
  // targetExceedsPaste + unknown + not-certain: the can't-tell hint covers the message,
  // and dilutionWaterGrams is 0 — so the floor hint would be vacuous AND a verbatim repeat.
  render(
    <DilutionPanel
      dilution={{
        anhydrousGrams: 1215, solutionGrams: 2431, totalWaterGrams: 1215,
        dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 50,
        targetExceedsPaste: true,
      }}
      soapConcentrationPercent="50"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      altLiquidWaterGrams={900}
      unknownLiquidGrams={900}
      overDilutionCertain={false}
    />,
  );
  expect(screen.getAllByText(/declare its % water/i)).toHaveLength(1);
  expect(screen.queryByText(/0 g is the LEAST/i)).toBeNull();
});

describe('the "declare its % water" remedy is printed once per screen, in either scope', () => {
  // The batch-scope case above pins the shell's two hints against each other. The same
  // duplication reappeared across the scope SEAM: the shell's can't-tell hint is
  // deliberately un-scoped, and PortionDilutionResults' own suppressed-portion hedge fires
  // on the identical condition (targetExceedsPaste + undeclared liquid + not certain) with
  // the same figure and the same remedy, separated only by unrelated copy in between.
  const OVER = {
    anhydrousGrams: 1215, solutionGrams: 2431, totalWaterGrams: 1215,
    dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 50,
    targetExceedsPaste: true,
  };

  for (const [scope, targetMl] of [['batch', ''], ['portion', '1000']] as const) {
    it(`says it once in ${scope} scope`, () => {
      render(
        <DilutionPanel
          {...BASE}
          dilution={OVER}
          dilutionScope={scope}
          targetMl={targetMl}
          altLiquidWaterGrams={900}
          unknownLiquidGrams={900}
          overDilutionCertain={false}
        />,
      );
      expect(screen.getAllByText(/declare its % water/i)).toHaveLength(1);
      // …and the hedge itself is still on screen — this is a suppressed REPEAT, not a
      // suppressed message. Neither scope may assert the verdict flat.
      expect(screen.getAllByText(/no declared water content/i)).toHaveLength(1);
      expect(screen.queryByText(/already more dilute/i)).toBeNull();
    });
  }

  it('leaves the portion-specific hedge as the one that speaks in Custom amount scope', () => {
    // Of the two, PortionDilutionResults' is the one that also explains the missing
    // figures ("No portion can be sized yet"), so it owns the message where it renders.
    render(
      <DilutionPanel
        {...BASE}
        dilution={OVER}
        dilutionScope="portion"
        targetMl="1000"
        altLiquidWaterGrams={900}
        unknownLiquidGrams={900}
        overDilutionCertain={false}
      />,
    );
    expect(screen.getByText(/no portion can be sized yet/i)).toBeTruthy();
    expect(screen.queryByText(/can.t tell whether/i)).toBeNull();
  });

  it('drops the hedge entirely once a valid measurement answers the question it asks', () => {
    // This used to assert the opposite — that the shell's hedge is the one left speaking
    // when the child renders figures — as a control for "not suppressed by scope alone".
    // The control was sound; the fixture was not. A valid 1,300 g whole-batch reading
    // outranks targetExceedsPaste, which is exactly why the child sizes a portion here:
    // that portion IS the answer to "can't tell whether 50% is reachable", printed three
    // paragraphs above the hedge still asking it. The scope-alone control it was standing
    // in for is the two-scope loop above, which pins the hedge present in both.
    render(
      <DilutionPanel
        {...BASE}
        dilution={OVER}
        dilutionScope="portion"
        targetMl="1000"
        measuredPasteGrams="1300"
        altLiquidWaterGrams={900}
        unknownLiquidGrams={900}
        overDilutionCertain={false}
      />,
    );
    expect(screen.getByText('Paste to weigh out')).toBeTruthy();
    expect(screen.queryByText(/can.t tell whether/i)).toBeNull();
    expect(screen.queryByText(/declare its % water/i)).toBeNull();
  });
});

test('the floor hint still renders when the floor is real', () => {
  render(
    <DilutionPanel
      dilution={{
        anhydrousGrams: 1218, solutionGrams: 4059, totalWaterGrams: 2841,
        dilutionWaterGrams: 2000, glycerinGrams: 107, soapConcentrationPercent: 30,
        targetExceedsPaste: false,
      }}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      altLiquidWaterGrams={300}
      unknownLiquidGrams={300}
      overDilutionCertain={false}
    />,
  );
  expect(screen.getByText(/is the LEAST you will need/i)).toBeTruthy();
});

describe('a ratio preset multiplies the pot the rest of the panel already knows about', () => {
  // WHAT SURVIVED THE MODE. Ratio mode's arithmetic — anhydrous / (pot x (1 + r)) — is the
  // preset's arithmetic, computed against the same pot resolution (weighedOrComputedPotGramsFor)
  // and clamped into the same [1, 99]. What died with the mode is a live parallel readout and
  // the write-back that kept it reconciled; what a preset does instead is write the plan %
  // ONCE, from the pot at the moment of the click. So every claim these cases made about
  // WHICH POT the ratio counts from survives verbatim, and the assertion moves from the
  // readout to the value written.
  const clicked = (props: Partial<ComponentProps<typeof DilutionPanel>>, preset: string) => {
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        {...BASE}
        {...props}
        onSoapConcentrationChange={onSoapConcentrationChange}
      />,
    );
    // Prefix, not the whole name: a preset button's accessible name now carries the uses its
    // ratio lands in ("2:1 body wash, hand soap"), which is what a screen reader should hear.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${preset.replace('.', '\\.')}\\b`) }));
    return onSoapConcentrationChange;
  };

  it('derives the concentration a water:paste ratio lands on, from the recipe\'s own pot', () => {
    // 1,200 g anhydrous + 400 g cook water = a 1,600 g pot; at 2:1 that is 3,200 g of water
    // for a 4,800 g solution — 25.0% soap.
    expect(clicked({ dilution: RESULT, soapConcentrationPercent: '30', cookWaterGrams: 400 }, '2:1'))
      .toHaveBeenCalledWith('25');
  });

  it('uses cookWaterGrams for the paste, not totalWater minus dilutionWater (the targetExceedsPaste clamp trap)', () => {
    // totalWaterGrams - dilutionWaterGrams would give the WRONG paste here: dilutionWaterGrams
    // is clamped to 0 when targetExceedsPaste (see the DilutionPanel cookWaterGrams prop doc
    // and PortionDilutionResults' identical trap), so the forbidden derivation would compute
    // paste as 1,200 + (133 - 0) = 1,333 g and land at 45.0%. The correct paste — from
    // cookWaterGrams — is 1,200 + 1,600 = 2,800 g, and 1:1 lands at 1,200 / 5,600 = 21.4%.
    const spy = clicked(
      {
        dilution: {
          anhydrousGrams: 1200, solutionGrams: 5000, totalWaterGrams: 133,
          dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 90,
          targetExceedsPaste: true,
        },
        soapConcentrationPercent: '90',
        cookWaterGrams: 1600,
      },
      '1:1',
    );
    expect(spy).toHaveBeenCalledWith('21.4');
    expect(spy).not.toHaveBeenCalledWith('45');
  });

  // anhydrousGrams + cookWaterGrams counts only the WATER fraction of an alternative
  // liquid; its non-water solids are real mass sitting in the pot. This panel is HANDED the
  // corrected figure (wholeBatchPasteGrams — it forwards it to PortionDilutionResults and
  // judges a measured reading against it) and used to compute the ratio against the
  // water-only one anyway. 300 g anhydrous, 100 g cook water, plus 100 g of split liquid at
  // 30% water = 70 g of solids → a 470 g pot. At 2:1 that is 940 g of water and 21.3% soap;
  // the water-only 400 g basis prescribed 800 g and 25% — 140 g short, against a basis the
  // panel itself calls wrong two paragraphs up.
  const SPLIT = {
    dilution: {
      anhydrousGrams: 300, solutionGrams: 1000, totalWaterGrams: 700,
      dilutionWaterGrams: 600, glycerinGrams: 25, soapConcentrationPercent: 30,
      targetExceedsPaste: false,
    },
    soapConcentrationPercent: '30',
    dilutionScope: 'batch' as const,
    targetMl: '',
    cookWaterGrams: 100,
  };

  it('prefers the corrected whole-batch paste over the water-only figure', () => {
    expect(clicked({ ...SPLIT, wholeBatchPasteGrams: 470 }, '2:1')).toHaveBeenCalledWith('21.3');
  });

  it('falls back to anhydrous + cook water when no corrected figure is supplied', () => {
    expect(clicked(SPLIT, '2:1')).toHaveBeenCalledWith('25');
  });

  it('still lets a valid measured paste outrank both', () => {
    // The reference's ratio method is applied to a weighed paste; a measurement is direct
    // evidence and beats every computed basis. 500 g is between the 300 g anhydrous floor
    // and the 1,000 g solution ceiling, so 2:1 counts from 500 g: 300 / 1,500 = 20.0%.
    expect(
      clicked({ ...SPLIT, wholeBatchPasteGrams: 470, measuredPasteGrams: '500' }, '2:1'),
    ).toHaveBeenCalledWith('20');
  });

  it('clamps what it writes into the range calculateDilution can accept', () => {
    // RETIRED-AND-KEPT: "extreme ratio clamps the written-back concentration so the ratio
    // panel cannot vanish". The write-back is gone; the clamp is not, and its reason is
    // unchanged — calculateDilution refuses anything outside (0, 100), and a refused value
    // sends `dilution` upstream to null, vanishing the panel the maker would need in order
    // to recover. 1,200 g of soap in a 1,600 g pot at 99:1 is 0.75%, which rounds to 0.8 and
    // clamps to 1.
    expect(
      clicked({ dilution: RESULT, soapConcentrationPercent: '30', cookWaterGrams: 400 }, '3:1'),
    ).toHaveBeenCalledWith('18.8');
    cleanup();
    const spy = clicked(
      {
        dilution: { ...RESULT, anhydrousGrams: 12 },
        soapConcentrationPercent: '30',
        cookWaterGrams: 400,
      },
      '3:1',
    );
    // 12 / (1,600 x 4) = 0.19%, rounded to 0.2, clamped to the field's own minimum.
    expect(spy).toHaveBeenCalledWith('1');
  });

  it('writes nothing at all while there is no pot to multiply', () => {
    // RETIRED-AND-KEPT: "invalid ratio explains why the ratio results vanished instead of
    // just vanishing". There is no ratio field left to be invalid; what is left is a preset
    // with nothing to count from, and a control that does nothing when pressed is worse than
    // one that says it cannot. The panel's own ask below the presets explains the state.
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel {...BASE} dilution={null} onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    const preset = screen.getByRole('button', { name: /^2:1\b/ });
    expect((preset as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(preset);
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter oils and a target concentration/i)).toBeTruthy();
  });
});

describe('the plan is written by the maker, and by nothing else', () => {
  // WHAT THREE RETIRED DESCRIBES ADD UP TO. "ratio mode does not silently rewrite the saved
  // target on mode entry alone", "ratio mode says so while the ratio has not been applied to
  // anything below it", and the two clamp cases were all about ONE mechanism: an effect that
  // derived a percentage and wrote it into settings.soapConcentrationPercent, plus the
  // touched-flags, the reset-on-mode-change and the "Not applied yet" copy that existed to
  // make that write survivable. Decision 2 deletes the mechanism outright ("no write-back,
  // ever"), and with it every state those cases described: there is no entry to a mode, no
  // re-entry to guard, and no gap between a derived figure and a plan it has not been
  // written into — the plan rows are on screen, labelled as plan, in every state.
  //
  // What has to stay pinned is the property those guards were reaching for, and it is now a
  // property of the file rather than of a guard: nothing here writes the plan except a
  // control the maker operated. The sweep below is the general form; the preset cases above
  // are the "and this one does" side of it.
  const SWEEP: Array<[string, Partial<ComponentProps<typeof DilutionPanel>>]> = [
    ['nothing recorded', {}],
    ['a zero record', { gradualWaterGrams: '0' }],
    ['a real record', { gradualWaterGrams: '2000' }],
    ['a record the parser refuses', { gradualWaterGrams: '2.000' }],
    ['a weighed pot', { measuredPasteGrams: '1500' }],
    ['a weighed pot and a record', { measuredPasteGrams: '1500', gradualWaterGrams: '2000' }],
    ['a reading past the plan\'s solution', { measuredPasteGrams: '4500' }],
    ['a reading past the plan\'s solution, with a record', { measuredPasteGrams: '4500', gradualWaterGrams: '0' }],
    ['Custom amount with a recorded jar', {
      dilutionScope: 'portion' as const,
      portionPasteGrams: '400',
      portionWaterGrams: '900',
      onPortionPasteChange: () => {},
      onPortionWaterChange: () => {},
    }],
  ];

  for (const [name, props] of SWEEP) {
    it(`writes nothing on mount or on a prop change: ${name}`, () => {
      const onSoapConcentrationChange = vi.fn();
      const base = {
        ...BASE,
        dilution: RESULT,
        soapConcentrationPercent: '30',
        cookWaterGrams: 400,
        wholeBatchPasteGrams: 1600,
        onGradualWaterChange: () => {},
        ...props,
      };
      const { rerender } = render(
        <DilutionPanel {...base} onSoapConcentrationChange={onSoapConcentrationChange} />,
      );
      // And an EXTERNAL change to the plan — opening a recipe file is exactly this — must
      // not provoke a resync either. The retired ratio effect listed
      // soapConcentrationPercent as a dependency precisely so it could rewrite the imported
      // value; with no derivation to resync there is nothing left to fire.
      rerender(
        <DilutionPanel
          {...base}
          soapConcentrationPercent="40"
          dilution={{ ...RESULT, soapConcentrationPercent: 40, solutionGrams: 3000 }}
          onSoapConcentrationChange={onSoapConcentrationChange}
        />,
      );
      expect(onSoapConcentrationChange).not.toHaveBeenCalled();
    });
  }

  it('a record typed into the field writes the record, and never the plan', () => {
    // The sharpest form: the water field is the one control whose value used to become a
    // percentage. Typing into it now calls onGradualWaterChange and nothing else.
    const onSoapConcentrationChange = vi.fn();
    const onGradualWaterChange = vi.fn();
    render(
      <DilutionPanel
        {...BASE}
        dilution={RESULT}
        soapConcentrationPercent="30"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        onSoapConcentrationChange={onSoapConcentrationChange}
        onGradualWaterChange={onGradualWaterChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Water added so far (g)'), { target: { value: '2000' } });
    expect(onGradualWaterChange).toHaveBeenCalledWith('2000');
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });
});

test('a measured paste corrects the batch dilution water', () => {
  // Predicted paste 1,600 g. Measured 1,480 g — 120 g evaporated — so reaching the same
  // 4,000 g solution needs 120 g more water: 2,520 g rather than 2,400 g.
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      measuredPasteGrams="1480"
    />,
  );
  expect(screen.getByText(/^2,520 g/)).toBeTruthy();
  // Not /measured paste/i alone: the new measured-paste input's own label ("Measured
  // paste weight") also matches that broad a pattern now that the field lives here too.
  const hint = screen.getByText(/uses your measured paste/i);
  expect(hint).toBeTruthy();
  // The reason it gives has to be one a measurement can still deliver. It used to add "an
  // alternative liquid's solids are mass it never counted", which the computed paste this
  // outranks now counts — and no unit test could see the regression: the paragraph only
  // renders with a valid measurement in Whole batch scope, and the e2e negative for its
  // Custom-amount twin runs before the measurement is filled in.
  expect(hint.textContent).toMatch(/boils off water the recipe still counts/i);
  expect(hint.textContent).not.toMatch(/solids/i);
  expect(hint.textContent).not.toMatch(/never counted/i);
});

test('the measured-paste hint names "Dilution water" explicitly in concentration mode', () => {
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      measuredPasteGrams="1480"
    />,
  );
  expect(screen.getByText(/Dilution water above uses your measured paste/i)).toBeTruthy();
});

// RETIRED: 'ratio mode + a measured paste: the hint names the ratio figure, not the
// suppressed "Dilution water" row' and 'ratio mode: a valid measured paste wins over the
// computed anhydrous + cook water'. Both were about a live ratio readout rendered beside a
// SUPPRESSED "Dilution water to add" row. Neither exists: there is one pour row, always
// rendered (labelled as plan under a record), and the measured-paste hint names it
// unconditionally — pinned by 'the measured-paste hint names "Dilution water" explicitly'
// below. The measurement-outranks-the-computed-pot claim they shared is pinned by 'still
// lets a valid measured paste outrank both' in the preset describe above, on the same
// resolution (weighedOrComputedPotGramsFor).

describe('a preset counts from the pot, not from the plan it is about to overwrite', () => {
  // THE ONLY CONDITION where the preset's basis gate can differ from the target-derived one:
  // a reading that clears the pot's own rules (parses, not finer than a scale reads, not
  // below the solids floor) and is HEAVIER than the solution the PLAN dilutes to. Every
  // other preset case in this file sits under that ceiling, where the two gates agree by
  // construction — so "all the pre-existing cases pass unchanged" was true and proved
  // nothing about the basis.
  //
  // 1,200 g of anhydrous soap in a computed 1,600 g pot, planned at 80%: a 1,500 g solution.
  // The maker weighs 1,550 g — a real reading (the cook drove off less than the recipe
  // assumed), and above that 1,500 g. A preset has no target of its own; it multiplies
  // whatever pot it is given and WRITES the percentage that lands on. So the pot it
  // multiplies must be the one on the scale, not the one the plan implies.
  const PAST_TARGET = {
    ...BASE,
    soapConcentrationPercent: '80',
    dilution: {
      anhydrousGrams: 1200, solutionGrams: 1500, totalWaterGrams: 300,
      dilutionWaterGrams: 0, glycerinGrams: 110, soapConcentrationPercent: 80,
      targetExceedsPaste: true,
    },
    cookWaterGrams: 400,
    wholeBatchPasteGrams: 1600,
    measuredPasteGrams: '1550',
  };

  it('writes the percentage the WEIGHED pot lands on', () => {
    // 1,550 x 3 = 4,650 g of solution → 1,200 / 4,650 = 25.8%. The computed 1,600 g pot
    // would have written 25.0% — a hundred grams of water apart at the bench.
    const onSoapConcentrationChange = vi.fn();
    render(<DilutionPanel {...PAST_TARGET} onSoapConcentrationChange={onSoapConcentrationChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^2:1\b/ }));
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('25.8');
    expect(onSoapConcentrationChange).not.toHaveBeenCalledWith('25');
  });

  it('does not refuse the reading against a plan the preset is not aiming at', () => {
    // Superseded by Task 1 (2026-08-12-whole-app-review-fixes) and carried forward: a claim
    // that the reading "cannot be diluted to 80% at all" names a target the preset was never
    // aiming at, sitting directly above the copy that calls the very same reading more
    // accurate than the recipe's computed paste. Nothing about the basis is weakened — the
    // case above proves the reading is what gets multiplied and what gets written.
    //
    // WHAT MOVED, and it is the panel rather than the preset: the plan GOVERNS here (there
    // is no record), so the exceeds-solution refusal renders, exactly as it always did in
    // concentration mode with this reading. What the retired ratio mode did was suppress that
    // refusal, because the mode was not aiming at the plan; a preset is a momentary action
    // rather than a state, so there is no such mode for the panel to be in and the refusal
    // stands. The claim that survives is about the ARITHMETIC — the case above proves the
    // preset multiplies the weighed pot and writes 25.8%, not the computed pot's 25.0%,
    // whatever the refusal beside it says about the plan.
    //
    // One alert, not two: the refusal quotes the maker's own reading against the very
    // solution the "already more dilute" verdict compares the pot to, so that verdict yields
    // to it and the ceiling yields through its own `!exceedsSolutionAlert` clause.
    render(<DilutionPanel {...PAST_TARGET} />);
    expect(alertTexts()).toEqual([expect.stringMatching(/already weighs more than/i)]);
    expect(screen.queryByText(/already more dilute than 80%/i)).toBeNull();
  });

  it('a reading UNDER that ceiling is untouched — both gates agree there', () => {
    // The control: same fixture, a 1,450 g reading that clears the ceiling too. An ACCEPTED
    // reading suppresses the "already more dilute" alert by design, and used to take the
    // solubility sentence down with it — leaving an 80% plan with nothing said about it
    // (Task 12). 1,450 x 3 = 4,350 → 27.6%.
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        {...PAST_TARGET}
        measuredPasteGrams="1450"
        onSoapConcentrationChange={onSoapConcentrationChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^2:1\b/ }));
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('27.6');
    expect(refusalAlerts()).toEqual([]);
    expect(alertTexts()).toEqual([expect.stringMatching(SOLUBILITY_CEILING)]);
  });
});

test('a valid measured paste outranks the computed over-dilution flag: shows the water, drops the alert', () => {
  // anhydrous 1,000 g, declared cook water 2,000 g → computed paste 3,000 g exceeds the
  // 2,500 g solution for a 40% target, so core sets targetExceedsPaste. But the measured
  // paste is only 2,200 g — much less than the computed 3,000 g, i.e. more evaporation
  // happened than the recipe assumed — and it is valid (between the 1,000 g anhydrous
  // floor and the 2,500 g solution ceiling). That measurement is evidence AGAINST
  // targetExceedsPaste, and implies 2,500 - 2,200 = 300 g of water is still needed, the
  // opposite of "already more dilute". The alert must not render beside that figure.
  render(
    <DilutionPanel
      dilution={{
        anhydrousGrams: 1000,
        solutionGrams: 2500,
        totalWaterGrams: 2000,
        dilutionWaterGrams: 0,
        glycerinGrams: 90,
        soapConcentrationPercent: 40,
        targetExceedsPaste: true,
      }}
      soapConcentrationPercent="40"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      measuredPasteGrams="2200"
    />,
  );
  expect(screen.getByText(/^300 g/)).toBeTruthy();
  expect(screen.queryByText(/already more dilute/i)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('the pour row is always on screen, and carries a plan label whenever a record governs', () => {
  // REPLACES the pair 'ratio mode does not show a competing "Dilution water to add" figure
  // from the main grid' / 'concentration mode still shows "Dilution water to add" in the main
  // grid'. Their subject was a suppression: two water figures for one batch with nothing
  // saying which to pour, answered by hiding one of them. Spec §2 answers it the other way —
  // the plan's row stays and takes the word "plan", so three masses can share a screen
  // because each carries its name — and hiding it took away the one figure a mid-pour maker
  // wants (how much more the plan says to add) at exactly the moment they are pouring.
  render(<DilutionPanel {...BASE} dilution={RESULT} soapConcentrationPercent="30" cookWaterGrams={400} />);
  expect(screen.getByText('Dilution water to add')).toBeTruthy();
  expect(screen.queryByText('Dilution water to add (plan)')).toBeNull();
  cleanup();
  render(
    <DilutionPanel
      {...BASE}
      dilution={RESULT}
      soapConcentrationPercent="30"
      cookWaterGrams={400}
      wholeBatchPasteGrams={1600}
      gradualWaterGrams="900"
      onGradualWaterChange={() => {}}
    />,
  );
  expect(screen.getByText('Dilution water to add (plan)')).toBeTruthy();
  expect(screen.getByText('Finished solution (plan)')).toBeTruthy();
  // ...beside the record's own mass, which is the figure the maker is acting on.
  expect(screen.getByText('Finished so far (computed)')).toBeTruthy();
  // Exactly one row for each claim: no doubling under any name.
  expect(screen.queryAllByText(/^Dilution water to add/)).toHaveLength(1);
  expect(screen.queryAllByText(/^Finished solution/)).toHaveLength(1);
});

test('does not render a bottle size field or bottle count', () => {
  // Makers dilute one large batch and package it later, often into several sizes, so the
  // dilution figures stay about the batch, not about packaging.
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  expect(screen.queryByLabelText('Bottle size (ml)')).toBeNull();
  expect(screen.queryByText(/Bottles filled/)).toBeNull();
});

it('shows batch figures on "Whole batch" and portion figures on "Custom amount"', () => {
  const onScopeChange = vi.fn();
  const { rerender } = render(
    <DilutionPanel {...BASE} dilutionScope="batch" onDilutionScopeChange={onScopeChange} targetMl="1200" />,
  );
  expect(screen.getByText('Dilution water to add')).toBeTruthy();
  expect(screen.queryByText('Paste to weigh out')).toBeNull();

  fireEvent.click(screen.getByLabelText('Custom amount'));
  expect(onScopeChange).toHaveBeenCalledWith('portion');

  rerender(
    <DilutionPanel {...BASE} dilutionScope="portion" onDilutionScopeChange={onScopeChange} targetMl="1200" />,
  );
  expect(screen.getByText('Paste to weigh out')).toBeTruthy();
  expect(screen.queryByText('Dilution water to add')).toBeNull();
});

it('only offers the amount field in custom-amount scope', () => {
  const { rerender } = render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
  expect(screen.queryByLabelText('Amount to make (ml)')).toBeNull();
  rerender(<DilutionPanel {...BASE} dilutionScope="portion" targetMl="" />);
  expect(screen.getByLabelText('Amount to make (ml)')).toBeTruthy();
});

describe('a measured paste is the whole batch — there is no declaration to make', () => {
  // The control that used to sit under the measured-paste field ("That weight is: (o) all of
  // it ( ) what's left after earlier dilutions") is gone by request. Every reading is the
  // whole batch now; sizing a partial dilution is what Custom amount is for.
  it('offers no declaration control of any kind', () => {
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
    expect(screen.queryByRole('radiogroup', { name: 'What the measured paste weight represents' })).toBeNull();
    expect(screen.queryByText('That weight is:')).toBeNull();
    expect(screen.queryByLabelText('all of it')).toBeNull();
    expect(screen.queryByLabelText("what's left after earlier dilutions")).toBeNull();
  });

  it('keeps the scope toggle it was never part of', () => {
    // The two controls sat next to each other and read alike; removing one must not touch
    // the other, which is how the maker still says "make just this much now".
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
    expect((screen.getByRole('radio', { name: 'Whole batch' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Custom amount' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByLabelText('Measured paste weight — the whole batch (g, optional)')).toBeTruthy();
  });

  it('takes the reading as the whole batch in both scopes, with no radio to say so', () => {
    // 1,480 g on RESULT: above the 1,200 g anhydrous floor, under the 4,000 g solution. The
    // batch row pours 4,000 − 1,480 and Custom amount sizes from the same 1,480 g pot — the
    // behaviour the "all of it" radio used to select, now unconditional.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" measuredPasteGrams="1480" />);
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('2,520 g');
    expect(screen.getByText(/uses your measured paste/i)).toBeTruthy();
    cleanup();
    render(<DilutionPanel {...BASE} dilutionScope="portion" targetMl="1000" measuredPasteGrams="1480" />);
    expect(screen.getByText(/than predicted/i)).toBeTruthy();
    expect(screen.queryByText(/treated as what.s left/i)).toBeNull();
  });

  it('says nothing anywhere about a declaration, in either scope or either mode', () => {
    // The sweep: this is the failure that recurred through every round of this work — copy
    // pointing at a control that had just been removed. A reading is rendered in each scope
    // and each mode, rejected and accepted, and no surface may name the old options.
    // The radio labels as the panel quoted them, plus the word for the control itself.
    // Deliberately NOT a bare /all of it/: the split-liquid caveat legitimately says "all of
    // it is solids", and a sweep that fails on true copy gets weakened rather than obeyed.
    const FORBIDDEN =
      /That weight is|what.s left after earlier dilutions|declaration|[""']all of it[""']/i;
    for (const scope of ['batch', 'portion'] as const) {
      // The mode axis this used to sweep is now the ARM: a reading is the whole batch under
      // either, and the copy about it may not name a control that is not there.
      for (const record of ['', '0'] as const) {
        for (const reading of ['', '900', '1480', '4500', '-500']) {
          render(
            <DilutionPanel
              {...BASE}
              dilutionScope={scope}
              targetMl={scope === 'batch' ? '' : '1000'}
              gradualWaterGrams={record}
              onGradualWaterChange={() => {}}
              cookWaterGrams={400}
              wholeBatchPasteGrams={2050}
              measuredPasteGrams={reading}
            />,
          );
          expect(document.body.textContent ?? '').not.toMatch(FORBIDDEN);
          cleanup();
        }
      }
    }
  });
});

// Moved from the old PartialDilution.test.tsx: these drove the measured-paste input or the
// ml field, both of which now live in this shell rather than in PortionDilutionResults.
describe('portion scope: the measured-paste input that used to live in PartialDilution', () => {
  it('keeps the measured-paste and amount inputs visible even when the paste is already more dilute than the target', () => {
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="portion"
        targetMl=""
        dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }}
      />,
    );
    expect(screen.getByLabelText('Amount to make (ml)')).toBeTruthy();
    expect(screen.getByLabelText('Measured paste weight — the whole batch (g, optional)')).toBeTruthy();
    expect(screen.getByText(/already more dilute/i)).toBeTruthy();
  });

  it('labels the measured-paste field with the batch it wants, in every scope and mode', () => {
    // The declaration radio ("That weight is: (o) all of it") used to be the antecedent that
    // told the maker WHICH paste before any error did. With it gone the field's own copy has
    // to carry that, and it has to carry it in concentration mode too — the ratio caveat only
    // renders in the other one.
    //
    // It matters most in Custom amount, where the field sits under "Paste to weigh out —
    // 412 g" and a hint reading "Weigh your paste and enter it above for exact figures", and
    // the source itself frames the reading as a portion (LS:1534: "place the portion of paste
    // you wish to dilute on a tared scale"). A shallow drawdown clears the solids floor and is
    // silently taken as the batch — 1,500 g against a 1,600 g pot pours 2,500 g, no alert.
    for (const scope of ['batch', 'portion'] as const) {
      for (const record of ['', '0'] as const) {
        render(
          <DilutionPanel
            {...BASE}
            dilutionScope={scope}
            targetMl={scope === 'batch' ? '' : '1000'}
            gradualWaterGrams={record}
            onGradualWaterChange={() => {}}
          />,
        );
        expect(screen.getByText('Measured paste weight — the whole batch (g, optional)')).toBeTruthy();
        // …and every user gets the same words. Read the visible label off the DOM rather
        // than restating it, so this half cannot go stale when the copy changes: whatever
        // the span says, the accessible name has to contain it.
        //
        // This replaces an "the aria-label is unchanged" clause, which pinned the wrong
        // thing — it was satisfied precisely by the narrow aria-label that withheld "the
        // whole batch" from screen-reader and voice-control users. A restored aria-label
        // fails this, because aria-label WINS over the wrapping label and would no longer
        // contain the span.
        const visibleLabel = screen.getByText(/^Measured paste weight/).textContent!;
        const input = screen.getByLabelText(visibleLabel);
        expect(accessibleNameOf(input).includes(visibleLabel)).toBe(true);
        cleanup();
      }
    }
  });
});

describe('the measurement feedback follows the measured-paste input, not the scope toggle', () => {
  // The consolidation moved the measured-paste INPUT into this shell, where it is visible in
  // both scopes, but left its rejection alerts behind in PortionDilutionResults — which
  // renders only in Custom amount scope. So in the DEFAULT scope a physically impossible
  // reading sat directly above a dilution figure that silently ignored it, with nothing on
  // screen to say why. Feedback belongs with the input: both scopes, one copy each.
  const REJECTIONS = [
    {
      what: 'lighter than the soap the batch makes',
      props: { measuredPasteGrams: '900' },
      match: /cannot be all of the paste/i,
    },
    {
      what: 'heavier than the target solution',
      props: { measuredPasteGrams: '4500' },
      match: /already weighs more than/i,
    },
  ];

  for (const { what, props, match } of REJECTIONS) {
    it(`explains a reading ${what} in Whole batch scope`, () => {
      render(<DilutionPanel {...BASE} {...props} dilutionScope="batch" targetMl="" />);
      expect(screen.getByRole('alert').textContent).toMatch(match);
    });

    it(`explains a reading ${what} in Custom amount scope, exactly once`, () => {
      render(<DilutionPanel {...BASE} {...props} dilutionScope="portion" targetMl="1000" />);
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].textContent).toMatch(match);
      // A rejected reading still suppresses the portion figures it would have driven.
      expect(screen.queryByText('Paste to weigh out')).toBeNull();
    });
  }

  it('does not stack the over-dilution verdict on top of a rejection alert — both scopes answer alike', () => {
    // PortionDilutionResults excludes a rejected measurement from its own over-dilution
    // branch ("A rejected measurement gets its own alert above instead of this one"); the
    // shell gated only on !measuredPasteValid and so kept the verdict. A mis-tared 900 g on
    // a 1,200 g-anhydrous batch therefore rendered TWO alerts in Whole batch and one in
    // Custom amount — and the second asserted a verdict derived from exactly the assumed
    // cook water the rejected reading was contesting.
    const props = {
      ...BASE,
      dilution: {
        anhydrousGrams: 1200,
        solutionGrams: 1200 / 0.9,
        totalWaterGrams: 1200 / 0.9 - 1200,
        dilutionWaterGrams: 0,
        glycerinGrams: 100,
        soapConcentrationPercent: 90,
        targetExceedsPaste: true,
      },
      measuredPasteGrams: '900',
    };

    render(<DilutionPanel {...props} dilutionScope="batch" targetMl="" />);
    const batchAlerts = screen.getAllByRole('alert');
    expect(batchAlerts).toHaveLength(1);
    expect(batchAlerts[0].textContent).toMatch(/cannot be all of the paste/i);
    expect(screen.queryByText(/already more dilute/i)).toBeNull();
    cleanup();

    render(<DilutionPanel {...props} dilutionScope="portion" targetMl="1000" />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText(/already more dilute/i)).toBeNull();
  });

  describe('the floor the alert names is the floor that rejected the reading', () => {
    // RESULT is 1,200 g anhydrous with 400 g of cook water. Add 900 g of an alternative
    // liquid at 50% water and 450 g of it is solids that stay in the crock: the pot is
    // 2,050 g and nothing under 1,650 g can be all of the paste. Quoting "the 1,200 g of
    // soap this batch makes" beside that bound would name a figure that is neither the
    // threshold nor anything else on screen — and a 1,500 g reading is not below it, so the
    // sentence would be false as well as useless.
    const WITH_SOLIDS = { cookWaterGrams: 400, wholeBatchPasteGrams: 2050 };

    it('names the soap AND the solids, and quotes the raised floor', () => {
      render(
        <DilutionPanel {...BASE} {...WITH_SOLIDS} measuredPasteGrams="1500" dilutionScope="batch" targetMl="" />,
      );
      const alert = screen.getByRole('alert').textContent!.replace(/\s+/g, ' ');
      expect(alert).toContain('less than the 1,650 g of soap and alternative-liquid solids');
      expect(alert).toContain('the cook boils off water, not solids');
      // Both remedies still apply — a mis-tare and a partial pot are still the two ways to
      // get here — and neither names a control that is not on screen.
      expect(alert).toContain('Check the scale was tared');
      expect(alert).toContain("this field takes the batch's full paste weight");
    });

    it('keeps the original wording, verbatim, for a recipe with no solids', () => {
      render(
        <DilutionPanel
          {...BASE}
          cookWaterGrams={400}
          wholeBatchPasteGrams={1600} // anhydrous + cook water: no split liquid
          measuredPasteGrams="900"
          dilutionScope="batch"
          targetMl=""
        />,
      );
      const alert = screen.getByRole('alert').textContent!.replace(/\s+/g, ' ');
      expect(alert).toContain('less than the 1,200 g of soap this batch makes');
      expect(alert).toContain('solids do not evaporate');
      expect(alert).not.toContain('alternative-liquid solids');
    });

    it('applies nothing it has refused: the batch row falls back to the corrected pot', () => {
      // The panel must not reject in one place and apply in another. Before the floor was
      // raised the same reading was applied here, printing 4,000 − 1,500 = 2,500 g of water
      // for a pot that cannot exist.
      render(
        <DilutionPanel {...BASE} {...WITH_SOLIDS} measuredPasteGrams="1500" dilutionScope="batch" targetMl="" />,
      );
      // 4,000 − 2,050: the unmeasured corrected pour, the same figure the field-blank panel
      // prints — asserted right below so this cannot pass on a coincidence.
      expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('1,950 g');
      expect(screen.queryByText(/uses your measured paste/i)).toBeNull();
      cleanup();
      render(<DilutionPanel {...BASE} {...WITH_SOLIDS} dilutionScope="batch" targetMl="" />);
      expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('1,950 g');
    });

    it('refuses it in Custom amount too, and sizes no portion from it', () => {
      render(
        <DilutionPanel {...BASE} {...WITH_SOLIDS} measuredPasteGrams="1500" dilutionScope="portion" targetMl="1000" />,
      );
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].textContent).toContain('1,650 g');
      expect(screen.queryByText('Paste to weigh out')).toBeNull();
      // The shell reads the same verdict for its density caveat, which explains a
      // gram→millilitre bridge and so must not print with no millilitre figure beside it.
      // It is the one thing that catches the shell keeping the old floor while the child
      // uses the new one.
      expect(screen.queryByText(/Volume assumes/i)).toBeNull();
    });

    it('leaves a reading at or above the floor exactly as it was', () => {
      // The control: raising the floor must not disturb the readings the feature exists for.
      // 1,650 g is the boundary and is accepted; 1,900 g is a normal post-cook reading,
      // lighter than the 2,050 g the recipe predicts because the cook boiled water off.
      for (const [reading, pour] of [['1650', '2,350 g'], ['1900', '2,100 g']] as const) {
        render(
          <DilutionPanel {...BASE} {...WITH_SOLIDS} measuredPasteGrams={reading} dilutionScope="batch" targetMl="" />,
        );
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe(pour);
        cleanup();
      }
    });
  });

  it('still states the over-dilution verdict when nothing rejected a reading', () => {
    // The exclusion is about a CONTESTED assumption, not about the verdict itself: with no
    // measurement on the field there is nothing contesting it, so it must still be said.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }}
        dilutionScope="batch"
        targetMl=""
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/already more dilute/i);
  });

  describe('a reading heavier than the target solution is refused by the solution ceiling', () => {
    // RESULT is a 4,000 g solution. Add 900 g of an alternative liquid at 50% water and the
    // pot is 2,050 g. A 4,100 g reading is above both, and exceedsSolution is the rule that
    // owns it — one alert, naming the target as the thing that has to move.
    const WITH_SOLIDS = { cookWaterGrams: 400, wholeBatchPasteGrams: 2050 };

    it('gives it exactly one alert, and names the target', () => {
      render(
        <DilutionPanel {...BASE} {...WITH_SOLIDS} measuredPasteGrams="4100" dilutionScope="batch" targetMl="" />,
      );
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].textContent).toMatch(/already weighs more than/i);
      expect(alerts[0].textContent).toMatch(/lower the target concentration/i);
    });

    it('names the forgotten pot subtraction, the overshoot its own ratio copy made reachable', () => {
      // Offering the crockpot shortcut (loaded pot minus empty pot, LS:1538) in the ratio
      // caveat made one new mistake reachable: skip the subtraction and the reading carries
      // an empty crockpot's 2-4 kg. That always OVERSHOOTS, so it lands here and never on
      // the solids floor — whose "check the scale was tared" answers a reading that is too
      // light, a mistake this one is not. Left generic ("or check the measurement"), the
      // leading remedy told a maker holding 3 kg of stoneware to add more water.
      render(
        <DilutionPanel {...BASE} {...WITH_SOLIDS} measuredPasteGrams="4100" dilutionScope="batch" targetMl="" />,
      );
      const alert = screen.getByRole('alert').textContent ?? '';
      expect(alert).toMatch(/subtract the empty pot/i);
      expect(alert).toMatch(/crockpot/i);
      // The control-based remedy still leads: a correct reading against an unreachable
      // target is the other, older way into this alert, and it is not a measurement error.
      // Both indices are asserted found before they are compared — indexOf/search return -1
      // on a miss, and -1 is less than every hit, so an unguarded comparison would go
      // vacuous the moment either phrase was reworded (or merely re-cased, which the
      // sibling test's case-insensitive presence pin would not catch).
      const remedyIndex = alert.search(/lower the target concentration/i);
      const subtractIndex = alert.search(/subtract the empty pot/i);
      expect(remedyIndex).toBeGreaterThanOrEqual(0);
      expect(subtractIndex).toBeGreaterThanOrEqual(0);
      expect(remedyIndex).toBeLessThan(subtractIndex);
    });
  });

  // 400 g of a zero-water liquid on a 1,200 g-anhydrous batch at an 80% target: a 300 g
  // water allowance against 400 g of solids, so the solids-corrected total goes NEGATIVE.
  // The state the "Total water" correction cannot answer, and the one it is not allowed to
  // answer wrongly.
  const SOLIDS_PAST_ALLOWANCE = {
    dilution: {
      anhydrousGrams: 1200,
      solutionGrams: 1500,
      totalWaterGrams: 300,
      dilutionWaterGrams: 0,
      glycerinGrams: 100,
      soapConcentrationPercent: 80,
      targetExceedsPaste: true,
    },
    cookWaterGrams: 330,
    wholeBatchPasteGrams: 1930, // 1,200 + 330 + 400 g of solids
  };

  it('falls back to the target\'s own water when the solids exceed its whole allowance — never a negative, never a false zero', () => {
    // Three ways to print 300 − 400, all claims about a solution that cannot exist: "-96 g"
    // is not a weight, "0 g" asserts the finished solution holds none (and contradicts a
    // live pour — see the next test), and core's own figure at least means something
    // definite, is what this row has printed for every unreachable target in the app's
    // history, and keeps Paste (anhydrous) + Total water = Finished solution intact in
    // exactly the state where the corrected figure has to break it.
    render(<DilutionPanel {...BASE} {...SOLIDS_PAST_ALLOWANCE} dilutionScope="batch" targetMl="" />);
    const total = screen.getByText('Total water').nextElementSibling!.textContent!;
    expect(total).toBe('300 g');
    // Spelled out, because both mutants are silent otherwise: no minus sign anywhere in the
    // grid, and not the clamped zero either.
    expect(total).not.toContain('-');
    expect(total).not.toBe('0 g');
    // The identity the fallback preserves, read straight off the screen.
    expect(
      Number(screen.getByText('Paste (anhydrous)').nextElementSibling!.textContent!.replace(/[^0-9.]/g, '')) +
        Number(total.replace(/[^0-9.]/g, '')),
    ).toBe(
      Number(screen.getByText('Finished solution').nextElementSibling!.textContent!.replace(/[^0-9.]/g, '')),
    );
  });

  it('and never prints a total of none beside water it is telling the maker to pour', () => {
    // The sharp form, and the reading the solids floor was raised to refuse. A 1,400 g
    // reading on this batch is physically impossible — the pot holds 1,200 g of soap and
    // 400 g of solids that cannot boil off, so nothing under 1,600 g can be all of it — and
    // it used to clear every guard on the anhydrous-only floor and be applied, making the
    // pour 1,500 − 1,400 = 100 g beside a "Total water" of 300 g.
    //
    // It is refused now, so the row falls back to the corrected pot's own clamped figure and
    // there is no live pour left to contradict. On this fixture the corrected total goes
    // negative exactly because solids (400 g) exceed the target's whole water allowance
    // (300 g), and that is the same inequality that puts the floor (anhydrous + solids)
    // above the ceiling (anhydrous + allowance) — so NO reading is acceptable here at all,
    // and "a live pour beside the fallback total" is unreachable rather than merely absent.
    // Pinned as such in measuredPaste.test's own sweep over the same figures.
    //
    // Which is why this test does not stop here: the emptiness that makes the fixture safe
    // also makes its copy of the invariant vacuous, so the second and third renders below
    // carry it on a pot that accepts readings.
    render(
      <DilutionPanel
        {...BASE}
        {...SOLIDS_PAST_ALLOWANCE}
        measuredPasteGrams="1400"
        dilutionScope="batch"
        targetMl=""
      />,
    );
    const pour = screen.getByText('Dilution water to add').nextElementSibling!.textContent!;
    const total = screen.getByText('Total water').nextElementSibling!.textContent!;
    expect(pour).toBe('0 g');
    expect(total).toBe('300 g');
    expect(Number(total.replace(/[^0-9.]/g, ''))).toBeGreaterThanOrEqual(
      Number(pour.replace(/[^0-9.]/g, '')),
    );
    // …and the reading is not silently dropped: one alert, naming the floor it missed and
    // why that floor is where it is.
    const alerts = screen.queryAllByRole('alert');
    expect(alerts.length).toBe(1);
    const alert = alerts[0]!.textContent!.replace(/\s+/g, ' ');
    expect(alert).toContain('less than the 1,600 g of soap and alternative-liquid solids');
    expect(alert).toContain('the cook boils off water, not solids');
    cleanup();

    // The relation above reads 300 >= 0 on this fixture, which is true of any two numbers
    // the row could print — it survives every mutation of either figure. That is not a
    // weakness of the invariant, it is the fixture: the acceptance window here is EMPTY (the
    // floor sits above the ceiling), so no reading can put a live pour on screen to test it
    // against. So test it where it can fail — on a pot whose window is open, with a reading
    // the panel actually applies, at the one reading where the relation is TIGHT.
    //
    // 1,200 g of soap, 400 g of cook water and 900 g of a half-water liquid: a 2,050 g pot,
    // 450 g of it solids, so the floor is 1,650 g and the target's own water allowance
    // (2,800 g) is far past it. A reading AT the floor is accepted, and it is the extreme
    // case by construction: the paste holds no water at all, so every gram of the finished
    // solution's water is still to be poured and the two rows must print the SAME number.
    // One gram more of pour than total is a pot that reaches the target and overshoots it.
    render(
      <DilutionPanel
        {...BASE}
        cookWaterGrams={400}
        wholeBatchPasteGrams={2050}
        measuredPasteGrams="1650"
        dilutionScope="batch"
        targetMl=""
      />,
    );
    const livePour = screen.getByText('Dilution water to add').nextElementSibling!.textContent!;
    const liveTotal = screen.getByText('Total water').nextElementSibling!.textContent!;
    // The pour is measurement-DERIVED, not the fallback: 4,000 − 1,650, where the unmeasured
    // corrected pour on this same pot is 4,000 − 2,050 = 1,950 g. Asserted both ways round so
    // the relation below cannot pass on a reading that was quietly refused — which is exactly
    // how the 1,400 g render above stopped exercising it.
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(screen.getByText(/uses your measured paste/i)).toBeTruthy();
    expect(livePour).toBe('2,350 g');
    expect(livePour).not.toBe('1,950 g');
    // Total water is corrected for the solids too (2,800 − 450), so this is 2,350 against
    // 2,350: the invariant at zero slack, where a gram of drift in either figure breaks it.
    expect(liveTotal).toBe('2,350 g');
    expect(Number(liveTotal.replace(/[^0-9.]/g, ''))).toBeGreaterThanOrEqual(
      Number(livePour.replace(/[^0-9.]/g, '')),
    );
    cleanup();

    // …and with slack, so the relation is not pinned only at its degenerate point: a normal
    // post-cook 1,900 g reading holds 250 g of its own water, leaving 2,100 g to pour out of
    // the same 2,350 g total.
    render(
      <DilutionPanel
        {...BASE}
        cookWaterGrams={400}
        wholeBatchPasteGrams={2050}
        measuredPasteGrams="1900"
        dilutionScope="batch"
        targetMl=""
      />,
    );
    const slackPour = screen.getByText('Dilution water to add').nextElementSibling!.textContent!;
    const slackTotal = screen.getByText('Total water').nextElementSibling!.textContent!;
    expect(slackPour).toBe('2,100 g');
    expect(slackTotal).toBe('2,350 g');
    expect(Number(slackTotal.replace(/[^0-9.]/g, ''))).toBeGreaterThanOrEqual(
      Number(slackPour.replace(/[^0-9.]/g, '')),
    );
    // The slack is the paste's own water, read off the screen rather than restated: total
    // minus pour is what the 1,900 g pot brought with it (1,900 − 1,200 anhydrous − 450
    // solids). This is the identity the row's own note claims holds "under a measurement
    // too", and nothing tested it on a live one.
    expect(
      Number(slackTotal.replace(/[^0-9.]/g, '')) - Number(slackPour.replace(/[^0-9.]/g, '')),
    ).toBe(250);
  });

  it('a pot that weighs exactly the solution is AT the target, not past it — no alert, and nothing to pour', () => {
    // The boundary the corrected-pot verdict is deliberately strict about, and the sibling
    // of the ones lib/measuredPaste documents accepting (measured === anhydrousGrams,
    // measured === solutionGrams). At pot === solution the batch reaches the target exactly
    // with no water added: the 0 g is completion, not refusal, and an alert saying the paste
    // is "already more dilute than the target" would be false — it is exactly at it.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 1200,
          solutionGrams: 2000,
          totalWaterGrams: 800,
          dilutionWaterGrams: 400,
          glycerinGrams: 100,
          soapConcentrationPercent: 60,
          targetExceedsPaste: false,
        }}
        cookWaterGrams={400}
        wholeBatchPasteGrams={2000} // 1,200 + 400 + 400 g of solids — exactly the solution
        dilutionScope="batch"
        targetMl=""
      />,
    );
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('0 g');
    expect(screen.queryByRole('alert')).toBeNull();
    // One gram past it and the verdict is due — the boundary is the only thing separating
    // these two renders.
    cleanup();
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 1200,
          solutionGrams: 2000,
          totalWaterGrams: 800,
          dilutionWaterGrams: 400,
          glycerinGrams: 100,
          soapConcentrationPercent: 60,
          targetExceedsPaste: false,
        }}
        cookWaterGrams={400}
        wholeBatchPasteGrams={2001}
        dilutionScope="batch"
        targetMl=""
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/already more dilute than the target above/i);
  });

  it('stops telling a maker who just weighed the paste to weigh the paste', () => {
    // A rejected reading is the only kind of state where this alert stacks on another, and
    // it is the one where its closing remedy is already spent: the maker weighed the pot,
    // the reading was refused above, and "or weigh the paste above" sends them back to do
    // it again. The verdict itself stays — the row fell back to the recipe's own clamped
    // figure precisely BECAUSE the reading was refused, so it still needs accounting for.
    //
    // REWRITTEN (2026-08-16, second round) to stack on a READING-ONLY refusal: the stacked
    // arm used to use 1,950 g (exceeds-solution), and that pairing is gone by decision —
    // the corrected-pot paragraph now yields to the exceeds-solution rejection, which
    // already accounts for the 0 g row (see "the corrected-pot paragraph yields" in the
    // ceiling describes). 1,000 g is under this pot's 1,600 g solids floor instead: a
    // refusal about the scale, which says nothing about the 0 g underneath, so the
    // pairing — and the dropped clause this test is about — lives on exactly there.
    const props = {
      ...BASE,
      dilution: {
        anhydrousGrams: 1200,
        solutionGrams: 1900,
        totalWaterGrams: 700,
        dilutionWaterGrams: 300,
        glycerinGrams: 100,
        soapConcentrationPercent: 63.2,
        targetExceedsPaste: false,
      },
      cookWaterGrams: 400,
      wholeBatchPasteGrams: 2000,
      dilutionScope: 'batch' as const,
      targetMl: '',
    };

    // Rejected (1,000 g is under the 1,600 g of soap and solids the pot holds): two
    // alerts, and the second ends at the remedy.
    render(<DilutionPanel {...props} measuredPasteGrams="1000" />);
    const stacked = screen.getAllByRole('alert').map((n) => n.textContent!.replace(/\s+/g, ' '));
    expect(stacked).toHaveLength(2);
    expect(stacked.some((t) => /cannot be all of the paste/i.test(t))).toBe(true);
    const verdict = stacked.find((t) => t.includes('it weighs 2,000 g'))!;
    expect(verdict).toContain('Lower the target concentration above (more water) until the paste can reach it.');
    expect(verdict).not.toMatch(/weigh the paste above/i);
    cleanup();

    // With the field blank there is nothing stacked and nothing spent, so the clause is the
    // most useful thing the alert can say — a lighter real pot is the one way out that does
    // not move the target.
    render(<DilutionPanel {...props} />);
    expect(screen.getByRole('alert').textContent).toMatch(/or weigh the paste above/i);
  });

  it('names the solids even when an undeclared liquid is in the pot — they come from declared rows alone', () => {
    // 400 g of glycerin (declared, zero water) beside 600 g of an undeclared liquid at a 30%
    // target. The old gate withheld the whole paragraph on the mere presence of the
    // undeclared grams, so the 400 g the solids take off the pour — and the 400 g gap they
    // open between Paste (anhydrous) + Total water and Finished solution — went unnamed.
    // Solids are exact here whatever the undeclared liquid contains: an undeclared row is
    // counted as ALL water, so it contributes none.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 1200,
          solutionGrams: 4000,
          totalWaterGrams: 2800,
          dilutionWaterGrams: 1870,
          glycerinGrams: 100,
          soapConcentrationPercent: 30,
          targetExceedsPaste: false,
        }}
        cookWaterGrams={930} // 330 g lye water + the undeclared 600 g, counted as all water
        wholeBatchPasteGrams={2530} // + 400 g of glycerin solids
        altLiquidWaterGrams={600}
        unknownLiquidGrams={600}
        dilutionScope="batch"
        targetMl=""
      />,
    );
    const hint = screen.getByText(/plain distilled water only/i).textContent!.replace(/\s+/g, ' ');
    expect(hint).toContain('400 g of your alternative liquid is solids rather than water');
    expect(hint).toContain('not part of the total water above');
    // And it must NOT claim a head start: the pour is lighter by the undeclared liquid's
    // assumed water too, and that part is exactly what is not knowable.
    expect(hint).not.toMatch(/Already .* lighter/);
    // The gap it accounts for, read off the screen: 1,200 + 2,400 against 4,000.
    expect(screen.getByText('Total water').nextElementSibling!.textContent).toBe('2,400 g');
  });

  it('says a zero-water liquid brought no water in Custom amount too, not just Whole batch', () => {
    // The portion-scope twin of the batch sentence one branch above, which is pinned in
    // dilutionKnownDefects. Both exist because the water-only wording ("Part of the water is
    // already there: it came in with the alternative liquid") is simply false of glycerin —
    // no water came in with it — and Custom amount carries these caveats for the same reason
    // Whole batch does, the liquid being a property of the recipe rather than of how much of
    // it you are making.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
          dilutionWaterGrams: 2070, glycerinGrams: 110, soapConcentrationPercent: 30,
          targetExceedsPaste: false,
        }}
        cookWaterGrams={330}
        wholeBatchPasteGrams={1930} // + 400 g of a zero-water liquid's solids
        altLiquidWaterGrams={0}
        unknownLiquidGrams={0}
        dilutionScope="portion"
        targetMl="1000"
      />,
    );
    const hint = screen.getByText(/plain distilled water only/i).textContent!.replace(/\s+/g, ' ');
    expect(hint).toContain('it brought no water, but it takes up room in the finished solution');
    expect(hint).not.toMatch(/Part of the water is already there/);
    // No batch figure travels into portion scope — that rule predates this branch.
    expect(hint).not.toMatch(/400 g/);
  });

  it('never stacks the corrected-pot verdict on the water-only one — the flag is subsumed, not paralleled', () => {
    // The gate that keeps them apart is load-bearing, and it is the one thing about
    // pasteAlreadyPastTarget a reader would be tempted to drop as redundant.
    // targetExceedsPaste IS totalWater < cookWater, i.e. solutionGrams < anhydrous +
    // cookWater — and the corrected pot is that sum PLUS the liquid's solids, so it is over
    // the solution too whenever the flag is set. Ungated, every over-dilute split-liquid
    // recipe would print two alerts making the same claim in different words.
    //
    // 1,200 g anhydrous at a 90% target: 1,333 g of solution against 400 g of cook water
    // (flag set) and a 1,700 g pot once 100 g of a liquid's solids are counted.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 1200,
          solutionGrams: 1200 / 0.9,
          totalWaterGrams: 1200 / 0.9 - 1200,
          dilutionWaterGrams: 0,
          glycerinGrams: 100,
          soapConcentrationPercent: 90,
          targetExceedsPaste: true,
        }}
        cookWaterGrams={400}
        wholeBatchPasteGrams={1700}
        dilutionScope="batch"
        targetMl=""
      />,
    );
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    // …and it is the water-only one, which owns this state: it is the plainer sentence, and
    // the corrected pot adds nothing to a verdict the recipe's own water already settles.
    expect(alerts[0].textContent).toMatch(/adding water only lowers the concentration further/i);
  });

  it('a valid measurement settles the corrected-pot verdict rather than being talked over', () => {
    // Same exclusion the water-only alert already applies, for the same reason: the pot the
    // verdict describes is anhydrous + ASSUMED cook water + solids, and a reading is direct
    // evidence about the pot. The measured-paste guards refuse anything heavier than the
    // solution with their own alert, so a reading that survives them always leaves a real
    // figure to pour — here 1,900 − 1,800 = 100 g — and nothing left to refuse.
    const overTarget = {
      anhydrousGrams: 1200,
      solutionGrams: 1900,
      totalWaterGrams: 700,
      dilutionWaterGrams: 300,
      glycerinGrams: 100,
      soapConcentrationPercent: 63.2,
      targetExceedsPaste: false,
    };
    // Unmeasured, this is exactly the state the alert exists for: a 2,000 g pot (400 g of it
    // a zero-water liquid's solids) against 1,900 g of solution, so the row clamps to 0 g.
    render(
      <DilutionPanel
        {...BASE}
        dilution={overTarget}
        cookWaterGrams={400}
        wholeBatchPasteGrams={2000}
        dilutionScope="batch"
        targetMl=""
      />,
    );
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('0 g');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toMatch(/already more dilute than the target above/i);
    cleanup();

    render(
      <DilutionPanel
        {...BASE}
        dilution={overTarget}
        cookWaterGrams={400}
        wholeBatchPasteGrams={2000}
        measuredPasteGrams="1800"
        dilutionScope="batch"
        targetMl=""
      />,
    );
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('100 g');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains a zero or negative reading rather than silently ignoring it, in both scopes', () => {
    // A negative reading passed every rule (they all self-disabled via `measured > 0`), so
    // it produced no alert at all while the batch row quietly used the recipe's computed
    // figure — a physically impossible number sitting on screen directly above figures
    // that had ignored it. min={1} on a type="number" input is only enforced on submit.
    for (const [scope, targetMl] of [['batch', ''], ['portion', '1000']] as const) {
      render(<DilutionPanel {...BASE} dilutionScope={scope} targetMl={targetMl} measuredPasteGrams="-500" />);
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].textContent).toMatch(/more than zero/i);
      cleanup();
    }

    // Zero is a typed value too, and just as unusable.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" measuredPasteGrams="0" />);
    expect(screen.getByRole('alert').textContent).toMatch(/more than zero/i);
    cleanup();

    // A blank field is not a reading — Number('') is 0, and nothing may fire for it.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" measuredPasteGrams="" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains a sub-tenth reading as a swallowed separator, not a scale problem, in both scopes', () => {
    // A thousands comma typed into this <input type="number"> is read by the browser as a
    // DECIMAL POINT — every locale — and normalized before React ever sees it, so a typed
    // 1,222 g commits as 1.222 g and the only fingerprint left is the impossible
    // precision. The floor caught this case by accident, with an alert blaming the scale's
    // tare: the wrong diagnosis, inviting a re-weigh that would reproduce the same number.
    for (const [scope, targetMl] of [['batch', ''], ['portion', '1000']] as const) {
      render(<DilutionPanel {...BASE} dilutionScope={scope} targetMl={targetMl} measuredPasteGrams="1.222" />);
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      const alert = alerts[0].textContent!.replace(/\s+/g, ' ');
      // What their entry became, quoted in grams — the 1000× shrink made visible.
      expect(alert).toContain('1.222 g');
      // The real cause, and the real fix…
      expect(alert).toMatch(/decimal point/i);
      expect(alert).toMatch(/separator/i);
      // …not the tare-blame the floor used to answer with, nor any other rule's verdict.
      expect(alert).not.toMatch(/tared/i);
      expect(alert).not.toMatch(/cannot be all of the paste/i);
      // A refused reading feeds nothing in this scope either.
      expect(screen.queryByText(/uses your measured paste/i)).toBeNull();
      expect(screen.queryByText('Paste to weigh out')).toBeNull();
      cleanup();
    }
  });

  it('refuses a two-decimal artifact ABOVE the floor, which used to be silently accepted', () => {
    // 1480,25 → 1480.25: clears the 1,200 g floor, sits under the 4,000 g ceiling, and
    // used to be applied — the batch row poured 4,000 − 1,480.25 with no alert anywhere.
    // No scale produced it; refuse it, say what arrived, and fall back.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" measuredPasteGrams="1480.25" />);
    const alert = screen.getByRole('alert').textContent!.replace(/\s+/g, ' ');
    expect(alert).toContain('1480.25 g');
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('2,400 g');
    expect(screen.queryByText(/uses your measured paste/i)).toBeNull();
    cleanup();
    // The tenth-precision reading it shadows is still the feature working as designed —
    // the refusal is about the typed string, not the value it rounds to.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" measuredPasteGrams="1480.5" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/uses your measured paste/i)).toBeTruthy();
    // 4,000 − 1,480.5, on the panel's own gram display rule (0 decimals at batch scale).
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('2,520 g');
  });

  it('the below-solids alert names the field, not a control that is no longer there', () => {
    // Two stale remedies in this paragraph's history. It once ended "enter the whole batch
    // rather than the portion you are diluting", which read as the SCOPE toggle; then it
    // pointed at the declaration radio, which has since been removed. What is left has to
    // name something that exists: the scale, and the field's own requirement.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" measuredPasteGrams="900" />);
    const alert = screen.getByRole('alert').textContent!.replace(/\s+/g, ' ');
    expect(alert).toContain('Check the scale was tared');
    expect(alert).toContain("this field takes the batch's full paste weight");
    expect(alert).not.toMatch(/whole batch rather than the portion/i);
    expect(alert).not.toMatch(/switch the declaration/i);
  });
});

describe('a rejected reading only silences what its refusal can replace', () => {
  // DECIDED 2026-08-17 (the code-review round). `pasteAlreadyThinnerAlert` excluded every
  // REJECTED reading through the raw `measurementRejection.rejected` flag — but the
  // exclusion's whole licence is that the refusal paragraph renders in the alert's place
  // ("gets its own alert above instead"), and the exceeds-solution refusal is excluded
  // from ratio and gradual mode. There the flag was true, the paragraph was not on
  // screen, and a maker whose paste reading already exceeds the saved target's solution
  // saw NOTHING about a target the batch is already past. The clause is now keyed on the
  // refusals' own render conditions — the three reading-only rules render on their bare
  // flags in every mode and both scopes, so those still suppress everywhere; the
  // exceeds-solution rule suppresses only through `exceedsSolutionAlert`, the same const
  // its paragraph renders on.
  //
  // Built by core: 1,200 g of anhydrous soap cooked in 3,000 g of water at a saved 30%
  // target makes a 4,000 g solution holding 2,800 g of water, and 2,800 < 3,000 is
  // targetExceedsPaste. 30% sits under every solubility ceiling, so the ceiling sentence
  // cannot cover for the missing alert in any cell here — silence is silence. A 4,500 g
  // reading exceeds the 4,000 g solution; every figure distinct (1,200 / 3,000 / 4,000 /
  // 4,200 / 4,500), so no assertion below can pass by matching the wrong quantity.
  const UNDER_CEILING_OVER = calculateDilution({
    anhydrousGrams: 1200,
    cookWaterGrams: 3000,
    kohGrams: 240,
    naohGrams: 0,
    soapConcentrationPercent: 30,
  })!;
  const renderUnderCeiling = (props: Partial<ComponentProps<typeof DilutionPanel>> = {}) =>
    render(
      <DilutionPanel
        {...BASE}
        soapConcentrationPercent="30"
        dilution={UNDER_CEILING_OVER}
        cookWaterGrams={3000}
        wholeBatchPasteGrams={4200}
        dilutionScope="batch"
        targetMl=""
        onGradualWaterChange={() => {}}
        {...props}
      />,
    );
  const ALREADY_MORE_DILUTE = /already more dilute than 30%/i;

  it('is the fixture the flag is set on, with the alert as the only voice absent a reading', () => {
    // The positive control, and the reproduction's own second half: clear the field and
    // the alert is on screen — which is what makes the cells below a suppression bug
    // rather than a missing feature.
    expect(UNDER_CEILING_OVER.targetExceedsPaste).toBe(true);
    expect(UNDER_CEILING_OVER.solutionGrams).toBe(4000);
    renderUnderCeiling({ measuredPasteGrams: '' });
    expect(alertTexts()).toEqual([expect.stringMatching(ALREADY_MORE_DILUTE)]);
  });

  it('a refusal that DOES render still silences it — the reading-only rules render everywhere', () => {
    // Per refusal kind: belowSolids (900 g under the 1,200 g floor), nonPositive, and the
    // sub-tenth fingerprint all render their paragraphs under either arm and in both
    // scopes — so each replaces the alert exactly as before, one paragraph for one reading,
    // never the verdict stacked on the refusal.
    for (const [reading, refusal] of [
      ['900', /cannot be all of the paste/i],
      ['0', /more than zero/i],
      ['1480.25', /thousands separator/i],
    ] as const) {
      renderUnderCeiling({ measuredPasteGrams: reading });
      expect(alertTexts()).toEqual([expect.stringMatching(refusal)]);
      cleanup();
    }
  });

  it('stands down where the exceeds-solution refusal renders and replaces it', () => {
    // The pin on the `!exceedsSolutionAlert` term: the refusal names the maker's own 4,500 g
    // against the same 4,000 g solution this verdict counts from, so it owns the screen —
    // exactly one alert, and it is the refusal, not the verdict, and never both.
    renderUnderCeiling({ measuredPasteGrams: '4500' });
    expect(alertTexts()).toEqual([expect.stringMatching(/already weighs more than/i)]);
  });

  it('goes silent WITH the refusal under a record, and leaves the row accounted for', () => {
    // REPLACES the two mode cells ("the alert returns in ratio/gradual mode, where the
    // refusal that silenced it cannot render"). Their hole was a MISMATCH: the refusal was
    // excluded from a mode while the verdict's exclusion of it read the raw `rejected` flag,
    // so one was silent and the other believed it was speaking. The two gates are now the
    // same predicate — `planGoverns`, spec §4 — so the mismatch is not expressible: under a
    // record BOTH stand down together, which is the intended reading of "the record arm has
    // no target for either of them to be about".
    //
    // What that costs, and what pays for it: the plan's water row still clamps to 0 g, and
    // §4's plan-labelled caption is what accounts for it. Asserted here rather than assumed,
    // because "both alerts gone" is exactly the shape a silent screen has.
    renderUnderCeiling({ measuredPasteGrams: '4500', gradualWaterGrams: '0' });
    expect(alertTexts()).toEqual([]);
    expect(screen.queryByText(ALREADY_MORE_DILUTE)).toBeNull();
    expect(screen.queryByText(/already weighs more than/i)).toBeNull();
    expect(screen.getByText(/^Plan: at 30%/)).toBeTruthy();
    // ...and the batch's own concentration is on screen, from the pot the record counts from.
    expect(screen.getByText(/The batch so far is at/)).toBeTruthy();
  });

  it('keeps the reading-only refusals under a record too — they are about the scale', () => {
    // The other direction of the same gate: those three rules say nothing about a target, so
    // no arm may silence them. This is the clause that decides whether the record's own pot
    // is the reading or the recipe's, so a refusal going quiet here would take the figure
    // with it.
    renderUnderCeiling({ measuredPasteGrams: '900', gradualWaterGrams: '0' });
    expect(alertTexts()).toEqual([expect.stringMatching(/cannot be all of the paste/i)]);
  });
});

describe('figures that belong to one scope stay in that scope; caveats that describe the recipe do not', () => {
  it('does not print the whole-batch record figures in Custom amount scope', () => {
    // REPLACES the three ratio-pour cases here ("does not print the whole-batch ratio pour
    // figure in Custom amount scope", "still prints the ratio pour figure in Whole batch
    // scope", "keeps the 1–99% clamp alert in Custom amount scope"). The ratio pour row and
    // the clamp alert are gone with the mode; the SCOPE rule they pinned is not, and the
    // whole-batch record is now the figure that owes it. A batch record printed beside a
    // portion is the same defect in a new costume — several times larger, with nothing to say
    // which one to pour — and spec §2 makes it structural: the batch record participates
    // nowhere in portion scope.
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="portion"
        targetMl="1000"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        gradualWaterGrams="900"
        onGradualWaterChange={() => {}}
      />,
    );
    expect(screen.queryByText(/^Finished so far/)).toBeNull();
    expect(screen.queryByText('2,500 g')).toBeNull();
    expect(screen.queryByText(/The batch so far is at/)).toBeNull();
    // The "Water added so far (g)" field on this screen is the JAR's, not the batch's — same
    // caption, different record, and the batch's 900 must not appear in it.
    expect((screen.getByLabelText('Water added so far (g)') as HTMLInputElement).value).toBe('');
  });

  it('still prints the whole-batch record figures in Whole batch scope', () => {
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="batch"
        targetMl=""
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        gradualWaterGrams="900"
        onGradualWaterChange={() => {}}
      />,
    );
    expect(screen.getByText('Finished so far (computed)')).toBeTruthy();
    expect(screen.getByText('2,500 g')).toBeTruthy();
  });

  it('carries the undeclared-alt-liquid lower bound into Custom amount scope, without quoting the batch figure there', () => {
    // The portion water figure is a lower bound for exactly the same reason the batch one
    // is — undeclared liquid is counted as all water — so the caveat must follow.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 1218, solutionGrams: 4059, totalWaterGrams: 2841,
          dilutionWaterGrams: 2000, glycerinGrams: 107, soapConcentrationPercent: 30,
          targetExceedsPaste: false,
        }}
        dilutionScope="portion"
        targetMl="1000"
        altLiquidWaterGrams={300}
        unknownLiquidGrams={300}
      />,
    );
    expect(screen.getByText(/the LEAST you will need/i)).toBeTruthy();
    // 2,000 g is the WHOLE batch's dilution water — finding 1's mistake, not to be repeated,
    // so the portion-scope wording carries the caveat without carrying that figure.
    expect(screen.queryByText(/2,000 g is the LEAST/i)).toBeNull();
  });

  it('carries "top up with plain distilled water only" into Custom amount scope', () => {
    // A portion's water is net of the alternative liquid's water for exactly the same
    // reason the batch's is — the liquid is a property of the RECIPE, not of how much of
    // it you are making — and this is the one line telling the maker not to top up with
    // more milk or juice. On main both panels were mounted together so it always showed;
    // the consolidation put it inside the batch-only wrapper and Custom amount lost it.
    const props = {
      ...BASE,
      dilution: {
        anhydrousGrams: 1218, solutionGrams: 4059, totalWaterGrams: 2841,
        dilutionWaterGrams: 2000, glycerinGrams: 107, soapConcentrationPercent: 30,
        targetExceedsPaste: false,
      },
      altLiquidWaterGrams: 300,
      unknownLiquidGrams: 0,
    };
    render(<DilutionPanel {...props} dilutionScope="batch" targetMl="" />);
    // The batch scope keeps quoting its own figure, and reads as one sentence.
    expect(screen.getByText(/plain distilled water only/i).textContent).toMatch(
      /Already 300 g lighter: that much water came in with the alternative liquid/,
    );
    cleanup();

    render(<DilutionPanel {...props} dilutionScope="portion" targetMl="1000" />);
    const portionHint = screen.getByText(/plain distilled water only/i);
    // Contiguous across the scope ternary, so the substituted lead cannot lose its spacing.
    expect(portionHint.textContent).toMatch(
      /Part of the water is already there: it came in with the alternative liquid/,
    );
    // 300 g is the WHOLE batch's head start, not this portion's — the instruction carries,
    // the batch-scoped figure does not.
    expect(screen.queryByText(/Already 300 g lighter/i)).toBeNull();
  });

  it('counts the liquid\'s solids in the head start, since the water figure now does', () => {
    // 200 g of canned coconut milk at 68% water: 136 g of water into the paste and 64 g of
    // solids. The dilution water is derived from the corrected paste, so it drops by the
    // whole 200 g — quoting only the 136 g of water understated the maker's head start by
    // the solids, on the one line that puts a number to it.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 1218, solutionGrams: 4059, totalWaterGrams: 2841,
          dilutionWaterGrams: 2000, glycerinGrams: 107, soapConcentrationPercent: 30,
          targetExceedsPaste: false,
        }}
        cookWaterGrams={841}
        wholeBatchPasteGrams={1218 + 841 + 64}
        altLiquidWaterGrams={136}
        unknownLiquidGrams={0}
        dilutionScope="batch"
        targetMl=""
      />,
    );
    const hint = screen.getByText(/plain distilled water only/i);
    expect(hint.textContent).toMatch(/Already 200 g lighter/);
    expect(hint.textContent).toMatch(/136 g of water/);
    expect(hint.textContent).toMatch(/64 g of solids/);
    // And the figure it is describing agrees: 4,059 − (1,218 + 841 + 64).
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('1,936 g');
  });

  it('never bounds the row with a number bigger than the row', () => {
    // Mixed liquids, which is what makes this reachable: 200 g of a DECLARED liquid at 68%
    // water (136 g water, 64 g solids) beside 300 g of an undeclared one (counted as all
    // water, so no solids of its own). unknownLiquidGrams > 0 means SOME liquid is
    // undeclared, not all of it — so a declared liquid contributes solids alongside, and the
    // hint's uncorrected figure sat 64 g ABOVE the corrected row it claims to be a floor for.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
          dilutionWaterGrams: 2070, glycerinGrams: 110, soapConcentrationPercent: 30,
          targetExceedsPaste: false,
        }}
        cookWaterGrams={730}
        wholeBatchPasteGrams={1994}
        altLiquidWaterGrams={436}
        unknownLiquidGrams={300}
        dilutionScope="batch"
        targetMl=""
      />,
    );
    const row = screen.getByText('Dilution water to add').nextElementSibling!.textContent!;
    expect(row).toBe('2,006 g');
    const hint = screen.getByText(/no declared water content/i).textContent!;
    // The alternative-liquid caveats are ONE paragraph now (prose budget), so the floor
    // clause shares it with the head-start clause and its 64 g of solids — the bound can
    // no longer be singled out as "the first figure that is not the liquid's 300 g".
    // Pinned the other way around: EVERY figure the paragraph quotes stays at or under
    // the row it describes, and the batch figure it names is the corrected row figure
    // itself, said in the same-either-way wording — never the recipe's own 2,070 g, which
    // sat 64 g ABOVE the row it claimed to be a floor for.
    const quoted = (hint.match(/([\d,]+) g/g) ?? []).map((s) => Number(s.replace(/[, g]/g, '')));
    expect(quoted.length).toBeGreaterThan(0);
    for (const n of quoted) expect(n).toBeLessThanOrEqual(Number(row.replace(/[, g]/g, '')));
    expect(hint).toContain('2,006 g is');
    expect(hint).not.toContain('2,070');
    // …and it no longer offers declaring as a lever on that figure. The corrected water is
    // solutionGrams − (anhydrous + lye water + the liquid's whole mass), so declaring only
    // moves mass between that liquid's water and its solids — never the sum, never this
    // number. See useRecipeViewModel.test's declaration sweep for the property itself.
    expect(hint).not.toMatch(/LEAST you will need/i);
    expect(hint).toMatch(/same either way/i);
  });

  it('still calls it a floor when there is no corrected basis to make it exact', () => {
    // Without wholeBatchPasteGrams the figure really is the recipe's water-only one, which
    // the undeclared liquid's all-water assumption does bound. The old wording is right
    // there and stays — this is the branch every caller predating the corrected basis takes.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
          dilutionWaterGrams: 2070, glycerinGrams: 110, soapConcentrationPercent: 30,
          targetExceedsPaste: false,
        }}
        altLiquidWaterGrams={436}
        unknownLiquidGrams={300}
        dilutionScope="batch"
        targetMl=""
      />,
    );
    const hint = screen.getByText(/no declared water content/i).textContent!;
    expect(hint).toMatch(/2,070 g is the LEAST you will need/);
    expect(hint).toMatch(/Declare its % water/);
  });

  it('does not call absent water figures a lower bound', () => {
    // In Custom amount the hint's portion-scope wording is literally "the water figures
    // here are the LEAST you will need" — it points at figures. Ungated on whether a
    // portion rendered, it printed with the amount field blank, and with a measurement
    // rejected: no water figure anywhere on screen for it to bound. Same gate the sibling
    // density caveat already carries, and for the same reason.
    const props = {
      ...BASE,
      dilution: {
        anhydrousGrams: 1218, solutionGrams: 4059, totalWaterGrams: 2841,
        dilutionWaterGrams: 2000, glycerinGrams: 107, soapConcentrationPercent: 30,
        targetExceedsPaste: false,
      },
      altLiquidWaterGrams: 300,
      unknownLiquidGrams: 300,
      dilutionScope: 'portion' as const,
    };

    render(<DilutionPanel {...props} targetMl="" />);
    expect(screen.queryByText('Water to add')).toBeNull();
    expect(screen.queryByText(/the LEAST you will need/i)).toBeNull();
    cleanup();

    // A rejected measurement suppresses the portion with the amount still filled in.
    render(<DilutionPanel {...props} targetMl="1000" measuredPasteGrams="4500" />);
    expect(screen.queryByText('Water to add')).toBeNull();
    expect(screen.queryByText(/the LEAST you will need/i)).toBeNull();
    cleanup();

    // Present as soon as there really is a water figure to bound.
    render(<DilutionPanel {...props} targetMl="1000" />);
    expect(screen.getByText('Water to add')).toBeTruthy();
    expect(screen.getByText(/the LEAST you will need/i)).toBeTruthy();
    cleanup();

    // Whole batch always shows one, so it is unaffected.
    render(<DilutionPanel {...props} dilutionScope="batch" targetMl="" />);
    expect(screen.getByText(/2,000 g is the LEAST/i)).toBeTruthy();
  });

  it('carries the "the target may not be reachable" caveat into Custom amount scope', () => {
    // The caveat must reach Custom amount — it used to print bare there. It is now
    // PortionDilutionResults' own hedge that carries it, because the shell's version was
    // an exact duplicate of it in this state (see the "printed once per screen" describe
    // above): same condition, same figure, same remedy, twice on one screen. What this
    // test guards is that the uncertainty is stated in Custom amount at all — assert the
    // substance, not which component says it.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 1215, solutionGrams: 2431, totalWaterGrams: 1215,
          dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 50,
          targetExceedsPaste: true,
        }}
        dilutionScope="portion"
        targetMl="1000"
        altLiquidWaterGrams={900}
        unknownLiquidGrams={900}
        overDilutionCertain={false}
      />,
    );
    const hedge = screen.getByText(/no declared water content/i);
    expect(hedge.textContent).toMatch(/unknown/i);
    expect(hedge.textContent).toMatch(/declare its % water in Split liquid/i);
  });

  it('does not print the density caveat in Custom amount scope with no amount asked for', () => {
    // The caveat explains a g→ml bridge; with no volume anywhere on screen it explains
    // nothing.
    render(<DilutionPanel {...BASE} dilutionScope="portion" targetMl="" />);
    expect(screen.queryByText(/1\.03 g\/ml/)).toBeNull();
    cleanup();
    render(<DilutionPanel {...BASE} dilutionScope="portion" targetMl="1000" />);
    expect(screen.getByText(/1\.03 g\/ml/)).toBeTruthy();
  });
});

describe('the figures follow the app-wide weight unit', () => {
  it('renders the figures in the app-wide unit, and only that unit', () => {
    // There is no panel-local unit control any more: the global "Weight unit" selector
    // (BatchBasics) is the only one, and this prop is it.
    const { rerender } = render(
      <DilutionPanel {...BASE} dilutionScope="batch" weightUnit="g" targetMl="" />,
    );
    const water = () => screen.getByText('Dilution water to add').closest('div')!;
    expect(water().textContent).toContain(' g');
    expect(water().textContent).not.toContain('oz');

    rerender(<DilutionPanel {...BASE} dilutionScope="batch" weightUnit="oz" targetMl="" />);
    expect(water().textContent).toContain('oz');
    expect(water().textContent).not.toContain(' g');
  });

  it('carries the app-wide unit into the portion figures in Custom amount scope, not only the batch row', () => {
    // Custom amount is where the figures a maker actually weighs out live. Regressing the
    // one prop that carries the unit into PortionDilutionResults leaves a maker on a lb
    // scale watching the Whole-batch row obey the global selector and then weighing out a
    // portion still quoted in grams. 1,000 ml of RESULT is 412 g of paste and 618 g of
    // water.
    render(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="portion" targetMl="1000" />);
    const paste = () => screen.getByText('Paste to weigh out').closest('div')!;
    const water = () => screen.getByText('Water to add').closest('div')!;
    expect(paste().textContent).toContain('0.91 lb');
    expect(paste().textContent).not.toContain(' g');
    expect(water().textContent).toContain('1.36 lb');
    expect(water().textContent).not.toContain(' g');
    // The ratio pour figure inside the portion grid is a ratio, not a weight — it must not
    // acquire a unit.
    expect(screen.getByText('Water : paste').closest('div')!.textContent).toMatch(/1\.5 : 1/);
  });

  it("quotes the record's own finished mass in the app-wide unit", () => {
    // REPLACES 'quotes the ratio pour figure in the app-wide unit, the one number ratio mode
    // exists to produce'. That row is gone; the unit rule is not, and the record's own mass
    // is the figure that now carries it — the one number a maker reads off this panel while
    // they are actually pouring.
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="oz"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        gradualWaterGrams="900"
        onGradualWaterChange={() => {}}
      />,
    );
    // 2,500 g = 88.18 oz.
    const row = screen.getByText('Finished so far (computed)').closest('div')!;
    expect(row.textContent).toMatch(/88\.2 oz/);
    expect(row.textContent).not.toMatch(/2,500 g/);
  });

  it('renders every weight row of the whole-batch grid in the app-wide unit together', () => {
    // One row obeying while the rest do not is worse than none obeying: the grid reads as a
    // single set of figures for one batch, so a mixed-unit grid invites adding 2.65 lb of
    // paste to 2,800 g of water.
    render(
      <DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" bottledSolutionGrams={4515} />,
    );
    const expected: [string, string][] = [
      ['Dilution water to add', '5.29 lb'],
      ['Paste (anhydrous)', '2.65 lb'],
      ['Finished solution', '8.82 lb'],
      ['Total water', '6.17 lb'],
      ['Glycerin (retained)', '0.24 lb'],
      ['≈ Finished product', '9.95 lb'],
    ];
    for (const [label, value] of expected) {
      const row = screen.getByText(label).closest('div')!;
      expect(row.textContent).toContain(value);
      expect(row.textContent).not.toContain(' g');
    }
    // Volume is millilitres in every unit — the unit governs weights only.
    expect(screen.getByText('≈ Finished volume').closest('div')!.textContent).toContain('4,383 ml');
  });

  it('quotes the app-wide unit inside the alternative-liquid caveats too', () => {
    // These are prose, not grid rows, and were the easiest sites to leave behind: a caveat
    // reading "Already 300 g lighter" beside a grid in ounces is the same mixed-unit trap in
    // sentence form. 300 g → 10.6 oz; the batch's own 2,000 g floor → 70.5 oz. The two hints
    // are mutually exclusive (the head-start line needs a DECLARED liquid, the floor line an
    // undeclared one), so each gets its own render.
    const dilution = {
      anhydrousGrams: 1218, solutionGrams: 4059, totalWaterGrams: 2841,
      dilutionWaterGrams: 2000, glycerinGrams: 107, soapConcentrationPercent: 30,
      targetExceedsPaste: false,
    };
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="oz"
        dilution={dilution}
        dilutionScope="batch"
        targetMl=""
        altLiquidWaterGrams={300}
        unknownLiquidGrams={0}
      />,
    );
    expect(screen.getByText(/plain distilled water only/i).textContent).toMatch(/Already 10\.6 oz lighter/);
    cleanup();

    render(
      <DilutionPanel
        {...BASE}
        weightUnit="oz"
        dilution={dilution}
        dilutionScope="batch"
        targetMl=""
        altLiquidWaterGrams={300}
        unknownLiquidGrams={300}
      />,
    );
    const floor = screen.getByText(/the LEAST you will need/i).textContent ?? '';
    expect(floor).toMatch(/10\.6 oz of alternative liquid/);
    expect(floor).toMatch(/70\.5 oz is/);
    expect(floor).not.toMatch(/2,000 g/);
  });

  it('quotes the app-wide unit in the solids-bearing wordings of the head-start caveat too', () => {
    // The sibling test above pins the water-only wording; the paragraph has three more
    // wordings, chosen by what the liquid contributed, and each quotes its own figures —
    // so each needs its own render or its formatWeight call can silently regress to grams
    // while the water-only pin stays green (mutation-verified: it did). All three run on
    // the corrected pot: 1,800 g against 1,200 g anhydrous + 400 g cook water = 200 g of
    // solids (7.1 oz); 100 g of declared water = 3.5 oz; their 300 g sum = 10.6 oz.
    const corrected = { cookWaterGrams: 400, wholeBatchPasteGrams: 1800 };

    // Mixed liquid: water AND solids, three figures in one sentence.
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="oz"
        dilutionScope="batch"
        targetMl=""
        altLiquidWaterGrams={100}
        {...corrected}
      />,
    );
    const mixed = screen.getByText(/plain distilled water only/i).textContent ?? '';
    expect(mixed).toMatch(/Already 10\.6 oz lighter: 3\.5 oz of water/);
    expect(mixed).toMatch(/7\.1 oz of solids/);
    expect(mixed).not.toContain(' g');
    cleanup();

    // All-solids liquid (glycerin): one figure, its own sentence shape.
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="oz"
        dilutionScope="batch"
        targetMl=""
        altLiquidWaterGrams={0}
        {...corrected}
      />,
    );
    const solidsOnly = screen.getByText(/plain distilled water only/i).textContent ?? '';
    expect(solidsOnly).toMatch(/Already 7\.1 oz lighter: the alternative liquid brought no water/);
    expect(solidsOnly).not.toContain(' g');
    cleanup();

    // Undeclared liquid: only the solids are knowable, and only they are quoted.
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="oz"
        dilutionScope="batch"
        targetMl=""
        unknownLiquidGrams={300}
        {...corrected}
      />,
    );
    const undeclared = screen.getByText(/plain distilled water only/i).textContent ?? '';
    expect(undeclared).toMatch(/7\.1 oz of your alternative liquid is solids/);
    expect(undeclared).not.toContain(' g');
  });

  it('quotes both figures of the paste-already-past-target alert in the app-wide unit', () => {
    // The alert is a comparison — the pot's 4,200 g against the 4,000 g solution its soap
    // makes — so BOTH figures have to move with the unit: one converted beside one in
    // grams would compare 148.2 oz against 4,000 and read as wildly over-dilute. Neither
    // was pinned before (mutation-verified: hardcoding either to grams passed the suite).
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="oz"
        dilutionScope="batch"
        targetMl=""
        cookWaterGrams={400}
        wholeBatchPasteGrams={4200}
      />,
    );
    const alert = screen.getByText(/it weighs/).textContent ?? '';
    expect(alert).toMatch(/weighs 148\.2 oz against the 141\.1 oz its soap makes/);
    expect(alert).not.toContain(' g');
  });

  it('quotes the app-wide unit in the undeclared-liquid figure of the can\'t-tell hedge', () => {
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="oz"
        dilution={{
          anhydrousGrams: 1215, solutionGrams: 2431, totalWaterGrams: 1215,
          dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 50,
          targetExceedsPaste: true,
        }}
        dilutionScope="batch"
        targetMl=""
        altLiquidWaterGrams={900}
        unknownLiquidGrams={900}
        overDilutionCertain={false}
      />,
    );
    expect(screen.getByText(/can.t tell whether/i).textContent).toMatch(/31\.7 oz of alternative liquid/);
  });

  it('echoes the measured paste itself in grams too — it is the number the maker typed', () => {
    // Same class as the three thresholds below, applied to the reading rather than to the
    // bounds on it: the field is grams-only ("Measured paste weight — the whole batch (g, optional)"), so
    // typing 1480 with the app in lb rendered "uses your measured paste
    // (3.26 lb)" — the maker's own entry, echoed back as a number they never wrote.
    render(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" measuredPasteGrams="1480" />);
    const hint = screen.getByText(/uses your measured paste/i);
    expect(hint.textContent).toMatch(/1,480 g/);
    expect(hint.textContent).not.toMatch(/3\.26 lb/);
    // The bench figures beside it DID follow the app-wide unit — otherwise this pins
    // nothing but a constant.
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toContain('lb');
  });

  it('renders kg figures for a kg-mode recipe — the unit the printed sheet uses too', () => {
    // The one unit the old local switch refused (it fell back to grams), which made the
    // panel the only surface disagreeing with the printed BatchSheet. The prop is used
    // as-is now, kg included.
    render(<DilutionPanel {...BASE} weightUnit="kg" dilutionScope="batch" targetMl="" />);
    const water = screen.getByText('Dilution water to add').closest('div')!;
    expect(water.textContent).toContain('2.4 kg');
  });

  it('quotes the measured-paste thresholds in grams, the unit that field is typed in', () => {
    // The input is grams-only ("Measured paste weight — the whole batch (g,
    // optional)"), so a threshold
    // quoted in the app-wide unit made the maker convert to check a claim about the number
    // they had just typed: "less than the 2.65 lb of soap this batch makes" against a
    // typed 900. Every OTHER figure in the panel is a bench readout and stays on the
    // app-wide unit — these three are the exception because they are about the input.
    const alertText = () => screen.getByRole('alert').textContent ?? '';

    render(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" measuredPasteGrams="900" />);
    expect(alertText()).toMatch(/1,200 g/);
    expect(alertText()).not.toMatch(/2\.65 lb/);
    cleanup();

    render(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" measuredPasteGrams="4500" />);
    expect(alertText()).toMatch(/4,000 g/);
    expect(alertText()).not.toMatch(/8\.82 lb/);
  });
});

describe('copy that a previous round rewrote, pinned so it cannot drift back', () => {
  it('points the exceeds-solution remedy toward MORE water in concentration mode', () => {
    // solutionGrams is anhydrous ÷ concentration, so a paste already heavier than the
    // solution needs a LOWER target — "raise the target concentration" (the pre-fix
    // wording) shrinks the solution further and makes the rejection worse.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" measuredPasteGrams="4500" />);
    const alert = screen.getByRole('alert').textContent ?? '';
    expect(alert).toMatch(/cannot be diluted to/i);
    expect(alert).toMatch(/lower the target concentration/i);
    expect(alert).not.toMatch(/raise the target concentration/i);
  });

  it('no longer renders under a record at all — a record has no target for it to be about', () => {
    // Superseded twice. Task 1 (2026-08-12-whole-app-review-fixes) stopped this rendering in
    // ratio mode — "cannot be diluted to 30% at all" is a claim about the saved target, and
    // ratio mode was not aiming at one — and spec §4 converts that exclusion, verbatim, into
    // a plan-governs gate. The record arm is the state that is not aiming at a target now,
    // and it is the state this claim must stay out of.
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="batch"
        targetMl=""
        measuredPasteGrams="4500"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        gradualWaterGrams="0"
        onGradualWaterChange={() => {}}
      />,
    );
    expect(
      screen.queryAllByRole('alert').some((a) => /cannot be diluted to/i.test(a.textContent ?? '')),
    ).toBe(false);
  });

  it('does not call the reading suspect while another paragraph calls it more accurate', () => {
    // Task 1's own contradiction, on the surface that replaced its mode. The reading is
    // 4,500 g against a 4,000 g solution, so the refusal WOULD fire if the plan governed —
    // and under a record it must not, because directly below it the panel is counting from
    // that very reading and naming it: "Finished so far (weighed)". One paragraph calling the
    // number suspect, the next treating it as the pot, is exactly the pair Task 1 removed.
    render(
      <DilutionPanel
        {...BASE}
        measuredPasteGrams="4500"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        gradualWaterGrams="0"
        onGradualWaterChange={() => {}}
      />,
    );
    expect(screen.queryByText(/cannot be diluted to/i)).toBeNull();
    // The positive: the record's own readout tells the truth about the pot it counted.
    expect(screen.getByText('Finished so far (weighed)')).toBeTruthy();
    // 1,200 / 4,500 = 26.67%.
    expect(screen.getByText(/The batch so far is at 26\.67% soap/i)).toBeTruthy();
  });

  it('holds in Custom amount scope too, where the jar record governs instead', () => {
    // Step 4 of Task 1: same reading, same plan, different scope. Custom amount's own record
    // is the jar's, and it governs there — so the plan's refusal stands down for the same
    // reason, with the jar's own figures on screen instead. (The batch record is not
    // consulted here at all; spec §2.)
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="portion"
        onDilutionScopeChange={() => {}}
        targetMl="1000"
        measuredPasteGrams="4500"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        portionPasteGrams="400"
        portionWaterGrams="900"
        onPortionPasteChange={() => {}}
        onPortionWaterChange={() => {}}
      />,
    );
    expect(screen.queryByText(/cannot be diluted to/i)).toBeNull();
    expect(screen.getByText('Finished so far (this jar)')).toBeTruthy();
  });
});

describe('the density caveat needs a millilitre figure to explain', () => {
  // Gating on Number(targetMl) > 0 alone was satisfied while the portion itself was
  // suppressed — a rejected measurement, or a target the paste is already thinner than —
  // so the caveat printed with no volume anywhere on screen: the exact case its own
  // comment says the gate prevents.
  it('is absent in Custom amount scope when a rejected measurement suppressed the portion', () => {
    render(
      <DilutionPanel {...BASE} dilutionScope="portion" targetMl="1000" measuredPasteGrams="4500" />,
    );
    expect(screen.queryByText('Makes')).toBeNull();
    expect(screen.queryByText(/1\.03 g\/ml/)).toBeNull();
  });

  it('is absent in Custom amount scope when the paste is already thinner than the target', () => {
    render(
      <DilutionPanel
        {...BASE}
        dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }}
        dilutionScope="portion"
        targetMl="1000"
      />,
    );
    expect(screen.queryByText('Makes')).toBeNull();
    expect(screen.queryByText(/1\.03 g\/ml/)).toBeNull();
  });

  it('is present as soon as a portion really renders one', () => {
    render(<DilutionPanel {...BASE} dilutionScope="portion" targetMl="1000" />);
    expect(screen.getByText('Makes')).toBeTruthy();
    expect(screen.getByText(/1\.03 g\/ml/)).toBeTruthy();
  });

  it('is unaffected in Whole batch scope, which always shows a finished volume', () => {
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
    expect(screen.getByText(/1\.03 g\/ml/)).toBeTruthy();
  });
});

describe('Whole batch and Custom amount pour one figure for the same undivided batch', () => {
  // Same split-liquid fixture the ratio/sheet pin uses: 1,200 g anhydrous, 850 g cook water,
  // 450 g of the liquid's solids → a 2,500 g pot, a 7,500 g solution at 16%. Round 1's fix
  // corrected the batch row and the printed sheet but not the portion, which kept sizing off
  // core's water-only predictedPasteGrams — so the two scopes disagreed by exactly the solids,
  // one radio apart on the same panel, with no measurement anywhere in play.
  const SPLIT = {
    dilution: {
      anhydrousGrams: 1200, solutionGrams: 7500, totalWaterGrams: 6300,
      dilutionWaterGrams: 5450, glycerinGrams: 110, soapConcentrationPercent: 16,
      targetExceedsPaste: false,
    },
    soapConcentrationPercent: '16',
    cookWaterGrams: 850,
    wholeBatchPasteGrams: 2500,
  };
  // The whole batch, asked for by volume: 7,500 g ÷ 1.03 g/ml ≈ 7,281.55 ml. This used to
  // be String(7500 / 1.03) so the fraction landed on 1 with nothing clamped — but that
  // string carries thirteen decimal digits, which the swallowed-comma fingerprint on the
  // amount field now refuses (correctly: it is not an ask anyone can type). Ask for the
  // next whole millilitre instead and let the clamp land the fraction on 1 — the portion
  // is still the whole undivided batch, which is the state this pin compares.
  const FULL_VOLUME_ML = '7282';

  it('asks the same water of both scopes', () => {
    render(<DilutionPanel {...BASE} {...SPLIT} dilutionScope="batch" targetMl="" />);
    const batchFigure = screen.getByText('Dilution water to add').nextElementSibling!.textContent;
    // Absolute as well as relative: an equality alone would pass if both regressed together.
    expect(batchFigure).toBe('5,000 g');
    cleanup();

    render(<DilutionPanel {...BASE} {...SPLIT} dilutionScope="portion" targetMl={FULL_VOLUME_ML} />);
    // The portion really is the whole batch — otherwise the two figures are answers to
    // different questions and the equality below would prove nothing.
    expect(screen.getByText('Portion').nextElementSibling!.textContent).toBe('100% of the batch');
    expect(screen.getByText('Water to add').nextElementSibling!.textContent).toBe(batchFigure);
    expect(screen.getByText('Paste to weigh out').nextElementSibling!.textContent).toBe('2,500 g');
  });

  it('leaves a recipe with no corrected basis exactly as it was', () => {
    const props = { ...SPLIT, wholeBatchPasteGrams: undefined };
    render(<DilutionPanel {...BASE} {...props} dilutionScope="batch" targetMl="" />);
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('5,450 g');
    cleanup();
    render(<DilutionPanel {...BASE} {...props} dilutionScope="portion" targetMl={FULL_VOLUME_ML} />);
    expect(screen.getByText('Water to add').nextElementSibling!.textContent).toBe('5,450 g');
  });
});

describe('never prints an over-dilution verdict and a hedge that contradicts it on one screen', () => {
  // 1,215 g anhydrous at a 50% target → a 2,431 g solution against 1,785 g of cook water
  // (885 g lye water + a 900 g alternative liquid whose water content is UNDECLARED, so it
  // counts as all water). targetExceedsPaste is set and dilutionWaterGrams clamps to 0.
  //
  // The whole batch's paste is 3,000 g, and that figure is the same whatever the liquid
  // turns out to contain: an undeclared 900 g counts as 900 g of water and 0 g of solids,
  // a 900 g declared at 50% counts as 450 g of each — 1,215 + 1,785 + 0 and
  // 1,215 + 1,335 + 450 are both 3,000 (solids = total − water, so the split cancels).
  const OVER_DILUTED = {
    anhydrousGrams: 1215, solutionGrams: 2431, totalWaterGrams: 1215,
    dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 50,
    targetExceedsPaste: true,
  };
  const UNDECLARED = {
    dilution: OVER_DILUTED,
    altLiquidWaterGrams: 900,
    unknownLiquidGrams: 900,
    overDilutionCertain: false,
    wholeBatchPasteGrams: 3000,
    // 885 g of lye water + the undeclared liquid's 900 g, counted as all water. It travels
    // with wholeBatchPasteGrams because the panel identifies the liquid's non-water SOLIDS
    // as the difference between them — the head-start paragraph has always been derived that
    // way, and the floor under a measured paste is now too. Omitted, the pair says the pot is
    // 3,000 g of which none is water, i.e. 1,785 g of solids, which is not this recipe: the
    // comment above turns on the split cancelling to 0 g of solids either way.
    cookWaterGrams: 1785,
  };

  it('hedges instead of asserting, with no measurement to go on', () => {
    // Custom amount scope used to assert "the paste is already more dilute than the target"
    // two paragraphs above this shell's own "can't tell whether 50% is reachable" — same
    // panel, same state, opposite verdicts. The hedge is now PortionDilutionResults' own
    // (the shell's was a verbatim duplicate of it here — see the "printed once per screen"
    // describe), so the assertion reads the hedge's substance rather than the shell's
    // wording.
    render(<DilutionPanel {...BASE} {...UNDECLARED} dilutionScope="portion" targetMl="1000" />);
    const hedge = screen.getByText(/no declared water content/i);
    expect(hedge.textContent).toMatch(/unknown/i);
    expect(screen.queryByText(/already more dilute/i)).toBeNull();
  });

  it('drops the hedge for a valid whole-batch reading too — the measurement settles it', () => {
    // Nothing is suppressing the portion here: 1,300 g declared as ALL of it is a valid
    // whole-batch paste (above the 1,215 g anhydrous floor, below the 2,431 g solution),
    // so the batch row prints 2,431 − 1,300 = 1,131 g of water still to add. The hedge
    // asking whether 50% is reachable was printing three paragraphs under a figure that
    // reaches it. The over-dilution alert directly above was already gated this way.
    render(
      <DilutionPanel
        {...BASE}
        {...UNDECLARED}
        measuredPasteGrams="1300"
        dilutionScope="batch"
        targetMl=""
      />,
    );
    expect(screen.getByText(/uses your measured paste/i)).toBeTruthy();
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('1,131 g');
    expect(screen.queryByText(/no declared water content/i)).toBeNull();
  });
});

describe("the plan row offers the reference's own starting ratios", () => {
  // RESULT's paste is 1,200 anhydrous + 400 cook water = 1,600 g, so 2:1 is 3,200 g of
  // water, a 4,800 g solution and 1,200/4,800 = 25% soap.
  const PRESET_BASE = {
    ...BASE,
    dilutionScope: 'batch' as const,
    targetMl: '',
    cookWaterGrams: 400,
    onGradualWaterChange: () => {},
  };
  const PRESETS = ['1:1', '2:1', '2.5:1', '3:1'];

  it('offers the four printed ratios without taking away the typed target', () => {
    render(<DilutionPanel {...PRESET_BASE} />);
    // Prefix-matched: each button's accessible name now continues into the uses its ratio
    // lands in, which is what the correlation is for and what a screen reader should hear.
    for (const name of PRESETS)
      expect(
        screen.getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')}\\b`) }),
      ).toBeTruthy();
    // A maker who has recorded what their own recipe took must still be able to type it.
    expect(screen.getByLabelText('Target soap concentration percent')).toBeTruthy();
  });

  it('marks none of them as the current state, whatever the plan says', () => {
    // REPLACES 'checks the preset the current ratio equals, and none of them when it is
    // custom'. A radio group claims one of its options describes the current state; these are
    // buttons and claim nothing (spec §2). A stale plan value left behind by the deleted
    // write-back — 33.85 is the shape gradual mode used to write — displays as-is with no
    // preset highlighted, which is the expected reading of it, not a bug.
    render(<DilutionPanel {...PRESET_BASE} soapConcentrationPercent="33.85" />);
    expect(screen.queryAllByRole('radio', { name: /:1$/ })).toHaveLength(0);
    expect(screen.getByRole('group', { name: /starting points/i })).toBeTruthy();
    expect((screen.getByLabelText('Target soap concentration percent') as HTMLInputElement).value)
      .toBe('33.85');
  });

  it('applies on a click, every time, including the one that lands on the current plan', () => {
    // RETIRED-AND-KEPT, four ways over. While these were RADIOS the panel needed three
    // handlers on each input to be operable at all, because re-asserting an already-checked
    // radio fires no `change` event: the obvious move — clicking the highlighted 2:1 beside
    // "Not applied yet" — was inert by mouse until an onClick was added and by keyboard until
    // a Space-gated onKeyUp was. Those four cases ('applies the preset that is ALREADY
    // checked', 'applies it through a click on the label too', 'applies the already-checked
    // preset from the KEYBOARD', 'picking a preset sets the ratio and counts as a real edit')
    // are one case now: a button fires click for mouse, Space and Enter alike, and there is
    // no checkedness for a second press to fail to move.
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        {...PRESET_BASE}
        soapConcentrationPercent="25"
        onSoapConcentrationChange={onSoapConcentrationChange}
      />,
    );
    const preset = screen.getByRole('button', { name: /^2:1\b/ });
    // The plan ALREADY reads 25%, which is exactly what 2:1 lands at — the state the radio
    // could not be re-activated in. It still applies.
    fireEvent.click(preset);
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
    // And again, twice more, because a control that works once is not the claim.
    fireEvent.click(preset);
    fireEvent.click(preset);
    expect(onSoapConcentrationChange).toHaveBeenCalledTimes(3);
  });

  it('applies nothing merely because a key came up over it', () => {
    // The other half of the retired Space handler, and the claim that outlived it: arriving
    // at a control is not operating it. Focus arrives by Tab and the Tab KEYUP lands on the
    // newly focused element — an ungated keyup writes a plan the maker never picked, which is
    // the "entering ratio mode rewrites your typed target" bug in a new costume. A button
    // cannot be activated by arriving at it, and this pins that no handler has been added
    // that would change it.
    const onSoapConcentrationChange = vi.fn();
    render(<DilutionPanel {...PRESET_BASE} onSoapConcentrationChange={onSoapConcentrationChange} />);
    const preset = screen.getByRole('button', { name: /^2:1\b/ });
    preset.focus();
    for (const key of ['Tab', 'ArrowDown', 'Enter', ' ', 'a']) {
      fireEvent.keyDown(preset, { key });
      fireEvent.keyUp(preset, { key });
    }
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });

  it('says what the click did, and retires the caption when the plan moves off it', () => {
    // The caption pattern §2 names ("2:1 → 28.6%"), and its own retirement: it compares what
    // the preset wrote against what is on the field NOW, so typing over the figure drops it
    // on the next render. No effect, no reset, no second write.
    const { rerender } = render(<DilutionPanel {...PRESET_BASE} soapConcentrationPercent="25" />);
    fireEvent.click(screen.getByRole('button', { name: /^2:1\b/ }));
    expect(screen.getByText('2:1 → 25%')).toBeTruthy();
    rerender(<DilutionPanel {...PRESET_BASE} soapConcentrationPercent="40" />);
    expect(screen.queryByText(/→/)).toBeNull();
  });

  /** The one paragraph of ratio guidance, however it is worded. Selected STRUCTURALLY — the
   *  first paragraph of the collapsed dilution-notes <details>, which the guidance leads —
   *  rather than by any phrase in it, so every assertion below is about the claims and none
   *  is propped up by the wording it inspects.
   *  It used to be the hint immediately after the presets group; the prose budget moved it
   *  into the collapsed notes (always-true reference does not count against a state's two
   *  inline hint paragraphs), claims and wording intact. It used to carry a ratio-MODE gate
   *  as well; the presets it accounts for are part of the plan row in every state now, so it
   *  renders in every state too. */
  const ratioGuidance = () => {
    const notes = document.querySelector('details.dilution-notes');
    expect(notes).toBeTruthy();
    const paragraph = notes!.querySelector('p');
    expect(paragraph).toBeTruthy();
    return paragraph?.textContent ?? '';
  };

  /** The minimum-dilution paragraph, which renders in every state and both scopes. */
  const minimumDilutionCopy = () =>
    screen.getByText(/minimum dilution is a property of the recipe/i).textContent ?? '';

  it('attributes the starting ratios rather than calling them common or universal', () => {
    render(<DilutionPanel {...PRESET_BASE} />);
    const text = ratioGuidance();
    // LS:1534 attributes them — SOME makers start at 1:1, OTHERS at 2:1 or 3:1 — and the
    // reference's own beginner CPLS table does not offer 1:1 at all (lowest row 2:1,
    // LS:2172). "1:1 is where you start" stated it as everyone's starting point.
    expect(text).toMatch(/some makers/i);
    expect(text).toMatch(/others/i);
    expect(text).toMatch(/1:1/);
    expect(text).toMatch(/2:1 or 3:1/);
    // "The most common ratios are 1:1, 2:1, 3:1" is said of water:LYE (LS:1500) — the same
    // numerals for a different quantity at a different stage. Nothing calls a water:PASTE
    // ratio common, so this panel must not, in the prose or in the group name.
    expect(text).not.toMatch(/common/i);
    expect(screen.getByRole('group', { name: /starting points/i })).toBeTruthy();
    expect(screen.queryByText(/common starting points/i)).toBeNull();
  });

  it('explains the presets even before a recipe exists', () => {
    // The presets are on screen (disabled, with nothing to multiply) before any oils are
    // entered, so the guidance accounting for them has to be reachable in that state too — a
    // round that moved it into the collapsed notes left the notes inside the dilution ?
    // branch and the presets stood entirely unexplained. The notes <details> is hoisted out
    // of the branch; every note in it carries its own gate.
    render(<DilutionPanel {...PRESET_BASE} dilution={null} />);
    expect(screen.getByRole('group', { name: /starting points/i })).toBeTruthy();
    expect(ratioGuidance()).toMatch(/some makers start at 1:1/i);
    // The panel is still in its waiting state — hoisting the notes must not conjure figures
    // or feedback out of a recipe that does not exist. One ask, naming the one control.
    expect(screen.getByText(/Enter oils/).textContent).toMatch(
      /Enter oils and a target concentration \(1–99%\) to compute dilution\./,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('drives the water requirement off the recipe minimum, not off a dissolving mechanism', () => {
    render(<DilutionPanel {...PRESET_BASE} />);
    const text = ratioGuidance();
    // The reference's model is a per-recipe MINIMUM dilution (LS:1524 — under it the
    // solution is supersaturated and paste is left over; LS:1603 — every recipe has its
    // own). LS:1534 gives no mechanism at all for needing more water.
    expect(text).toMatch(/minimum/i);
    expect(text).toMatch(/undissolved/i);
    // "expect to add more as the paste dissolves" was invented AND backwards: too little
    // water is what prevents dissolution. The absorb-and-swell picture is Gradual
    // Dilution's (LS:1531), and the LS:1531 paragraph further down owns it.
    expect(text).not.toMatch(/as the paste dissolv/i);
    expect(text).not.toMatch(/absorb/i);
    expect(text).not.toMatch(/swell/i);
  });

  it('treats the minimum as a floor to clear and never as the destination', () => {
    render(<DilutionPanel {...PRESET_BASE} />);
    const text = ratioGuidance();
    // The supported claim is a BOUND ON HOW LITTLE water: LS:1524 (below the minimum the
    // solution is supersaturated with paste left over) and LS:1605 (once it is met the soap
    // is fully dissolved). Everything above the floor is the PRODUCT's call, and the
    // reference is emphatic — LS:1605 hands the decision over explicitly ("you can then
    // decide… depending on what the product will be used for"), LS:3585 calls diluting to
    // the minimum for thickness a "preconceived (and incorrect) notion", and LS:1690 asks
    // whether the commercial soaps use the absolute minimum and answers NO WAY.
    expect(text).toMatch(/how little water/i);
    expect(text).not.toMatch(/where you land/i);
    expect(text).not.toMatch(/minimum[^.]*\b(target|destination|lands?|end up|stop)\b/i);
    expect(text).not.toMatch(/\b(land|end up|stop|finish)\w*\b[^.]*\bminimum\b/i);
    // And the panel must stay coherent with itself.
    expect(minimumDilutionCopy()).toMatch(/property of the recipe, not the product/i);
    expect(screen.getByText(/this suits|see the usual targets/i)).toBeTruthy();
  });

  it('accounts for the fourth preset by where it comes from, not by demoting it', () => {
    render(<DilutionPanel {...PRESET_BASE} />);
    const text = ratioGuidance();
    // 2.5:1 is on screen as a button and appears exactly once in the reference (LS:2172).
    // That once is a "Dilution Preference" table for the beginner recipe LS:2192 names as
    // the Beginner Castile, where it is the MORE DILUTE of the two ratios offered and lands
    // 21.3% soap (paste 19.31 oz anhydrous + 6.62 oz lye water = 25.93; 2.5 x 25.93 = 64.83
    // oz water, the table's own figure; 19.31 / 90.75) — inside the 20-30% band LS:2181
    // gives castile. So it is a castile-calibrated choice, and "a step between those two
    // rather than a starting point of its own" asserted the opposite of its only source.
    expect(screen.getByRole('button', { name: /^2\.5:1\b/ })).toBeTruthy();
    expect(text).toMatch(/2\.5:1/);
    expect(text).toMatch(/castile/i);
    expect(text).toMatch(/two ratio rows/i);
    expect(text).not.toMatch(/step between/i);
    expect(text).not.toMatch(/rather than a starting point/i);
    // No figure: the preset's own caption prints what 2.5:1 lands at for the CURRENT recipe.
    expect(text).not.toMatch(/21|%/);
  });

  it('gives the oils-to-minimum claim a single owner on screen', () => {
    // Both paragraphs used to say which oils need more water. The minimum-dilution paragraph
    // carries the actual figures (LS:1603 coconut ~40% / castile ~25%, LS:1605 most blends
    // 25-35%), so it owns the claim and the ratio guidance drops it.
    render(<DilutionPanel {...PRESET_BASE} />);
    const namingCoconut = screen.getAllByText(/coconut/i).filter((el) => el.tagName === 'P');
    expect(namingCoconut).toHaveLength(1);
    expect(namingCoconut[0].textContent).toMatch(/minimum dilution is a property/i);
    expect(ratioGuidance()).not.toMatch(/coconut/i);
    expect(minimumDilutionCopy()).toMatch(/coconut-heavy soaps/i);
  });

  it('says the below-minimum failure is undissolved soap, never thickening or setting', () => {
    render(<DilutionPanel {...PRESET_BASE} />);
    const text = minimumDilutionCopy();
    // The reference states the failure four times and it is the same state each time —
    // supersaturation with soap left over (LS:1519, LS:1524, LS:1610, LS:2181). "Past that
    // the soap thickens or sets" claimed a viscosity consequence instead: "thickens" is
    // contradicted outright for the case the sentence led with (LS:1657 — coconut-heavy
    // soaps are thin as milk or juice even AT the minimum), and "sets" is the book's word
    // for cold dilution water (LS:2277, LS:2370) or NaOH (LS:2679).
    expect(text).toMatch(/undissolved/i);
    expect(text).toMatch(/lumps/i);
    expect(text).toMatch(/layer/i);
    expect(text).not.toMatch(/thickens|\bsets?\b|solidif|congeal|harden|\bgels?\b/i);
    expect(ratioGuidance()).toMatch(/undissolved/i);
  });

  it('states the unsaturated rule where it states the castor exception', () => {
    render(<DilutionPanel {...PRESET_BASE} />);
    const text = minimumDilutionCopy();
    // Ricinoleic acid is unsaturated yet increases solubility and dilutes rapidly (LS:848,
    // LS:915, LS:2382). An exception needs its rule, and it lives beside the castile figure.
    expect(text).toMatch(/castor/i);
    expect(text).toMatch(/unsaturated/i);
    expect(text).toMatch(/castile/i);
    expect(text).toMatch(/more soluble/i);
    expect(text).not.toMatch(/castor[^.]*\d+\s*%/i);
    expect(text).not.toMatch(/high-unsaturated/i);
    expect(ratioGuidance()).not.toMatch(/high-unsaturated/i);
  });

  it('carries the weigh-your-paste caveat as reference, with both halves of the shortcut', () => {
    // RETIRED-AND-KEPT: 'carries the weigh-your-paste caveat in ratio mode and nowhere else'.
    // The reference attaches the estimate warning to its ratio rows (LS:2172, repeated at
    // LS:2294) and LS:1534 makes weighing the paste a precondition of the method — but it is
    // true of EVERY plan figure on this panel, not of a mode, and with the mode gone it is
    // always-true reference. It lives in the collapsed notes, which is where the prose budget
    // sends reference: state feedback stays inline, and the discharge below is the inline
    // half.
    render(<DilutionPanel {...PRESET_BASE} />);
    const caveat = screen.getByText(/only as exact as the paste it counts from/i);
    expect(caveat.closest('details')).toBeTruthy();
    // What goes on the scale is the PASTE. Both routes the reference gives yield paste and
    // never pot + paste: a tared scale (LS:1534), or the crockpot shortcut, which SUBTRACTS
    // the empty pot (LS:1538). "Weigh the pot and enter it as Measured paste weight below"
    // was that shortcut with its subtraction deleted — a maker following it literally enters
    // a figure carrying 2-4 kg of empty crockpot. Both halves are pinned: name the paste,
    // and if the pot is mentioned at all, name the subtraction with it.
    expect(caveat.textContent).toMatch(/enter it\s+as Measured paste weight above/i);
    expect(caveat.textContent).toMatch(/subtract the empty pot/i);
    expect(caveat.textContent).not.toMatch(/weigh the (crock)?pot and enter/i);
  });

  it('says the caveat is met, inline, once a reading is accepted', () => {
    // The DISCHARGE, which is the state-specific half and stays inline: 1,480 g clears the
    // 1,200 g anhydrous floor and sits under the 4,000 g solution, so the pour really is
    // taken against a weighed paste and the panel says so beside the row it corrected.
    render(<DilutionPanel {...PRESET_BASE} measuredPasteGrams="1480" />);
    const discharge = screen.getByText(/uses your measured paste \(1,480 g\)/i);
    expect(discharge.closest('details')).toBeNull();
    // Exactly one inline paragraph says it — the pair that used to stack here both quoted the
    // same 1,480 g and both gave the cook-evaporation reason.
    expect(screen.getAllByText(/measured paste \(1,480 g\)/i)).toHaveLength(1);
  });

  it('never puts a weighing instruction inline beside a reading the maker just took', () => {
    // RETIRED-AND-KEPT: 'keeps the estimate but drops the instruction when a reading is on
    // screen unused'. 900 g is below the 1,200 g anhydrous floor, so it is REFUSED and the
    // figures really do run on the computed paste — the estimate still holds. What must not
    // happen is an inline paragraph telling a maker who has just been to the scale to go to
    // the scale. The instruction is collapsed reference now, which satisfies that
    // structurally rather than by a gate: nothing inline carries it in any state.
    for (const reading of ['', '900', '1480', '4500', '-500']) {
      render(<DilutionPanel {...PRESET_BASE} measuredPasteGrams={reading} />);
      const inlineText = Array.from(document.querySelectorAll('p.results-hint'))
        .filter((el) => el.closest('details') === null)
        .map((el) => el.textContent ?? '')
        .join(' ');
      expect(inlineText, `reading=${reading}`).not.toMatch(/weigh the (paste|pot|crockpot)/i);
      expect(inlineText, `reading=${reading}`).not.toMatch(/enter it as measured paste weight/i);
      cleanup();
    }
  });
});

describe('the prose budget: at most two inline hint paragraphs in any one state', () => {
  // The panel's guidance grew one review round at a time, each paragraph individually
  // justified — and busy states stacked four to nine of them at once. The budget: figures,
  // the alert machinery (untouched, its own rule), and AT MOST TWO prose hint paragraphs
  // outside <details>. Reference prose that is always true lives in the collapsed notes
  // instead, where it does not count against the state.
  //
  // Counted structurally: every <p class="results-hint"> that is not role="alert" and not
  // inside a <details>. The states below are the documented busiest ones — split-liquid +
  // measured + ratio mode (both scopes), an undeclared liquid past the target (both
  // scopes), the glycerin corrected-pot clamp — plus the undeclared-past-target case in
  // ratio mode, which layers the ratio readout on top.
  const inlineProse = () =>
    Array.from(document.querySelectorAll('p.results-hint')).filter(
      (p) => p.getAttribute('role') !== 'alert' && p.closest('details') === null,
    );

  // The split-liquid fixture the scope-parity describe uses (16% target, 850 g cook water,
  // a 2,500 g corrected pot → 450 g of solids), with the liquid's water declared and a
  // valid 2,300 g reading — clears the 1,650 g floor, sits under the 7,500 g solution.
  const SPLIT_MEASURED = {
    ...BASE,
    dilution: {
      anhydrousGrams: 1200, solutionGrams: 7500, totalWaterGrams: 6300,
      dilutionWaterGrams: 5450, glycerinGrams: 110, soapConcentrationPercent: 16,
      targetExceedsPaste: false,
    },
    soapConcentrationPercent: '16',
    cookWaterGrams: 850,
    wholeBatchPasteGrams: 2500,
    altLiquidWaterGrams: 400,
    measuredPasteGrams: '2300',
  };
  // The undeclared-liquid-past-the-target fixture from the contradiction describe above.
  const OVER_UNDECLARED = {
    ...BASE,
    dilution: {
      anhydrousGrams: 1215, solutionGrams: 2431, totalWaterGrams: 1215,
      dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 50,
      targetExceedsPaste: true,
    },
    soapConcentrationPercent: '50',
    altLiquidWaterGrams: 900,
    unknownLiquidGrams: 900,
    overDilutionCertain: false,
    wholeBatchPasteGrams: 3000,
    cookWaterGrams: 1785,
  };
  // The corrected-pot clamp: a 2,000 g pot (400 g of it a zero-water liquid's solids)
  // against the 1,900 g solution its own soap makes — the batch row prints 0 g and the
  // pasteAlreadyPastTarget alert accounts for it.
  const GLYCERIN_CLAMP = {
    ...BASE,
    dilution: {
      anhydrousGrams: 1200, solutionGrams: 1900, totalWaterGrams: 700,
      dilutionWaterGrams: 300, glycerinGrams: 100, soapConcentrationPercent: 63.2,
      targetExceedsPaste: false,
    },
    soapConcentrationPercent: '63.2',
    cookWaterGrams: 400,
    wholeBatchPasteGrams: 2000,
    altLiquidWaterGrams: 0,
  };

  // The RECORD's own states, which are the busiest this panel has: the record's readout, the
  // portion's alternative-liquid note, and — since spec §2 keeps the plan's rows on screen
  // rather than suppressing them — a plan-labelled caption whenever the plan is unreachable.
  // That caption is deliberately not a .results-hint (it is a note on the row above it), and
  // this budget is the reason: a third inline paragraph in the commonest record state is
  // exactly what the budget exists to refuse.
  const RECORD_ON = {
    onGradualWaterChange: () => {},
    onPortionPasteChange: () => {},
    onPortionWaterChange: () => {},
  };

  const CASES: [string, ComponentProps<typeof DilutionPanel>][] = [
    ['record + split liquid, Whole batch', { ...SPLIT_MEASURED, ...RECORD_ON, dilutionScope: 'batch', targetMl: '', gradualWaterGrams: '2000' }],
    ['record + split liquid, Custom amount (jar governs)', { ...SPLIT_MEASURED, ...RECORD_ON, dilutionScope: 'portion', targetMl: '1000', portionPasteGrams: '400', portionWaterGrams: '900' }],
    ['record + split liquid, record far from the plan', { ...SPLIT_MEASURED, ...RECORD_ON, dilutionScope: 'batch', targetMl: '', gradualWaterGrams: '5000', soapConcentrationPercent: '16' }],
    ['nothing recorded yet, Whole batch', { ...SPLIT_MEASURED, ...RECORD_ON, dilutionScope: 'batch', targetMl: '', gradualWaterGrams: '' }],
    ['nothing recorded yet, Custom amount', { ...SPLIT_MEASURED, ...RECORD_ON, dilutionScope: 'portion', targetMl: '', portionPasteGrams: '', portionWaterGrams: '' }],
    ['split liquid + measured paste, Whole batch', { ...SPLIT_MEASURED, dilutionScope: 'batch', targetMl: '' }],
    ['split liquid + measured paste, Custom amount', { ...SPLIT_MEASURED, dilutionScope: 'portion', targetMl: '1000' }],
    ['undeclared liquid past the target, Whole batch', { ...OVER_UNDECLARED, dilutionScope: 'batch', targetMl: '' }],
    ['undeclared liquid past the target, Custom amount', { ...OVER_UNDECLARED, dilutionScope: 'portion', targetMl: '1000' }],
    ['undeclared liquid past the target + a record, Whole batch', { ...OVER_UNDECLARED, ...RECORD_ON, gradualWaterGrams: '0', cookWaterGrams: 1785, dilutionScope: 'batch', targetMl: '' }],
    ['undeclared liquid past the target + a jar record, Custom amount', { ...OVER_UNDECLARED, ...RECORD_ON, portionPasteGrams: '400', portionWaterGrams: '900', cookWaterGrams: 1785, dilutionScope: 'portion', targetMl: '1000' }],
    ['glycerin corrected-pot clamp, Whole batch', { ...GLYCERIN_CLAMP, dilutionScope: 'batch', targetMl: '' }],
    ['glycerin corrected-pot clamp + a record, Whole batch', { ...GLYCERIN_CLAMP, ...RECORD_ON, gradualWaterGrams: '0', dilutionScope: 'batch', targetMl: '' }],
    ['glycerin corrected-pot clamp, Custom amount', { ...GLYCERIN_CLAMP, dilutionScope: 'portion', targetMl: '1000' }],
  ];

  for (const [name, props] of CASES) {
    it(`${name}: at most two inline hint paragraphs`, () => {
      render(<DilutionPanel {...props} />);
      const prose = inlineProse().map((p) => (p.textContent ?? '').replace(/\s+/g, ' ').trim());
      expect(prose.length, `inline prose:\n- ${prose.join('\n- ')}`).toBeLessThanOrEqual(2);
    });
  }
});

describe('an amount asked to the hundredth of a millilitre is a swallowed comma', () => {
  // The same trap the measured-paste field already guards: browsers read a comma typed
  // into <input type="number"> as a decimal point, so 1,200 ml commits as 1.200 — a silent
  // 1000× shrink. The fingerprint is the same one (two or more typed decimal digits,
  // judged on the raw string — lib/measuredPaste's subTenthPrecisionFingerprint), the
  // refusal is the shell's (core rightly computes a 1.2 ml ask), and the alert renders
  // beside the field it describes, in Custom amount scope where that field lives.
  it('refuses the amount, quotes the typed string in ml, and names the swallowed separator', () => {
    render(<DilutionPanel {...BASE} dilutionScope="portion" targetMl="1.200" />);
    const alert = screen.getByRole('alert').textContent!.replace(/\s+/g, ' ');
    // The RAW string with " ml" appended — a formatter would round the very decimals this
    // alert exists to show. ml, not grams: it is the number typed into an ml field.
    expect(alert).toContain('1.200 ml');
    expect(alert).not.toContain('1.200 g');
    expect(alert).toMatch(/comma as a decimal point/i);
    expect(alert).toMatch(/a thousand times too small/i);
    expect(alert).toMatch(/plain digits, without separators/i);
    // The refusal is the single message: no portion figures computed from 1.2 ml…
    expect(screen.queryByText('Paste to weigh out')).toBeNull();
    expect(screen.queryByText('Water to add')).toBeNull();
    // …and no density caveat, which must not explain a millilitre figure that is not on
    // screen (same gate an invalid amount already takes).
    expect(screen.queryByText(/1\.03 g\/ml/)).toBeNull();
  });

  it('a one-decimal amount is odd but honest and still computes — only two or more refuse', () => {
    render(<DilutionPanel {...BASE} dilutionScope="portion" targetMl="1200.5" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Paste to weigh out')).toBeTruthy();
    cleanup();
    render(<DilutionPanel {...BASE} dilutionScope="portion" targetMl="1200" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Paste to weigh out')).toBeTruthy();
  });

  it('does not render in Whole batch scope, where the field itself is hidden', () => {
    // The stale targetMl state persists across the scope toggle, but an alert about a
    // field that is not on screen explains nothing — same rule as every other portion
    // surface. The batch figures are untouched by the poisoned amount.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="1.200" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toBe('2,400 g');
  });

  it('each poisoned field gets its own alert — grams for the paste, ml for the amount', () => {
    // Two independent inputs, two independent swallowed commas: the paste alert quotes its
    // field's grams, the amount alert its field's ml, and neither speaks for the other.
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="portion"
        targetMl="1.200"
        measuredPasteGrams="1480.25"
      />,
    );
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent!.replace(/\s+/g, ' '));
    expect(alerts).toHaveLength(2);
    expect(alerts.some((a) => a.includes('1480.25 g'))).toBe(true);
    expect(alerts.some((a) => a.includes('1.200 ml'))).toBe(true);
  });
});

describe('gradual dilution — recording the water actually poured', () => {
  // paste 1,600 g (anhydrous 1,200 + cook 400). Pour 2,000 g → finished 3,600 g,
  // concentration 1200/3600 = 33.3333% → written at 2 dp as 33.33.
  const GRADUAL = {
    ...BASE,
    cookWaterGrams: 400,
    wholeBatchPasteGrams: 1600,
    onGradualWaterChange: () => {},
  };

  it('offers the record beside the plan, not instead of it', () => {
    // RETIRED-AND-KEPT: 'offers Gradual as a third mode beside the two precise ones'. There
    // is no third mode, because there are no modes — the plan's field and the record's field
    // are both on the whole-batch screen at once, which is the whole of what this task did to
    // the surface (spec §2). The mode radio is gone with them.
    render(<DilutionPanel {...GRADUAL} />);
    expect(screen.getByLabelText('Target soap concentration percent')).toBeTruthy();
    expect(screen.getByLabelText('Water added so far (g)')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: /Dilution input mode/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /Gradual/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Water : paste ratio' })).toBeNull();
  });

  it('shows the water, the finished mass and where it lands', () => {
    render(<DilutionPanel {...GRADUAL} gradualWaterGrams="2000" />);
    expect(screen.getByText(/Finished so far/)).toBeTruthy();
    expect(screen.getByText('3,600 g')).toBeTruthy();
    // The readout's wording is the record arm's now: it describes the batch rather than
    // saying where a figure "lands", which was a mode's way of speaking about its own output.
    expect(screen.getByText(/The batch so far is at 33\.33% soap/)).toBeTruthy();
  });

  it('the finished figure is paste + water, NOT the recomputed solution', () => {
    // The whole point: 4,000 g is what the old target predicted; 3,600 g is what was
    // poured. Printing solutionGrams here would quietly show the prediction again.
    render(<DilutionPanel {...GRADUAL} gradualWaterGrams="2000" />);
    // Read the row's own value cell. An earlier version asserted
    // `queryByText(/Finished so far[\s\S]*4,000 g/)` was null, which could never fail:
    // queryByText matches ONE element's text, and the label is a <dt> while the figure is
    // its <dd>, so nothing can match both. The regression it named — printing
    // solutionGrams as the finished mass — would have passed unnoticed, in the test that
    // carries this feature's central claim.
    const finishedRow = screen.getByText(/Finished so far/).closest('div')!;
    expect(finishedRow.textContent).toContain('3,600 g');
    expect(finishedRow.textContent).not.toContain('4,000 g');
  });

  it('writes NOTHING, at any record, and keeps the readout honest at 2 dp', () => {
    // RETIRED-AND-KEPT, five cases' worth. 'writes the derived concentration back at 2 dp
    // once the field is touched', 'writes nothing at all until the maker has typed a water
    // amount', 'an extreme record keeps the readout honest while capping what is written',
    // and the whole LoopHarness pair ('does not loop…', 'does not loop on a weighed pot and
    // a zero-water record', 'sweeps the zero-water window') existed for ONE mechanism: an
    // effect that wrote the derived percentage into settings.soapConcentrationPercent.
    //
    // The 2 dp claim survives, and moves from what was WRITTEN to what is DISPLAYED — the
    // readout is where that precision was always visible, and it is now the only place the
    // figure exists. The clamp and the cap-notice do not survive: both bounded a write, and
    // gradualDilutionFrom's own [1, 99] clamp only ever applied to `writeBackPercent`, which
    // nothing reads. The readout has always been unclamped and still is, which is what
    // "never lies about what the record implies" means.
    //
    // THE LOOP CANNOT EXIST. Its mechanism was: written percent → new dilution →
    // solutionGrams → the basis gate → a different percent. There is no first arrow any
    // more, and no effect in this file calls onSoapConcentrationChange at all. The sweep of
    // 445 whole-gram readings that pinned the fix is retired with the loop it swept for; the
    // property it established (the record's basis is a function of the reading alone) is
    // structural in weighedOrComputedPotGramsFor and pinned by 'which paste it counts from'
    // below.
    const onSoapConcentrationChange = vi.fn();
    const { rerender } = render(
      <DilutionPanel {...GRADUAL} gradualWaterGrams="" onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    fireEvent.change(screen.getByLabelText(/Water added so far/), { target: { value: '2000' } });
    rerender(
      <DilutionPanel {...GRADUAL} gradualWaterGrams="2000" onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
    // 1,600 + 2,000 = 3,600 g; 1,200 / 3,600 = 33.3333%, displayed at 2 dp.
    expect(screen.getByText(/The batch so far is at 33\.33% soap/)).toBeTruthy();
    // The plan is exactly where the maker left it.
    expect((screen.getByLabelText('Target soap concentration percent') as HTMLInputElement).value)
      .toBe('30');
  });

  it('an extreme record is reported unclamped, because nothing is written from it', () => {
    // 1,200 g of soap in a 1,210 g pot with no water is 99.17% — past the [1, 99] the old
    // write-back had to clamp into, and the readout said so even then. With no write there
    // is nothing to clamp and nothing to warn about being capped: the figure is the figure.
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        {...GRADUAL}
        wholeBatchPasteGrams={1210}
        gradualWaterGrams="0"
        onSoapConcentrationChange={onSoapConcentrationChange}
      />,
    );
    expect(screen.getByText(/The batch so far is at 99\.17% soap/)).toBeTruthy();
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
    expect(screen.queryByText(/capp?ed|clamped/i)).toBeNull();
  });

  it('shows nothing of the record while the field is empty', () => {
    render(<DilutionPanel {...GRADUAL} gradualWaterGrams="" />);
    expect(screen.queryByText(/Finished so far/)).toBeNull();
    expect(screen.queryByText(/The batch so far is at/)).toBeNull();
    // ...and the plan's own rows carry no plan label, because the plan is what governs.
    expect(screen.getByText('Dilution water to add')).toBeTruthy();
    expect(screen.getByText('Finished solution')).toBeTruthy();
  });

  it('never reports over-dilution from an honest record', () => {
    // The wording this asserts the ABSENCE of has to be a wording the panel can actually
    // produce, or the test passes on a typo. It is "The paste is already more dilute than
    // …", from the targetExceedsPaste alert and its corrected-pot sibling; the regex this
    // test used to carry (/exceeds the paste|more water than the paste/i) matched no string
    // in the component at all and could never have failed.
    render(<DilutionPanel {...GRADUAL} gradualWaterGrams="2000" />);
    expect(screen.queryByText(/already more dilute/i)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    // The positive control, so the absence above is evidence rather than a spelling: the
    // same panel, the same matcher, a recipe whose target really is past its paste.
    cleanup();
    render(
      <DilutionPanel
        {...BASE}
        dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }}
        soapConcentrationPercent="90"
      />,
    );
    expect(screen.getByText(/already more dilute/i)).toBeTruthy();
  });
});

describe('the plausibility note — a weighed pot twice the paste this recipe makes', () => {
  // Carried from PR #167 review triage (Dilution Phase 2b, task 4). The record arm is
  // deliberately target-independent (measuredPasteDescribesPotFor has no ceiling — see its
  // own doc for the render loop a ceiling here would reopen), so a maker who left the
  // crockpot on the scale, or read a kitchen scale in the wrong unit, gets no alert from the
  // pot's own rules (the reading parses, clears the solids floor, is not finer than a scale
  // reads) and no ceiling to catch it either. This is the target-FREE sanity note the triage
  // still allows: a non-alert hint, not a verdict.
  //
  // Fixture: anhydrous 1,000 g, cook water 300 g, no split liquid, so the recipe's own
  // computed pot (computedPotGramsFor) is exactly 1,300 g — the "paste this recipe makes".
  // 2,730 g is 2.1x that; 2,470 g is 1.9x. Neither figure coincides with anhydrous (1,000),
  // cook water (300), the computed pot (1,300) or the solution (4,000), so no assertion below
  // can pass by matching the wrong quantity.
  const RECORD_PLAUSIBILITY = {
    ...BASE,
    dilution: {
      anhydrousGrams: 1000, solutionGrams: 4000, totalWaterGrams: 3000,
      dilutionWaterGrams: 2700, glycerinGrams: 100, soapConcentrationPercent: 25,
      targetExceedsPaste: false,
    },
    soapConcentrationPercent: '25',
    cookWaterGrams: 300,
    wholeBatchPasteGrams: 1300,
    gradualWaterGrams: '0',
    onGradualWaterChange: () => {},
  };
  const HINT = /more than twice the paste this recipe makes/i;

  it('a reading more than twice the computed pot earns the hint', () => {
    render(<DilutionPanel {...RECORD_PLAUSIBILITY} measuredPasteGrams="2730" />);
    const hint = screen.getByText(HINT);
    expect(hint).toBeTruthy();
    // A QUESTION, not a verdict: never role="alert".
    expect(hint.closest('[role="alert"]')).toBeNull();
  });

  it('a reading under twice the computed pot earns nothing', () => {
    render(<DilutionPanel {...RECORD_PLAUSIBILITY} measuredPasteGrams="2470" />);
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it('a reading the belowSolids refusal already rejects earns no hint either', () => {
    // 900 g is under the 1,000 g anhydrous floor (no split liquid, so the floor is the
    // anhydrous soap alone) — a refused reading already has a voice, so the plausibility
    // note stands down. Render-keyed: the refusal alert is asserted present, not assumed.
    render(<DilutionPanel {...RECORD_PLAUSIBILITY} measuredPasteGrams="900" />);
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent ?? '');
    expect(alerts.some((a) => /cannot be all of the paste/i.test(a))).toBe(true);
    expect(screen.queryByText(HINT)).toBeNull();
  });
});

describe('a record beside a plan it does not match: both figures, both named', () => {
  // RETIRED WITH THE WRITE-BACK, REPLACED BY THE LABEL. This describe pinned the "Not applied
  // yet" clause: with the write-back waiting for a touch, a record could sit on screen beside
  // a plan it had not been written into, and the panel showed TWO masses for one batch with
  // nothing saying they answered different questions. Spec §4 deletes the clause outright —
  // "nothing to apply" — because §2 answers the same problem the other way: the plan's rows
  // stay on screen and take the word "plan", so three masses can share a screen because each
  // carries its name. The state the clause described is now the ORDINARY state, not a
  // transient one, which is exactly why a note about it would never stop being on screen.
  const SAVED_50 = {
    ...BASE,
    onGradualWaterChange: () => {},
    cookWaterGrams: 400,
    wholeBatchPasteGrams: 1600,
    soapConcentrationPercent: '50',
    dilution: {
      anhydrousGrams: 1200, solutionGrams: 2400, totalWaterGrams: 1200,
      dilutionWaterGrams: 800, glycerinGrams: 110, soapConcentrationPercent: 50,
      targetExceedsPaste: false,
    },
  };

  it('prints both masses, each under its own name, and says nothing about applying anything', () => {
    render(<DilutionPanel {...SAVED_50} gradualWaterGrams="2000" />);
    // The record: 1,600 g of paste and 2,000 g of water is 3,600 g at 33.33% soap.
    const finishedSoFar = screen.getByText(/Finished so far/).closest('div')!;
    expect(finishedSoFar.textContent).toContain('3,600 g');
    expect(screen.getByText(/The batch so far is at 33\.33% soap/)).toBeTruthy();
    // The plan: 2,400 g, still on screen, named as the plan's.
    const planSolution = screen.getByText('Finished solution (plan)').closest('div')!;
    expect(planSolution.textContent).toContain('2,400 g');
    expect(screen.getByText('Dilution water to add (plan)')).toBeTruthy();
    // No clause about a gap to close: there is nothing to apply, and no way to apply it.
    expect(screen.queryByText(/Not applied yet/i)).toBeNull();
  });

  it('the two masses are never both presented as THE batch', () => {
    // The claim the retired clause carried, and the one thing that must not regress: each
    // figure is answerable to a different question, and exactly one of them is the plan's.
    render(<DilutionPanel {...SAVED_50} gradualWaterGrams="2000" />);
    expect(screen.queryAllByText(/^Finished solution$/)).toHaveLength(0);
    expect(screen.queryAllByText(/^Finished solution \(plan\)$/)).toHaveLength(1);
    expect(screen.queryAllByText(/^Finished so far/)).toHaveLength(1);
  });

  it('drops the plan labels the moment the record is cleared', () => {
    // The control: with no record the plan governs and its rows are unqualified, because
    // there is nothing for them to be distinguished FROM.
    const { rerender } = render(<DilutionPanel {...SAVED_50} gradualWaterGrams="2000" />);
    expect(screen.getByText('Finished solution (plan)')).toBeTruthy();
    rerender(<DilutionPanel {...SAVED_50} gradualWaterGrams="" />);
    expect(screen.getByText('Finished solution')).toBeTruthy();
    expect(screen.queryByText('Finished solution (plan)')).toBeNull();
  });

  it('is a whole-batch matter only — a jar says its own thing, in its own words', () => {
    render(
      <DilutionPanel
        {...SAVED_50}
        dilutionScope="portion"
        onDilutionScopeChange={() => {}}
        onPortionPasteChange={() => {}}
        onPortionWaterChange={() => {}}
        portionPasteGrams="400"
        portionWaterGrams="900"
      />,
    );
    expect(screen.queryByText(/Not applied yet/i)).toBeNull();
    // Phase 2b: the echo drops the "unchanged" reassurance framing and names the plan as
    // the plan (spec §2) — there is nothing left to reassure about once neither record ever
    // writes back.
    expect(screen.getByText(/The plan is/)).toBeTruthy();
  });
});

describe('a record: copy that would name a target it is not aiming at', () => {
  const G = {
    ...BASE,
    cookWaterGrams: 400, wholeBatchPasteGrams: 1600, onGradualWaterChange: () => {},
  };
  // A state the retired write-back used to produce, and a recipe file can still carry: a
  // weighed 1,405 g pot beside a plan of 85.41%, whose solution is 1,404.99 g — a hair UNDER
  // the reading. The ceiling that trips is the one that used to reject the basis and loop the
  // app; what it now trips is the exceeds-solution refusal, which must not fire under a
  // record because the panel is counting from that very reading one row below.
  const ROUNDED = {
    ...G,
    soapConcentrationPercent: '85.41',
    dilution: {
      anhydrousGrams: 1200, solutionGrams: 1404.99, totalWaterGrams: 204.99,
      dilutionWaterGrams: 0, glycerinGrams: 110, soapConcentrationPercent: 85.41,
      targetExceedsPaste: true,
    },
    measuredPasteGrams: '1405',
    gradualWaterGrams: '0',
  };

  it('does not tell the maker to lower a target the record is not steering by', () => {
    render(<DilutionPanel {...ROUNDED} />);
    const alerts = screen.queryAllByRole('alert').map((a) => a.textContent!.replace(/\s+/g, ' '));
    expect(alerts.join(' | ')).not.toMatch(/lower the target concentration/i);
    // The field itself is on screen — it is the plan row, and the plan is still the maker's
    // to set. What must not happen is an ALERT prescribing a change to it on the record's
    // behalf. (This is the one claim the mode's version of this test got for free by hiding
    // the control; keeping the control means the gate has to do the work.)
    expect(screen.getByLabelText('Target soap concentration percent')).toBeTruthy();
  });

  it('does not refuse the very pot it is counting from', () => {
    // The contradiction this suppression removes: "your paste already weighs more than the
    // 1,404.99 g this target dilutes to" printed directly above the panel's own
    // "Finished so far (weighed) 1,405 g", for the same reading, on one screen.
    render(<DilutionPanel {...ROUNDED} />);
    // Scoped to the record's own row: the plan's "Finished solution (plan)" is 1,404.99 g,
    // which the gram formatter also prints as "1,405 g" — the two are a hair apart and both
    // on screen, which is precisely the state the plan LABEL exists to make readable.
    const row = screen.getByText(/Finished so far \(weighed\)/).closest('div')!;
    expect(row.textContent).toContain('1,405 g');
    expect(screen.queryByText(/already weighs more than/i)).toBeNull();
  });

  it('still refuses a reading on the rules that describe the pot, under a record too', () => {
    // The suppression is narrow: the target-free rules still fire, still alert, and still
    // decide the basis — so the alerts and the figures answer to one question.
    render(<DilutionPanel {...G} gradualWaterGrams="2000" measuredPasteGrams="900" />);
    expect(screen.getByRole('alert').textContent).toMatch(/cannot be all of the paste/i);
    expect(screen.getByText('3,600 g')).toBeTruthy(); // fell back to the computed pot
    cleanup();
    render(<DilutionPanel {...G} gradualWaterGrams="2000" measuredPasteGrams="1480.25" />);
    expect(screen.getByRole('alert').textContent).toMatch(/thousands separator/i);
  });

  it('the exceeds-solution refusal is untouched while the plan governs', () => {
    // The positive control for the suppression above: same reading, same dilution, no record
    // — where the plan IS what the maker is steering by and the remedy names its field.
    render(
      <DilutionPanel
        {...BASE}
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        dilution={ROUNDED.dilution}
        soapConcentrationPercent="85.41"
        measuredPasteGrams="1405"
      />,
    );
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent!.replace(/\s+/g, ' '));
    expect(alerts.some((a) => /already weighs more than/i.test(a))).toBe(true);
    expect(alerts.some((a) => /lower the target concentration/i.test(a))).toBe(true);
  });

  it('accounts for the plan\'s "0 g" instead of explaining it as a verdict', () => {
    // pasteAlreadyPastTarget: a 2,000 g corrected pot against the 1,900 g its soap makes at
    // the plan. With the plan governing, that alert accounts for the bare "0 g" in the pour
    // row. Under a record the alert is gated off (it is a verdict about a target), and §4's
    // plan-labelled caption is what accounts for the row instead — the row itself STAYS, and
    // that is the difference from the mode this replaces, which deleted the row and left the
    // maker with no plan figure at all.
    const CLAMPED = {
      dilution: {
        anhydrousGrams: 1200, solutionGrams: 1900, totalWaterGrams: 700,
        dilutionWaterGrams: 300, glycerinGrams: 100, soapConcentrationPercent: 63.2,
        targetExceedsPaste: false,
      },
      soapConcentrationPercent: '63.2',
      cookWaterGrams: 400,
      wholeBatchPasteGrams: 2000,
    };
    render(<DilutionPanel {...BASE} {...CLAMPED} />);
    expect(screen.getByText(/already more dilute than the target above/i)).toBeTruthy();
    cleanup();
    render(<DilutionPanel {...BASE} {...CLAMPED} onGradualWaterChange={() => {}} gradualWaterGrams="2000" />);
    expect(screen.queryByText(/already more dilute/i)).toBeNull();
    const row = screen.getByText('Dilution water to add (plan)').closest('div')!;
    expect(row.textContent).toContain('0 g');
    expect(screen.getByText(/^Plan: at 63\.2%/)).toBeTruthy();
  });

  it('asks for the one control it has, while there is no recipe', () => {
    // RETIRED-AND-KEPT: 'asks for what the current mode can actually give it while there is
    // no recipe'. The ask used to branch, because ratio and gradual replaced the
    // concentration field with their own and the sentence sent a maker looking for a control
    // the mode had removed. One field, one wording — and it is the same sentence in every
    // state, including the one the resolution's pinned contract names ("governs record,
    // record null": a leftover record beside a target calculateDilution refuses).
    render(<DilutionPanel {...BASE} dilution={null} />);
    expect(screen.getByText(/Enter oils and a target concentration \(1–99%\) to compute dilution\./))
      .toBeTruthy();
    cleanup();
    render(
      <DilutionPanel {...BASE} dilution={null} gradualWaterGrams="500" onGradualWaterChange={() => {}} />,
    );
    expect(screen.getByText(/Enter oils and a target concentration \(1–99%\) to compute dilution\./))
      .toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Finished so far/)).toBeNull();
  });
});

describe('the record: which paste it counts from', () => {
  const G = {
    ...BASE,
    cookWaterGrams: 400, wholeBatchPasteGrams: 1600, onGradualWaterChange: () => {},
    gradualWaterGrams: '2000',
  };

  it('uses the pot the maker actually weighed, and says so', () => {
    // Weighed 1,500 g (the cook drove off more than the recipe predicted). Finished is
    // 1,500 + 2,000 = 3,500 g, not the computed 3,600 g.
    render(<DilutionPanel {...G} measuredPasteGrams="1500" />);
    expect(screen.getByText('3,500 g')).toBeTruthy();
    // Brief defect found here: the panel already has TWO always-on, unrelated uses of the
    // literal word "measured" — the "Measured paste weight" field's own label (every mode)
    // and the density caveat's "not a measured density" (whole-batch scope, whenever a
    // volume renders) — so /measured/i is ambiguous the moment both are on screen at once,
    // regardless of what this readout says. "Weighed" is the same claim the brief's own
    // prose makes ("the pot the maker actually weighed") without colliding with either.
    expect(screen.getByText(/weighed/i)).toBeTruthy();
  });

  it('falls back to the computed paste when no reading was taken, and names that instead', () => {
    render(<DilutionPanel {...G} measuredPasteGrams="" />);
    const row = screen.getByText(/Finished so far/).closest('div')!;
    expect(row.textContent).toContain('3,600 g');
    expect(row.textContent).toMatch(/computed/i);
  });

  it('ignores a reading the shared gate rejects, rather than counting from an impossible pot', () => {
    // Below the anhydrous floor: physically impossible, and measuredPasteRejectionFor
    // already refuses it everywhere else in the app.
    render(<DilutionPanel {...G} measuredPasteGrams="900" />);
    expect(screen.getByText('3,600 g')).toBeTruthy();
  });
});

// RETIRED: 'the re-entry guard — a derived mode must not revert a typed target'. Its subject
// was a touched-flag that had to be reset on every mode change, so that leaving a derived
// mode to type an exact target and returning could not silently revert it. There are no
// modes to leave and return to, and no effect that would revert anything — the property is
// pinned in general by 'the plan is written by the maker, and by nothing else' above, which
// sweeps mount and prop-change (including an EXTERNAL change to the plan, the import case
// the retired ratio effect listed as a dependency in order to overwrite).

describe('a recorded jar in Custom amount scope', () => {
  const P = {
    ...BASE,
    dilutionScope: 'portion' as const, cookWaterGrams: 400, wholeBatchPasteGrams: 1600,
    onGradualWaterChange: () => {},
    onPortionPasteChange: () => {}, onPortionWaterChange: () => {},
  };

  it('offers both ways to describe a jar until one of them is filled in', () => {
    // REWRITTEN: 'asks for the paste weighed out, not a target volume'. The mode radio was
    // the only way into the jar's two fields, so deleting it would have made them
    // unreachable; they are simply on the Custom amount screen now, beside the amount field
    // they replace once they resolve a jar (spec §2's precedence — jar record with both
    // figures → jar; else plan sizing). This is the smallest edit that keeps the jar
    // reachable; portion scope's own two-row shape and labelling are Phase 2b (spec §6).
    render(<DilutionPanel {...P} portionPasteGrams="" portionWaterGrams="" />);
    expect(screen.getByLabelText(/Paste weighed out/)).toBeTruthy();
    expect(screen.getByLabelText(/Water added so far/)).toBeTruthy();
    expect(screen.getByLabelText(/Amount to make/)).toBeTruthy();
    // The whole batch's own record field is NOT here: it is the batch's, and each record
    // leads in its own scope.
    expect(screen.queryByText(/The batch so far is at/)).toBeNull();
  });

  it('shows the plan-sized portion grid too, labelled as plan, with a stale amount left behind', () => {
    // REWRITTEN (review-fix round 1, spec §2: "the plan grid stays rendered beside a filled
    // jar record, labelled as plan; the jar governs only dose/finished figures"). This used to
    // pin the OPPOSITE claim — that the whole plan-derived grid stood down here, because
    // `targetMl` is App session state that survives everything and a maker who sized a jar by
    // volume, then recorded the one they actually weighed without clearing the amount, would
    // otherwise see two UNLABELLED figure sets disagreeing about the same jar. The spec's
    // answer to that state turned out to be the label, not suppression (the batch scope
    // already proves three masses can share a screen once each carries its name) — so this is
    // the reachable path the label was built for, not a state to hide.
    //
    // Three things in one cell, per the review's own ask: the grid renders, its primary row
    // is plan-LABELLED, and the jar's own figures are what govern the dose/finished mass
    // (spec §2's own division of labour, unchanged by this round).
    render(
      <DilutionPanel {...P} targetMl="1000" portionPasteGrams="400" portionWaterGrams="900" />,
    );
    // THE JAR GOVERNS the dose/finished figures: 400 g of paste is a quarter of the 1,600 g
    // batch (300 g anhydrous) plus 900 g water is 1,300 g at 23.08% soap — the same figure a
    // caller of App's preservativeBasis memo would dose against, not the plan grid's own
    // sizing below.
    const jarRow = screen.getByText('Finished so far (this jar)').closest('div')!;
    expect(jarRow.textContent).toContain('1,300 g');
    expect(screen.getByText(/23\.08% soap/)).toBeTruthy();
    // THE PLAN GRID IS PRESENT, sized from the stale `targetMl="1000"` exactly as it would be
    // with no jar recorded — 1,000 ml at this recipe's 30% target is 412 g of paste and 618 g
    // of water (core's own arithmetic, unchanged by a jar existing beside it).
    const planWaterRow = screen.getByText('Water to add (plan)').closest('div')!;
    expect(planWaterRow.textContent).toContain('618 g');
    expect(screen.getByText('Paste to weigh out').closest('div')!.textContent).toContain('412 g');
    expect(screen.getByText('Makes').closest('div')!.textContent).toContain('1,000 ml');
    // AND PLAN-LABELLED: the primary row carries "(plan)" so the two figure sets — this one
    // and the jar's own "Finished so far (this jar)" above — can never be mistaken for one
    // disagreeing answer.
    expect(screen.queryByText('Water to add')).toBeNull();
  });

  it("reports the jar's own figures, each named as the portion's", () => {
    // 400 g of paste is a quarter of the 1,600 g batch, so it carries 300 g anhydrous.
    // Add 900 g water → 1,300 g finished, 300/1300 = 23.08% soap.
    //
    // The water is 900 and not 600 DELIBERATELY. At 600 the jar lands on exactly 30%, and
    // the match is ambiguous — but NOT, as an earlier version of this comment claimed,
    // against the recipe-target echo: that is a readOnly <input>, reachable by
    // getByDisplayValue and never by getByText. The real second match is the static
    // dilution-uses table's "Hand soap: 15–30% soap" row, which renders
    // unconditionally. 900 lands the jar at 23.08% and matches exactly once.
    render(<DilutionPanel {...P} portionPasteGrams="400" portionWaterGrams="900" />);
    expect(screen.getByText('1,300 g')).toBeTruthy();
    expect(screen.getByText(/23\.08% soap/)).toBeTruthy();
    expect(screen.getByText(/this jar/i)).toBeTruthy();
  });

  // THE GUARD. A jar diluted thinner has not redefined the recipe. Asserted on the spy
  // rather than on a rendered figure, because the damage is the write, not the display.
  it('NEVER writes the jar\'s concentration back into the recipe', () => {
    const onSoapConcentrationChange = vi.fn();
    const { rerender } = render(
      <DilutionPanel {...P} portionPasteGrams="" portionWaterGrams=""
        onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    fireEvent.change(screen.getByLabelText(/Paste weighed out/), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText(/Water added so far/), { target: { value: '900' } });
    rerender(
      <DilutionPanel {...P} portionPasteGrams="400" portionWaterGrams="900"
        onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });

  it('leaves the recipe target on screen unchanged beside the jar figure', () => {
    render(<DilutionPanel {...P} portionPasteGrams="400" portionWaterGrams="900"
      soapConcentrationPercent="30" />);
    // 400 + 900 = 1,300 g at 300/1300 = 23.1% — the jar. The recipe still says 30%.
    expect(screen.getByText(/23(\.\d+)?% soap/)).toBeTruthy();
    // TWO controls hold that 30 now: the plan field at the top of the panel (editable) and
    // the read-only echo inside the jar's own paragraph, which is the one this test is
    // about — the echo exists to let a maker see for themselves that diluting one jar left
    // the recipe alone (spec §2: the plan named as the plan, beside the jar).
    const echo = screen.getByLabelText(/The plan's target concentration, beside this jar/i) as HTMLInputElement;
    expect(echo.value).toBe('30');
    expect(echo.readOnly).toBe(true);
  });

  it('refuses a jar heavier than the whole batch, instead of blanking the readout', () => {
    // The typo this catches: 4000 for 400. Until this alert the readout simply vanished —
    // no figures, no explanation — while the measured-paste field one row up answered the
    // same class of mistake with three alerts.
    render(<DilutionPanel {...P} portionPasteGrams="4000" portionWaterGrams="900" />);
    const alert = screen.getByRole('alert').textContent!.replace(/\s+/g, ' ');
    expect(alert).toMatch(/more paste than the batch holds/i);
    // The bound the refusal actually applied, quoted rather than re-derived.
    expect(alert).toContain('1,600 g');
    expect(screen.queryByText(/Finished so far/)).toBeNull();
  });

  it('gains the plan-labelled grid here too, even though the jar itself is refused (review-fix round 1)', () => {
    // THE AXIS BOTH EARLIER MATRICES MISSED: `portionJarGoverns` is `resolveDilution`'s
    // `governs === 'record'`, which is true here (both jar figures typed) even though the
    // jar's own arithmetic refuses (paste heavier than the batch) — the module's own doc
    // calls this "governs a scope" and "has figures to show" being different questions. The
    // plan grid's own gate is `dilutionScope === 'portion'` unconditionally now (spec §2), so
    // it renders in EVERY portion-scope cell with a `dilution`, labelled as plan whenever
    // `portionJarGoverns` — including this one, where the jar itself shows nothing. Nothing
    // about the refusal alert or the missing jar readout changes; the grid is the only thing
    // that moves in this cell.
    render(<DilutionPanel {...P} targetMl="1000" portionPasteGrams="4000" portionWaterGrams="900" />);
    expect(screen.getByRole('alert').textContent).toMatch(/more paste than the batch holds/i);
    expect(screen.queryByText(/Finished so far/)).toBeNull();
    expect(screen.getByText('Water to add (plan)')).toBeTruthy();
    expect(screen.queryByText('Water to add')).toBeNull();
  });

  it("keeps the jar's own figures when the SAVED TARGET is past the batch's paste", () => {
    // The jar's concentration is its share of the batch's soap over what the maker poured
    // into it — no target anywhere in that sentence. It used to be resolved through
    // lsPartialDilution, which refuses whenever the saved target implies a solution lighter
    // than the pot, so a low-water target silently blanked a readout that does not depend
    // on it. 1,200 g of soap at an 80% target makes 1,500 g of solution against a 1,600 g
    // pot — refused there, computed here.
    render(
      <DilutionPanel
        {...P}
        soapConcentrationPercent="80"
        dilution={{
          anhydrousGrams: 1200, solutionGrams: 1500, totalWaterGrams: 300,
          dilutionWaterGrams: 0, glycerinGrams: 110, soapConcentrationPercent: 80,
          targetExceedsPaste: true,
        }}
        portionPasteGrams="400"
        portionWaterGrams="900"
      />,
    );
    expect(screen.getByText('1,300 g')).toBeTruthy();
    expect(screen.getByText(/23\.08% soap/)).toBeTruthy();
  });

  it('asks for the two figures once one of them is started, and not before', () => {
    // With the jar HALF recorded there is nothing to show and nothing on screen would
    // otherwise say why, so the panel asks — the same courtesy it always gave an incomplete
    // record. What changed is the untouched pair: those two fields used to be reachable only
    // by choosing a mode, so an empty pair meant "the maker came here to record a jar" and
    // an unprompted ask was right. They are on every Custom amount screen now, with the plan
    // sizing grid answering beside them, and an unprompted paragraph would spend half the
    // panel's prose budget in the commonest state there is.
    render(<DilutionPanel {...P} portionPasteGrams="" portionWaterGrams="" />);
    expect(screen.queryByText(/Enter the paste you weighed out/)).toBeNull();
    cleanup();
    // Half-entered is incomplete, and zero water is a record rather than a blank.
    render(<DilutionPanel {...P} portionPasteGrams="400" portionWaterGrams="" />);
    expect(screen.getByText(/Enter the paste you weighed out/)).toBeTruthy();
    cleanup();
    render(<DilutionPanel {...P} portionPasteGrams="" portionWaterGrams="900" />);
    expect(screen.getByText(/Enter the paste you weighed out/)).toBeTruthy();
    cleanup();
    render(<DilutionPanel {...P} portionPasteGrams="400" portionWaterGrams="0" />);
    expect(screen.queryByText(/Enter the paste you weighed out/)).toBeNull();
    expect(screen.getByText('400 g')).toBeTruthy();
  });

  it('keeps the alternative-liquid instruction, which a governing jar would otherwise drop', () => {
    // "Top up with plain distilled water only" is the only sentence in the app telling a
    // maker not to keep topping up with milk or juice, and it reaches Custom amount only
    // through PortionDilutionResults — the component a governing jar replaces. So recording
    // a jar would silently remove it from a recipe that still has the liquid in it.
    render(
      <DilutionPanel {...P} altLiquidWaterGrams={400} portionPasteGrams="400" portionWaterGrams="900" />,
    );
    expect(screen.getByText(/Top up with plain distilled water only/)).toBeTruthy();
  });
});

describe('the record field in Whole batch: labelled, empty, and unprompted', () => {
  const G = {
    ...BASE,
    cookWaterGrams: 400, wholeBatchPasteGrams: 1600, onGradualWaterChange: () => {},
  };

  it('does not ask for the water it is already asking for by its own label', () => {
    // RETIRED-AND-KEPT: 'asks for the water while the field is empty, and names zero as a
    // real record'. That prompt existed to explain a MODE that showed nothing at all until a
    // number arrived — it was the only thing on screen in that state. The field is now on
    // every whole-batch screen, labelled, beside a full grid of plan figures, so an
    // always-on paragraph would explain nothing and would spend a third of the panel's prose
    // budget in the commonest state there is.
    render(<DilutionPanel {...G} gradualWaterGrams="" />);
    expect(screen.getByLabelText('Water added so far (g)')).toBeTruthy();
    expect(screen.queryByText(/Enter the water you have added so far/)).toBeNull();
    expect(screen.queryByText(/Finished so far/)).toBeNull();
  });

  it('keeps the ZERO IS A RECORD claim, in the notes where always-true prose lives', () => {
    // The one claim that prompt carried worth keeping: the pot before any water at all is
    // the reference's own starting entry (LS:1531), and an empty field is not the same
    // thing. True in every state, which is exactly what the collapsed notes are for.
    render(<DilutionPanel {...G} gradualWaterGrams="" />);
    const note = screen.getByText(/Recording 0 g counts/);
    expect(note.closest('details')).toBeTruthy();
    expect(note.textContent).toMatch(/where the record starts/i);
    expect(note.textContent).toMatch(/An empty field is not the same thing/i);
  });

  it('shows the record the moment one exists — zero included', () => {
    render(<DilutionPanel {...G} gradualWaterGrams="0" />);
    // The pot before any water: 1,600 g at 75% soap.
    const row = screen.getByText(/Finished so far/).closest('div')!;
    expect(row.textContent).toContain('1,600 g');
    expect(screen.getByText(/The batch so far is at 75% soap/)).toBeTruthy();
  });
});

describe('the swallowed thousands separator, on the three fields gradual added', () => {
  // The trap this whole module already documents, on the inputs the gradual mode introduced:
  // `<input type="number">` reads a typed comma as a DECIMAL POINT in every locale, so a maker
  // typing 2,000 g of water commits '2.000' and the app records 2 g. The only detectable
  // fingerprint is the impossible precision (two or more typed decimals — no scale weighing a
  // batch reads finer than 0.1 g), which is exactly what the measured-paste field and the
  // "Amount to make (ml)" field are already judged by.
  const G = {
    ...BASE,
    cookWaterGrams: 400, wholeBatchPasteGrams: 1600, onGradualWaterChange: () => {},
  };
  const P = {
    ...G, dilutionScope: 'portion' as const,
    onPortionPasteChange: () => {}, onPortionWaterChange: () => {},
  };

  it('refuses a record of 2 g typed as 2,000 g, instead of deriving 76% from it', () => {
    render(<DilutionPanel {...G} gradualWaterGrams="2.000" />);
    // 1,600 g of paste plus a recorded 2 g is 1,602 g at 74.91% soap — the number the app
    // would write into settings.soapConcentrationPercent, and size a legally capped
    // preservative dose against, for a 3,600 g batch.
    expect(screen.queryByText(/Finished so far/)).toBeNull();
    expect(screen.queryByText(/That lands at/)).toBeNull();
    const alert = screen.getByRole('alert').textContent!.replace(/\s+/g, ' ');
    expect(alert).toMatch(/2\.000 g/);
    expect(alert).toMatch(/thousands separator/i);
  });

  it('writes nothing back from a record it has refused', () => {
    const onSoapConcentrationChange = vi.fn();
    const { rerender } = render(
      <DilutionPanel {...G} gradualWaterGrams="" onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    fireEvent.change(screen.getByLabelText(/Water added so far/), { target: { value: '2.000' } });
    rerender(
      <DilutionPanel {...G} gradualWaterGrams="2.000" onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });

  it('keeps a one-decimal record, which a scale really does read', () => {
    render(<DilutionPanel {...G} gradualWaterGrams="2000.5" />);
    expect(screen.getByText(/Finished so far/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("refuses a jar's paste typed as 1,300 g, instead of sizing a 1.3 g jar", () => {
    render(<DilutionPanel {...P} portionPasteGrams="1.300" portionWaterGrams="900" />);
    expect(screen.queryByText(/Finished so far/)).toBeNull();
    const alert = screen.getByRole('alert').textContent!.replace(/\s+/g, ' ');
    expect(alert).toMatch(/1\.300 g/);
    expect(alert).toMatch(/thousands separator/i);
  });

  it("refuses a jar's water typed as 2,000 g", () => {
    render(<DilutionPanel {...P} portionPasteGrams="400" portionWaterGrams="2.000" />);
    expect(screen.queryByText(/Finished so far/)).toBeNull();
    const alert = screen.getByRole('alert').textContent!.replace(/\s+/g, ' ');
    expect(alert).toMatch(/2\.000 g/);
    expect(alert).toMatch(/thousands separator/i);
  });
});

describe('a jar is weighed out of the pot the maker weighed', () => {
  // The mode exists to report what actually exists, so the batch paste a jar is a share of has
  // to be the pot on the scale when there is one — the same preference batch-scope gradual and
  // ratio mode already apply. Sizing the share from the recipe's PREDICTION while the maker
  // has weighed the pot reports a concentration for a jar nobody has.
  const P = {
    ...BASE,
    dilutionScope: 'portion' as const, cookWaterGrams: 400, wholeBatchPasteGrams: 1600,
    onGradualWaterChange: () => {}, onPortionPasteChange: () => {}, onPortionWaterChange: () => {},
  };

  it("takes the jar's share of the soap from the weighed pot, not the computed one", () => {
    // The cook boiled 200 g off: a 1,600 g computed pot weighed 1,400 g. A 400 g jar is then
    // 400/1400 of the batch's 1,200 g of soap = 342.86 g, in 600 g of jar → 57.14% soap.
    // Off the computed pot the same jar reads 50.00% — seven points thinner than what is in it.
    render(
      <DilutionPanel {...P} measuredPasteGrams="1400" portionPasteGrams="400" portionWaterGrams="200" />,
    );
    expect(screen.getByText('600 g')).toBeTruthy();
    expect(screen.getByText(/57\.14% soap/)).toBeTruthy();
  });

  it('judges "more paste than the batch holds" against the same weighed pot', () => {
    // A cook that lost nothing: 1,800 g on the scale against a 1,600 g prediction. A 1,700 g
    // jar really is in the pot, and refusing it quoted a bound the maker's own scale
    // contradicts — "all of it weighs 1,600 g" beside a reading of 1,800.
    render(
      <DilutionPanel {...P} measuredPasteGrams="1800" portionPasteGrams="1700" portionWaterGrams="300" />,
    );
    expect(screen.queryByText(/more paste than the batch holds/i)).toBeNull();
    expect(screen.getByText('2,000 g')).toBeTruthy();
  });
});

describe('the density caveat needs a millilitre figure on screen', () => {
  it('comes back on in Custom amount with a recorded jar, now that the plan grid renders its own volume beside it', () => {
    // REWRITTEN (review-fix round 1, spec §2). This used to pin the opposite: "a governing jar
    // correctly suppresses the whole plan-sized grid" — true in 2a/early 2b, false now that the
    // grid renders beside a governing jar too (spec §2's own end state). `targetMl` is App
    // session state that survives everything, so it still sizes a live "Makes" figure — the
    // caveat's own gate (`portionOnScreen`, read off the identical `portionDilutionFor` call
    // the grid renders from) was never wrong; what changed is that the grid it explains is
    // back on screen for it to answer to.
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="portion"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        onGradualWaterChange={() => {}}
        onPortionPasteChange={() => {}}
        onPortionWaterChange={() => {}}
        targetMl="1200"
        portionPasteGrams="400"
        portionWaterGrams="900"
      />,
    );
    expect(screen.getByText('Makes').closest('div')!.textContent).toContain('ml');
    expect(screen.getByText(/Volume assumes/)).toBeTruthy();
  });
});

describe("the undeclared-liquid hedge is not lost between two suppressions", () => {
  // REGRESSION PIN. This clause is suppressed in Custom amount because the child says the
  // same thing with the missing figures explained — but that child does not render for a
  // governing jar. While portionState was still computed from a stale targetMl there,
  // pasteAlreadyThinner could be true and suppress this clause too, so an undeclared
  // liquid went unmentioned on BOTH surfaces. The fix that resolves portionState only where
  // the child renders repaired it silently; this is the pin.
  const OVER = {
    ...RESULT,
    // targetExceedsPaste is the hedge's precondition: the target asks for less water than
    // the cook already put in, judged from an ASSUMED water content.
    targetExceedsPaste: true,
  };

  const HEDGE = /Can't tell whether .* is reachable/;

  it('the CHILD speaks in its own words with a recorded jar, now that it renders there too', () => {
    // REWRITTEN (review-fix round 1). Until now, PortionDilutionResults never rendered while
    // a jar governed, so this pin asserted the SHELL's own wording (`HEDGE`, "Can't tell
    // whether N% is reachable") had to carry the message — the state the pin's own history
    // names: "no child is there to say it". Spec §2 (phase 2b) makes that premise false: the
    // plan grid — and the hedge/verdict paragraph riding it — renders beside a governing jar
    // now, in every state this grid renders in at all. The child says it in ITS OWN words
    // again ("No portion can be sized yet…"), and `portionOwnsUndeclaredLiquidHedge`
    // correctly stands the shell's copy down — this is the identical suppression the
    // no-jar sibling test below already exercises, now reachable with a jar recorded too.
    // What the pin still guards is the thing it always guarded: an undeclared liquid must
    // never go unmentioned on BOTH surfaces at once.
    render(
      <DilutionPanel
        {...BASE}
        dilution={OVER}
        dilutionScope="portion"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        unknownLiquidGrams={500}
        targetMl="1000"
        gradualWaterGrams=""
        onGradualWaterChange={() => {}}
        portionPasteGrams="400"
        portionWaterGrams="900"
        onPortionPasteChange={() => {}}
        onPortionWaterChange={() => {}}
      />,
    );
    expect(screen.getByText(/no declared water content/i)).toBeTruthy();
    expect(screen.queryByText(HEDGE)).toBeNull();
  });

  it('still lets the child own it in Custom amount with no jar recorded', () => {
    // The suppression is correct where the child actually renders — this is the arm that
    // makes the test above a claim about the governing jar rather than about the hedge in
    // general.
    render(
      <DilutionPanel
        {...BASE}
        dilution={OVER}
        dilutionScope="portion"
        cookWaterGrams={400}
        wholeBatchPasteGrams={1600}
        unknownLiquidGrams={500}
        targetMl="1000"
      />,
    );
    // Whichever surface carries it, the maker is told. What must never happen is silence.
    expect(screen.queryAllByText(HEDGE).length + screen.queryAllByText(/no declared water content/i).length)
      .toBeGreaterThan(0);
  });
});

describe('one dilution surface: a plan and a record', () => {
  // Phase 2a (docs/superpowers/specs/2026-08-19-dilution-plan-record-design.md §1-§4). The
  // three-mode radio is gone; what is left is a PLAN (the target %, with the reference's
  // ratios offered as one-shot setters for it) and a RECORD (the water actually poured).
  // A record present governs every batch figure; the plan rows stay on screen, labelled as
  // plan, so three masses can share a screen because each carries its name.
  const PLAN30 = {
    ...BASE,
    dilution: RESULT,
    soapConcentrationPercent: '30',
    cookWaterGrams: 400,
    wholeBatchPasteGrams: 1600,
    onGradualWaterChange: () => {},
  };

  it('a ratio preset is a one-shot setter: it writes the % field once and never tracks the pot again', () => {
    // §2: a click computes anhydrous/(pot x (1+r)) x 100 from the pot AT CLICK TIME —
    // 1,200 / (1,600 x 3) = 25.0% at 2:1 — rounds to 1 dp, clamps to [1, 99] and writes it
    // into the plan field. Nothing subscribes to the pot afterwards: a later measurement
    // moves the pot without moving the plan, which is the whole difference between a preset
    // and the mode it replaces.
    const onSoapConcentrationChange = vi.fn();
    const { rerender } = render(
      <DilutionPanel {...PLAN30} onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^2:1\b/ }));
    expect(onSoapConcentrationChange).toHaveBeenCalledTimes(1);
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');

    onSoapConcentrationChange.mockClear();
    rerender(
      <DilutionPanel
        {...PLAN30}
        onSoapConcentrationChange={onSoapConcentrationChange}
        measuredPasteGrams="2000"
      />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });

  it('says what the preset did, in the caption pattern the spec names', () => {
    render(<DilutionPanel {...PLAN30} soapConcentrationPercent="25" />);
    fireEvent.click(screen.getByRole('button', { name: /^2:1\b/ }));
    expect(screen.getByText(/2:1 → 25%/)).toBeTruthy();
  });

  it('never writes the plan % on its own — not on mount, not on a record, not on a reading', () => {
    // Decision 2: NO WRITE-BACK, EVER. The record and the plan are independent state, and
    // the record's derived % is display-only. Every state that used to fire a write-back is
    // rendered here, and typing a record is driven through the field itself.
    for (const gradualWaterGrams of ['', '0', '900', '2400', '2.000']) {
      for (const measuredPasteGrams of ['', '1500', '4500']) {
        const onSoapConcentrationChange = vi.fn();
        render(
          <DilutionPanel
            {...PLAN30}
            gradualWaterGrams={gradualWaterGrams}
            measuredPasteGrams={measuredPasteGrams}
            onSoapConcentrationChange={onSoapConcentrationChange}
          />,
        );
        fireEvent.change(screen.getByLabelText('Water added so far (g)'), {
          target: { value: '1234' },
        });
        expect(
          onSoapConcentrationChange,
          `record=${gradualWaterGrams} reading=${measuredPasteGrams}`,
        ).not.toHaveBeenCalled();
        cleanup();
      }
    }
  });

  it('a record present makes the batch figures follow it, with the plan rows kept and named', () => {
    // §2: while the record governs, "Finished so far" and the inclusive rows are record
    // figures, and the plan's own two rows stay rendered LABELLED AS PLAN — three masses
    // may be on screen only because each carries its name.
    render(<DilutionPanel {...PLAN30} gradualWaterGrams="900" />);
    // 1,600 g pot + 900 g recorded = 2,500 g.
    expect(screen.getByText('Finished so far (computed)')).toBeTruthy();
    expect(screen.getByText('2,500 g')).toBeTruthy();
    // The plan rows survive, named.
    expect(screen.getByText('Dilution water to add (plan)')).toBeTruthy();
    expect(screen.getByText('Finished solution (plan)')).toBeTruthy();
  });

  it('the ceiling and the intended uses read the resolved %, not the saved plan', () => {
    // §4's interpolation rule: every % in record-governed copy is the RESOLVED %. A 30%
    // plan with 900 g recorded on a 1,600 g pot is a 48% batch — above the 40% ceiling —
    // so the uses summary and the ceiling must both speak of 48%, never of 30%.
    render(<DilutionPanel {...PLAN30} gradualWaterGrams="900" />);
    expect(screen.getByText(/No common use calls for 48%/)).toBeTruthy();
    expect(screen.queryByText(/At 30% this suits/)).toBeNull();
    const ceiling = screen
      .queryAllByRole('alert')
      .map((a) => a.textContent!.replace(/\s+/g, ' '))
      .find((t) => /dissolve/i.test(t));
    expect(ceiling).toBeTruthy();
    expect(ceiling).toMatch(/The batch so far is at 48%/);
    expect(ceiling).toMatch(/keep adding water/);
    // The record arm has no target, so it may not call this one.
    expect(ceiling).not.toMatch(/this target|even a coconut-heavy/i);
  });

  it('keeps the plan wording for the ceiling while the plan governs', () => {
    render(<DilutionPanel {...BASE} soapConcentrationPercent="45"
      dilution={{ ...RESULT, solutionGrams: 2666.67, totalWaterGrams: 1466.67,
        dilutionWaterGrams: 1066.67, soapConcentrationPercent: 45 }}
      cookWaterGrams={400} wholeBatchPasteGrams={1600} />);
    const alert = screen.getByRole('alert').textContent!.replace(/\s+/g, ' ');
    expect(alert).toMatch(/This target is above what even a coconut-heavy recipe can fully dissolve/);
  });

  it('stands the plan-claim alerts down while a record governs', () => {
    // §4: pasteAlreadyPastTarget and the exceeds-solution refusal are claims about a TARGET
    // the paste cannot reach. A record arm has no target, so both are plan-governs-only.
    const PAST_TARGET = {
      ...BASE,
      dilution: {
        anhydrousGrams: 1200, solutionGrams: 1900, totalWaterGrams: 700,
        dilutionWaterGrams: 300, glycerinGrams: 100, soapConcentrationPercent: 63.2,
        targetExceedsPaste: false,
      },
      soapConcentrationPercent: '63.2',
      cookWaterGrams: 400,
      wholeBatchPasteGrams: 2000,
      onGradualWaterChange: () => {},
    };
    render(<DilutionPanel {...PAST_TARGET} />);
    expect(screen.getByText(/so there is no dilution water to add/)).toBeTruthy();
    cleanup();
    render(<DilutionPanel {...PAST_TARGET} gradualWaterGrams="500" />);
    expect(screen.queryByText(/so there is no dilution water to add/)).toBeNull();
    cleanup();
    // The exceeds-solution refusal, same rule: 2,500 g against a 1,900 g solution.
    render(<DilutionPanel {...PAST_TARGET} measuredPasteGrams="2500" />);
    expect(screen.getByText(/this target dilutes to/)).toBeTruthy();
    cleanup();
    render(<DilutionPanel {...PAST_TARGET} measuredPasteGrams="2500" gradualWaterGrams="500" />);
    expect(screen.queryByText(/this target dilutes to/)).toBeNull();
  });
});
