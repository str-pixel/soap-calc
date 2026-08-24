// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PortionDilutionResults, dilutionTargetWording, portionDilutionFor } from './PortionDilutionResults';
import type { DilutionResult } from '@soap-calc/core';

afterEach(cleanup);

// 1,200 g anhydrous + 400 g cook water = 1,600 g paste; 2,400 g dilution water →
// 4,000 g solution = 3,883 ml at 1.03 g/ml.
const RESULT: DilutionResult = {
  anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
  dilutionWaterGrams: 2400, glycerinGrams: 110, soapConcentrationPercent: 30, targetExceedsPaste: false,
};

const PROPS = {
  dilution: RESULT,
  weightUnit: 'g' as const,
  targetMl: '',
  measuredPasteGrams: '',
};

// House rule for this file: no test here may pass while the component renders nothing.
// This component has no role="alert" of its own — every rejection alert moved into
// DilutionPanel's shell, where the input lives and both scopes can reach it — so the
// `queryByRole('alert')).toBeNull()` assertions that replaced the old wording pins could
// never fail, and with them nine of these tests survived stubbing the whole render to
// `return null`. What this component owes on a bad reading is refusing to COMPUTE, which
// only a positive control can distinguish from being broken: each refusal test therefore
// re-renders the same fixture with a reading the component accepts.

test('scales paste and water to the amount asked for', () => {
  render(<PortionDilutionResults {...PROPS} targetMl="1000" />);
  // 1,000 of 3,883 ml ≈ 25.8% of the batch: 412 g paste, 618 g water.
  expect(screen.getByText('412 g')).toBeTruthy();
  expect(screen.getByText(/^618 g/)).toBeTruthy();
  expect(screen.getByText(/26% of the batch/)).toBeTruthy();
});

test('the water figure shows a single unit, switchable from DilutionPanel above rather than shown all at once', () => {
  render(<PortionDilutionResults {...PROPS} targetMl="1000" />);
  expect(screen.getByText('618 g')).toBeTruthy();
});

test('says so when more is asked for than the batch holds', () => {
  render(<PortionDilutionResults {...PROPS} targetMl="9000" />);
  expect(screen.getByText(/figures above are the whole batch/i)).toBeTruthy();
  expect(screen.getByText('1,600 g')).toBeTruthy(); // all the paste
});

test('shows no figures until an amount is entered', () => {
  // The one state where an empty render is the right answer: nothing has been asked for
  // yet. Paired with the amount filled in, so this says "waiting" rather than "renders
  // nothing, ever".
  const { rerender } = render(<PortionDilutionResults {...PROPS} />);
  expect(screen.queryByText(/Paste to weigh/)).toBeNull();
  rerender(<PortionDilutionResults {...PROPS} targetMl="1000" />);
  expect(screen.getByText('Paste to weigh out')).toBeTruthy();
});

test('says the paste is already more dilute than the target rather than computing a portion (the inputs that let a measurement override this moved to DilutionPanel)', () => {
  // targetExceedsPaste clamps dilutionWaterGrams to 0, which erases the real cook water:
  // the batch's true mass and volume can no longer be recovered from the result, so the
  // portion %, the clamp threshold and the "more than the batch holds" message would all
  // be wrong (measured: 39% shown where the truth was 18.4%). Say so instead of computing —
  // but DilutionPanel uses the same measurement to override this exact flag (Task 5).
  render(
    <PortionDilutionResults
      {...PROPS}
      dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }}
    />,
  );
  expect(screen.getByText(/already more dilute/i)).toBeTruthy();
});

describe('an undeclared alternative liquid makes "already more dilute" unknowable, here as much as in the shell', () => {
  // targetExceedsPaste is derived from the recipe's ASSUMED water content, so with an
  // alternative liquid whose % water was never declared the claim is not knowable —
  // DilutionPanel gates the identical sentence on (unknownLiquidGrams === 0 ||
  // overDilutionCertain) and hedges instead, and so does the printed sheet. Asserting it
  // here printed a flat "already more dilute" two paragraphs above the shell's own
  // "can't tell whether N% is reachable": same panel, same state, opposite verdicts.
  const OVER = {
    ...RESULT,
    dilutionWaterGrams: 0,
    soapConcentrationPercent: 90,
    targetExceedsPaste: true,
  };

  test('hedges instead of asserting when the liquid\'s water content is undeclared', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={OVER}
        unknownLiquidGrams={900}
        overDilutionCertain={false}
      />,
    );
    expect(screen.queryByText(/already more dilute/i)).toBeNull();
    expect(screen.getByText(/declared/i)).toBeTruthy();
    // Still no portion: the guard's computation is unchanged, only what it says.
    expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
  });

  test('quotes the undeclared figure in the app-wide unit when it hedges', () => {
    // The hedge is prose, not a grid row — exactly the kind of site the app-wide-unit
    // rewire could miss while every grid figure obeyed (mutation-verified: hardcoding
    // this one call to grams passed the whole suite). 900 g → 31.7 oz.
    render(
      <PortionDilutionResults
        {...PROPS}
        weightUnit="oz"
        dilution={OVER}
        unknownLiquidGrams={900}
        overDilutionCertain={false}
      />,
    );
    const hedge = screen.getByText(/No portion can be sized yet/i).textContent ?? '';
    expect(hedge).toMatch(/31\.7 oz of alternative liquid/);
    expect(hedge).not.toContain(' g');
  });

  test('still asserts it when the verdict holds across the undeclared liquid\'s whole range', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={OVER}
        unknownLiquidGrams={900}
        overDilutionCertain
      />,
    );
    expect(screen.getByText(/already more dilute/i)).toBeTruthy();
  });

  test('asserts it when there is no undeclared liquid at all', () => {
    render(<PortionDilutionResults {...PROPS} dilution={OVER} unknownLiquidGrams={0} />);
    expect(screen.getByText(/already more dilute/i)).toBeTruthy();
  });
});

describe('a refusal names the one control on screen', () => {
  // There used to be a second mode here — a water:paste ratio in place of the % field —
  // and this refusal had to pick which control to name depending on which one was showing
  // (Phase 2a removed the mode from the panel; Phase 3 removed dilutionTargetWording's
  // parameters that used to select between them, spec §5). One control now, the plan's %
  // field, on screen in every state, so there is one name and one remedy to give, always.
  const OVER = {
    ...RESULT,
    dilutionWaterGrams: 0,
    soapConcentrationPercent: 90,
    targetExceedsPaste: true,
  };

  test('the computed-paste refusal points at the target concentration field', () => {
    render(<PortionDilutionResults {...PROPS} dilution={OVER} />);
    const refusal = screen.getByText(/no dilution water to divide up/i);
    expect(refusal.textContent).toMatch(/target concentration/i);
  });

  test('dilutionTargetWording names the target and its remedy unconditionally', () => {
    expect(dilutionTargetWording()).toEqual({
      named: 'the target above',
      remedy: 'Lower the target concentration above (more water)',
    });
  });
});



test('a valid measured paste sizes a portion even when targetExceedsPaste is set — the measurement outranks the computed flag (Task 5)', () => {
  // targetExceedsPaste was derived from the recipe's ASSUMED cook water (dilutionWaterGrams
  // clamped to 0 here). The measured paste (1,500 g) is direct evidence against that
  // assumption and is valid — between the 1,200 g anhydrous floor and the 4,000 g solution
  // ceiling — so the portion must compute from it instead of refusing.
  render(
    <PortionDilutionResults
      {...PROPS}
      dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }}
      measuredPasteGrams="1500"
      targetMl="1000"
    />,
  );
  expect(screen.queryByText(/already more dilute/i)).toBeNull();
  expect(screen.getByText('386 g')).toBeTruthy(); // paste to weigh out for a 1,000 ml portion
  expect(screen.getByText(/^644 g/)).toBeTruthy(); // water to add for that portion
});

test('a measured paste replaces the computed one and moves the water to match', () => {
  // Predicted paste is 1,600 g. Measured 1,480 g (the cook evaporated 120 g), so the
  // water must rise by the same 120 g to still reach the recipe's solution weight.
  render(
    <PortionDilutionResults
      {...PROPS}
     
      measuredPasteGrams="1480"
      targetMl="3883"
    />,
  );
  expect(screen.getByText('1,480 g')).toBeTruthy();
  expect(screen.getByText(/^2,520 g/)).toBeTruthy();
});

test('shows the water:paste ratio the reference dilutes by', () => {
  render(<PortionDilutionResults {...PROPS} measuredPasteGrams="1600" targetMl="1942" />);
  expect(screen.getByText(/1\.5 : 1/)).toBeTruthy();
});

test('the water:paste ratio never renders as 0.0 beside a real water figure', () => {
  // Measured paste 3,900 g against a 4,000 g solution leaves only 100 g of water — a real,
  // nonzero figure — but a ratio of 100/3900 ≈ 0.0256 rounds to "0.0" at one decimal place,
  // which reads as "no water" beside a water-to-add figure that is not zero.
  render(<PortionDilutionResults {...PROPS} targetMl="1000" measuredPasteGrams="3900" />);
  expect(screen.queryByText(/^0\.0 : 1/)).toBeNull();
  // What it renders instead, asserted positively: "no 0.0" is equally satisfied by no
  // ratio row at all, which is not the behaviour being pinned.
  expect(screen.getByText('Water : paste').closest('div')!.textContent).toMatch(/0\.03 : 1/);
  expect(screen.getByText('Water to add').closest('div')!.textContent).toContain('26 g');
});

test('flags how far the measured paste drifted from the predicted one', () => {
  render(<PortionDilutionResults {...PROPS} measuredPasteGrams="1480" targetMl="1000" />);
  expect(screen.getByText(/120 g lighter than predicted/)).toBeTruthy();
  // DilutionPanel's batch row now uses the measurement too (see its own
  // batchDilutionWaterGrams), so this drift note must not claim otherwise.
  expect(screen.queryByText(/still use the predicted weight/i)).toBeNull();
  // Those figures are no longer "above" — they are behind the scope toggle, and only one
  // scope's figures are on screen at a time. Name the scope, not a position.
  expect(screen.getByText(/Whole batch scope uses your measurement too/i)).toBeTruthy();
  expect(screen.queryByText(/batch figures above/i)).toBeNull();
});

test('without a measurement the computed paste carries the evaporation caveat — and only that', () => {
  render(<PortionDilutionResults {...PROPS} targetMl="1000" />);
  const caveat = screen.getByText(/boils off water the recipe still counts/i);
  expect(caveat).toBeTruthy();
  // The caveat used to add "an alternative liquid's solids are mass it never counted" —
  // true while the portion ran on the recipe's water-only paste, false from the moment it
  // started running on the corrected pot, which counts them. "Paste to weigh out" sits two
  // paragraphs above it, so the claim was contradicted by the figure it described.
  expect(caveat.textContent).not.toMatch(/never counted/i);
  expect(caveat.textContent).not.toMatch(/solids/i);
});

test('refuses a measurement below the anhydrous soap weight — not physically a paste', () => {
  // The paste always contains all the anhydrous soap (1,200 g here); solids do not
  // evaporate. A smaller reading is a mis-tare or a portion weight, and treating it as a
  // batch produced confident nonsense ("1,599 g lighter — water lost to the cook").
  // The alert that says so now renders beside the INPUT, in DilutionPanel's shell, so it
  // reaches both scopes; this component only has to stop computing from the bad reading.
  const { rerender } = render(
    <PortionDilutionResults {...PROPS} targetMl="1000" measuredPasteGrams="900" />,
  );
  expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
  // Control: the refusal must be attributable to the READING. 1,480 g clears the same
  // 1,200 g floor and computes, so the blank above is a decision, not a broken render.
  rerender(<PortionDilutionResults {...PROPS} targetMl="1000" measuredPasteGrams="1480" />);
  expect(screen.getByText('Paste to weigh out')).toBeTruthy();
});

test('refuses a measured paste that exceeds the target solution — the alert for it lives beside the input', () => {
  const { rerender } = render(
    <PortionDilutionResults {...PROPS} targetMl="1000" measuredPasteGrams="4100" />,
  );
  expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
  // Control, as above: 1,480 g sits under the same 4,000 g solution ceiling and computes.
  rerender(<PortionDilutionResults {...PROPS} targetMl="1000" measuredPasteGrams="1480" />);
  expect(screen.getByText('Paste to weigh out')).toBeTruthy();
});

describe('the drift note quotes the clamp-free whole-batch paste (Commit 2)', () => {
  // Verified trace: 100 g anhydrous, 150 g cook water, 50% target. solutionGrams = 200,
  // totalWaterGrams = 100 < cook (150), so targetExceedsPaste clamps dilutionWaterGrams to
  // 0. Core's own predictedPasteGrams (anhydrous + max(0, totalWater - dilutionWater)) is
  // then 100 + 100 = 200 g — understated, because the clamp erased the 150 g of real cook
  // water. The view model's wholeBatchPasteGrams (anhydrous + cookWaterGrams, clamp-free)
  // is the true 250 g, and the drift note has to be measured against that one.
  const dilution: DilutionResult = {
    anhydrousGrams: 100,
    solutionGrams: 200,
    totalWaterGrams: 100,
    dilutionWaterGrams: 0,
    glycerinGrams: 0,
    soapConcentrationPercent: 50,
    targetExceedsPaste: true,
  };
  const wholeBatchPasteGrams = 250;

  test('the whole-batch drift note quotes the clamp-free 250 g basis, not the clamped 200 g predicted figure', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="100"
        measuredPasteGrams="180"
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    // 180 − 250 = 70 g lighter. The old, buggy comparison (180 − 200) would have said 20 g.
    expect(screen.getByText(/70 g lighter than predicted/)).toBeTruthy();
    expect(screen.queryByText(/20 g lighter than predicted/)).toBeNull();
  });

  test('quotes the drift in the app-wide unit', () => {
    // Same 70 g drift, oz mode: the note sits directly under a portion grid the unit
    // rewire already governs, so a drift left in grams would put "2.5 oz of water"
    // figures above "70 g lighter" prose about the same paste (mutation-verified: this
    // call regressing to grams passed the whole suite). 70 g → 2.5 oz.
    render(
      <PortionDilutionResults
        {...PROPS}
        weightUnit="oz"
        dilution={dilution}
        targetMl="100"
        measuredPasteGrams="180"
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    const note = screen.getByText(/lighter than predicted/).textContent ?? '';
    expect(note).toMatch(/2\.5 oz lighter than predicted/);
    expect(note).not.toMatch(/70 g/);
  });
});



describe('a portion core refuses is explained, never left blank', () => {
  // The three rejection rules bound the READING against whole-batch figures, while
  // lsPartialDilution's own feasibility test depends on the RECIPE: it returns null
  // whenever the pot's paste already weighs more than the solution that pot's own soap
  // makes at the target (ls-yield's `potSolutionGrams - pasteGrams < 0`). A reading all
  // rules accept can still land there — and `pasteAlreadyThinner` cannot explain it, because
  // that flag requires there to be NO valid measurement. Both render branches were false and
  // this component emitted an empty fragment: no figures, no alert, no reason.

  // 1,000 g anhydrous at a 33% target → a 3,030 g solution and 2,030 g of total water;
  // 1,900 g of cook water still leaves 130 g of dilution water, so targetExceedsPaste is
  // FALSE. But a split liquid's 200 g of non-water solids make the TRUE whole-batch paste
  // 3,100 g — heavier than the 3,030 g solution — so the batch really is already thinner
  // than 33%, which the recipe's own flag structurally cannot see.
  const anhydrousGrams = 1000;
  const cookWaterGrams = 1900;
  const solutionGrams = anhydrousGrams / 0.33;
  const totalWaterGrams = solutionGrams - anhydrousGrams;
  const dilutionWaterGrams = Math.max(0, totalWaterGrams - cookWaterGrams);
  const dilution: DilutionResult = {
    anhydrousGrams, solutionGrams, totalWaterGrams, dilutionWaterGrams,
    glycerinGrams: 0, soapConcentrationPercent: 33, targetExceedsPaste: false,
  };
  const wholeBatchPasteGrams = anhydrousGrams + cookWaterGrams + 200;

  test('says why an UNMEASURED portion sizes nothing either, now that the pot includes its solids', () => {
    // Same batch, no reading at all. Once core sizes the unmeasured pot from the corrected
    // basis (round 1, finding 1) it refuses this for the same reason it refuses the reading
    // above — 3,100 g of paste against a 3,030 g solution — and targetExceedsPaste, computed
    // from water alone, cannot see it. Without this the component went silent: the exact
    // blank this describe exists to forbid.
    const { container } = render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1000"
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    expect(screen.queryByText('Paste to weigh out')).toBeNull();
    expect(container.textContent?.trim()).not.toBe('');
    expect(screen.getByText(/no dilution water to divide up/i)).toBeTruthy();
    // The control: drop the solids and the same fixture computes, so the refusal above is
    // the solids talking rather than the component refusing everything.
    cleanup();
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1000"
        wholeBatchPasteGrams={anhydrousGrams + cookWaterGrams}
      />,
    );
    expect(screen.getByText('Paste to weigh out')).toBeTruthy();
  });

  test('stays silent when a measured reading really does size a portion on the same batch', () => {
    // The positive control the refusal above needs, and a guard in its own right: the
    // unmeasured refusal must not survive a valid reading. 2,000 g on this very fixture is
    // accepted (above the anhydrous floor, below the 3,030 g solution), so the pot the
    // portion is sized from is the 2,000 g that was weighed — not the 3,100 g the recipe
    // computes — and there is dilution water to divide up after all.
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1000"
        measuredPasteGrams="2000"
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    expect(screen.getByText('Paste to weigh out')).toBeTruthy();
    expect(screen.queryByText(/no dilution water to divide up/i)).toBeNull();
  });
});

describe('an amount asked to the hundredth of a millilitre is a swallowed comma, not an ask', () => {
  // The "Amount to make (ml)" field is a number input, so a typed thousands comma commits
  // as a decimal point: 1,200 ml arrives as 1.200 — a silent 1000× shrink whose only
  // defense used to be the resulting portion looking absurd. Core is right to compute a
  // 1.2 ml ask (a tiny portion is a valid ask); the refusal is the SHELL's, judged on the
  // typed string exactly as the measured-paste field's subTenthPrecision rule is, and
  // resolved here in portionDilutionFor so every surface reading this verdict — the child's
  // figures, the shell's density caveat — suppresses together.
  test('portionDilutionFor refuses to compute from a two-decimal amount, and says why', () => {
    const state = portionDilutionFor({
      dilution: RESULT,
      targetMl: '1.200',
      measuredPasteGrams: '',
    });
    expect(state.targetMlSubTenthPrecision).toBe(true);
    expect(state.portion).toBeNull();
  });

  test('one decimal is odd but honest, and still computes — only two or more refuse', () => {
    // 1200.5 ml ≈ 30.9% of the 3,883 ml batch; and the plain 1200 control alongside.
    for (const targetMl of ['1200.5', '1200', '1.2']) {
      const state = portionDilutionFor({ dilution: RESULT, targetMl, measuredPasteGrams: '' });
      expect(state.targetMlSubTenthPrecision).toBe(false);
      expect(state.portion).not.toBeNull();
    }
  });

  test('the component renders no figures for a refused amount (positive control alongside)', () => {
    render(<PortionDilutionResults {...PROPS} targetMl="1.200" />);
    expect(screen.queryByText('Paste to weigh out')).toBeNull();
    expect(screen.queryByText('Water to add')).toBeNull();
    cleanup();
    render(<PortionDilutionResults {...PROPS} targetMl="1200.5" />);
    expect(screen.getByText('Paste to weigh out')).toBeTruthy();
  });
});

describe('jarGoverns: the plan grid stays on screen beside a filled jar record, labelled as plan (spec §2, phase 2b)', () => {
  // DEFAULT FALSE, and every test above this describe block relies on that default: the
  // primary row's bare name and the status paragraph's own prose are what every pre-2b
  // caller already gets, unchanged.
  test('the default renders the bare row name and the status paragraph', () => {
    render(<PortionDilutionResults {...PROPS} targetMl="1000" />);
    expect(screen.getByText('Water to add')).toBeTruthy();
    expect(screen.queryByText('Water to add (plan)')).toBeNull();
    // The estimate note is this fixture's own status clause (no measured paste supplied).
    expect(screen.getByText(/treat it as an estimate/i)).toBeTruthy();
  });

  test('jarGoverns labels the primary row and drops the status paragraph, leaving the figures intact', () => {
    render(<PortionDilutionResults {...PROPS} targetMl="1000" jarGoverns />);
    // The figures are unchanged — same 1,000 ml ask, same 412 g / 618 g split as the
    // default-false test above and the file's own opening test.
    expect(screen.getByText('412 g')).toBeTruthy();
    expect(screen.getByText(/^618 g/)).toBeTruthy();
    // Labelled, not bare.
    expect(screen.getByText('Water to add (plan)')).toBeTruthy();
    expect(screen.queryByText('Water to add')).toBeNull();
    // The commentary about the plan's own paste basis stands down — it would be a third
    // inline paragraph beside the jar's own two (DilutionPanel's prose budget), and none of
    // it is what a maker beside a governing jar is acting on.
    expect(screen.queryByText(/treat it as an estimate/i)).toBeNull();
  });

  test('an alternative-liquid note is not printed twice: jarGoverns suppresses this component\'s own copy', () => {
    // The shell (DilutionPanel.tsx) renders the identical note directly beside the jar's own
    // figures whenever the jar resolves, so this component must not also ride it onto its
    // own (otherwise-suppressed) status paragraph — the one path a caller could still reach
    // by passing a non-empty `altLiquidNote` unconditionally, as DilutionPanel itself does.
    render(
      <PortionDilutionResults
        {...PROPS}
        targetMl="1000"
        jarGoverns
        altLiquidNote="Top up with plain distilled water only."
      />,
    );
    expect(screen.queryByText(/Top up with plain distilled water only/)).toBeNull();
  });
});
