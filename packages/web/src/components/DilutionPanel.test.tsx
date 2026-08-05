// @vitest-environment jsdom
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DilutionPanel } from './DilutionPanel';
import type { DilutionResult } from '@soap-calc/core';

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
  measuredPasteIsRemaining: false,
  onMeasuredPasteGramsChange: () => {},
  onMeasuredPasteIsRemainingChange: () => {},
  onTargetMlChange: () => {},
  onDilutionScopeChange: () => {},
};

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
    expect(summary.textContent?.toLowerCase()).toContain('general hand soap');
    expect(summary.textContent?.toLowerCase()).toContain('mechanic');
  });

  it('lists every use with its range, and says so when none fits', () => {
    render30('55');
    expect(screen.getByText(/no common use calls for 55%/i)).toBeTruthy();
    // The full table still renders as reference.
    expect(screen.getByText('Dish soap')).toBeTruthy();
    expect(screen.getByText('Baby or gentle soap')).toBeTruthy();
  });

  it('warns when the target is above what any recipe holds as a liquid', () => {
    render30('55');
    expect(screen.getByText(/above what even a coconut-heavy recipe holds/i)).toBeTruthy();
    cleanup();
    render30('30');
    expect(screen.queryByText(/above what even a coconut-heavy recipe/i)).toBeNull();
  });

  it('does not offer a hair use', () => {
    render30('12');
    expect(screen.queryByText(/^shampoo/i)).toBeNull();
    expect(screen.getByText(/not recommended for hair/i)).toBeTruthy();
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

  it('keeps the shell\'s own hedge in Custom amount scope when the child renders figures instead', () => {
    // A valid measurement outranks targetExceedsPaste, so the child sizes a portion and
    // prints no hedge at all — the shell's caveat is then the only one, and must not have
    // been suppressed by scope alone.
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
    expect(screen.getAllByText(/declare its % water/i)).toHaveLength(1);
    expect(screen.getByText(/can.t tell whether/i)).toBeTruthy();
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

test('ratio mode derives the concentration a water:paste ratio lands on', () => {
  // Paste 1,600 g (1,200 anhydrous + 400 cook water) at 2:1 → 3,200 g water added,
  // solution 4,800 g, so anhydrous is 1,200/4,800 = 25% soap.
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      cookWaterGrams={400}
      dilutionMode="ratio"
      waterPasteRatio="2"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  expect(screen.getByText(/lands at 25% soap/i)).toBeTruthy();
  expect(screen.getByText(/^3,200 g/)).toBeTruthy();
});

test('ratio mode uses cookWaterGrams for paste, not totalWater minus dilutionWater (the targetExceedsPaste clamp trap)', () => {
  // totalWaterGrams - dilutionWaterGrams would give the WRONG paste here: dilutionWaterGrams
  // is clamped to 0 when targetExceedsPaste (see the DilutionPanel cookWaterGrams prop doc
  // and PortionDilutionResults' identical trap), so the forbidden derivation would compute paste
  // as 1,200 + (133 - 0) = 1,333 g. The correct paste — from cookWaterGrams — is
  // 1,200 + 1,600 = 2,800 g. At a 1:1 ratio that is 2,800 g water to add and 21.4% soap
  // (1,200 / 5,600), not the 1,333 g / different percentage the forbidden formula implies.
  render(
    <DilutionPanel
      dilution={{
        anhydrousGrams: 1200,
        solutionGrams: 5000,
        totalWaterGrams: 133,
        dilutionWaterGrams: 0,
        glycerinGrams: 100,
        soapConcentrationPercent: 90,
        targetExceedsPaste: true,
      }}
      soapConcentrationPercent="90"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      cookWaterGrams={1600}
      dilutionMode="ratio"
      waterPasteRatio="1"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  expect(screen.getByText(/^2,800 g/)).toBeTruthy();
  expect(screen.queryByText(/^1,333 g/)).toBeNull();
  expect(screen.getByText(/lands at 21.4% soap/i)).toBeTruthy();
});

describe('ratio mode weighs the paste the rest of the panel already knows about', () => {
  // anhydrousGrams + cookWaterGrams counts only the WATER fraction of an alternative
  // liquid; its non-water solids are real mass sitting in the pot. This panel is HANDED the
  // corrected figure (wholeBatchPasteGrams — it forwards it to PortionDilutionResults and
  // quotes it in the remaining-mode ceiling alert) and then computed the ratio against the
  // water-only one anyway. 300 g anhydrous, 100 g cook water, plus 100 g of split liquid at
  // 30% water = 70 g of solids → a 470 g pot. At 2:1 that is 940 g of water; the water-only
  // 400 g basis prescribed 800 g — 140 g short, against a basis the panel itself calls
  // wrong two paragraphs up.
  const dilution = {
    anhydrousGrams: 300, solutionGrams: 1000, totalWaterGrams: 700,
    dilutionWaterGrams: 600, glycerinGrams: 25, soapConcentrationPercent: 30,
    targetExceedsPaste: false,
  };
  const ratioProps = {
    ...BASE,
    dilution,
    dilutionScope: 'batch' as const,
    targetMl: '',
    cookWaterGrams: 100,
    dilutionMode: 'ratio' as const,
    waterPasteRatio: '2',
    onDilutionModeChange: () => {},
    onWaterPasteRatioChange: () => {},
  };

  it('prefers the corrected whole-batch paste over the water-only figure', () => {
    render(<DilutionPanel {...ratioProps} wholeBatchPasteGrams={470} />);
    expect(screen.getByText(/^940 g/)).toBeTruthy();
    expect(screen.queryByText(/^800 g/)).toBeNull();
    // 300 / (470 + 940) = 21.3% soap, not the 25% the water-only basis implied.
    expect(screen.getByText(/lands at 21.3% soap/i)).toBeTruthy();
  });

  it('quotes the same paste the remaining-mode ceiling alert does', () => {
    // The contradiction that made this visible: the alert named 470 g while the pour
    // figure was computed off 400 g, on one screen.
    render(
      <DilutionPanel
        {...ratioProps}
        wholeBatchPasteGrams={470}
        measuredPasteGrams="600"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/more than the 470 g/i);
    expect(screen.getByText(/^940 g/)).toBeTruthy();
  });

  it('falls back to anhydrous + cook water when no corrected figure is supplied', () => {
    render(<DilutionPanel {...ratioProps} />);
    expect(screen.getByText(/^800 g/)).toBeTruthy();
    expect(screen.getByText(/lands at 25% soap/i)).toBeTruthy();
  });

  it('still lets a valid measured paste outrank both', () => {
    // The reference's ratio method is applied to a weighed paste; a measurement is direct
    // evidence and beats every computed basis. 500 g is between the 300 g anhydrous floor
    // and the 1,000 g solution ceiling: 500 × 2 = 1,000 g of water. Read off the ratio row
    // itself — the Finished solution row is coincidentally 1,000 g too.
    render(<DilutionPanel {...ratioProps} wholeBatchPasteGrams={470} measuredPasteGrams="500" />);
    const ratioRow = screen.getByText('Water to add at this ratio').closest('div')!;
    expect(ratioRow.textContent).toMatch(/1,000 g/);
    expect(ratioRow.textContent).not.toMatch(/940 g/);
  });
});

test('ratio mode writes the derived concentration back once the ratio is actually edited, so downstream consumers reconcile', () => {
  // The ratio is an alternative way to CHOOSE the concentration, not a parallel result:
  // without this write-back, vm.dilution / PortionDilutionResults / BatchSheet
  // would all keep showing the old persisted concentration's figures beside this panel's.
  // But the write-back must not fire on mode entry alone (see the dedicated describe
  // block below) — this test touches the ratio input first, as a real edit would. The
  // fired value ('2.5') only needs to differ from the current DOM value so React actually
  // dispatches the change (same-value change events on a controlled input are a no-op);
  // the mocked onWaterPasteRatioChange doesn't feed a new value back into the `waterPasteRatio`
  // prop, so the write-back below still derives from the original ratio prop ('2' → 25%).
  const onSoapConcentrationChange = vi.fn();
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={onSoapConcentrationChange}
      weightUnit="g"
      cookWaterGrams={400}
      dilutionMode="ratio"
      waterPasteRatio="2"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText('Water to paste ratio'), { target: { value: '2.5' } });
  expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
});

test('re-syncs the ratio write-back when soapConcentrationPercent changes externally (e.g. opening a recipe file) with the ratio inputs unmoved', () => {
  // Opening a recipe file (or any external change) can replace soapConcentrationPercent
  // without touching dilutionMode, waterPasteRatio, or cookWaterGrams — the effect's old
  // deps (dilutionMode, clampedRatioConcentrationPercent only) would then never re-fire,
  // since the derived ratio value is unchanged, leaving the newly-imported target on
  // screen while the ratio's own readout ("lands at 25% soap") still speaks of the OLD
  // ratio-derived number. soapConcentrationPercent must be a dep so the effect re-syncs —
  // but only once the ratio has actually been touched (fireEvent.change below), matching
  // the write-back's own gate.
  const onSoapConcentrationChange = vi.fn();
  const { rerender } = render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={onSoapConcentrationChange}
      weightUnit="g"
      cookWaterGrams={400}
      dilutionMode="ratio"
      waterPasteRatio="2"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText('Water to paste ratio'), { target: { value: '2.5' } });
  expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
  onSoapConcentrationChange.mockClear();
  rerender(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="35"
      onSoapConcentrationChange={onSoapConcentrationChange}
      weightUnit="g"
      cookWaterGrams={400}
      dilutionMode="ratio"
      waterPasteRatio="2"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
});

describe('ratio mode does not silently rewrite the saved target on mode entry alone', () => {
  // Bug: App seeds waterPasteRatio to '2', and the write-back effect fired on mode ENTRY
  // with no user edit. So opening a recipe at 30%, clicking the ratio radio, and clicking
  // back silently read 25% — written through setSettings, so undo/redo (which only wraps
  // oil-line edits) could not recover it, and autosave/export picked it up. The field
  // looked identical whether the user typed it or the mode wrote it.
  test('mounting directly in ratio mode with no edit to the ratio leaves soapConcentrationPercent untouched', () => {
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        dilution={RESULT}
        soapConcentrationPercent="30"
        onSoapConcentrationChange={onSoapConcentrationChange}
        weightUnit="g"
        cookWaterGrams={400}
        dilutionMode="ratio"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });

  test('leaving ratio mode again without ever editing the ratio still leaves soapConcentrationPercent untouched', () => {
    const onSoapConcentrationChange = vi.fn();
    const { rerender } = render(
      <DilutionPanel
        dilution={RESULT}
        soapConcentrationPercent="30"
        onSoapConcentrationChange={onSoapConcentrationChange}
        weightUnit="g"
        cookWaterGrams={400}
        dilutionMode="ratio"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    rerender(
      <DilutionPanel
        dilution={RESULT}
        soapConcentrationPercent="30"
        onSoapConcentrationChange={onSoapConcentrationChange}
        weightUnit="g"
        cookWaterGrams={400}
        dilutionMode="concentration"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });

  test('editing the ratio does write the derived concentration back', () => {
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        dilution={RESULT}
        soapConcentrationPercent="30"
        onSoapConcentrationChange={onSoapConcentrationChange}
        weightUnit="g"
        cookWaterGrams={400}
        dilutionMode="ratio"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Water to paste ratio'), { target: { value: '3' } });
    expect(onSoapConcentrationChange).toHaveBeenCalled();
  });

  test('an earlier touch does not survive a mode change: leaving ratio mode and returning without a fresh edit does not revert an intervening concentration edit', () => {
    // Review round 2, finding 1: reproduced sequence — edit the ratio once (writes back,
    // touched=true forever); switch to concentration mode and type an exact target
    // directly (40%); switch BACK to ratio mode without touching the ratio field again.
    // The old code's `ratioTouched && dilutionMode === 'ratio'` guard was still satisfied
    // by the EARLIER touch, so it fired on re-entry alone and silently reverted the
    // typed 40% back to the ratio's own 25% — no visual difference, no undo. touched must
    // reset on every mode change so each entry into ratio mode needs its own edit.
    const onSoapConcentrationChange = vi.fn();
    const { rerender } = render(
      <DilutionPanel
        dilution={RESULT}
        soapConcentrationPercent="30"
        onSoapConcentrationChange={onSoapConcentrationChange}
        weightUnit="g"
        cookWaterGrams={400}
        dilutionMode="ratio"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    // Edit the ratio once — writes back (25%).
    fireEvent.change(screen.getByLabelText('Water to paste ratio'), { target: { value: '2.5' } });
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
    onSoapConcentrationChange.mockClear();

    // Switch to concentration mode and type an exact target directly (40%, simulated as
    // App would re-render this panel after the edit lands in settings).
    rerender(
      <DilutionPanel
        dilution={RESULT}
        soapConcentrationPercent="40"
        onSoapConcentrationChange={onSoapConcentrationChange}
        weightUnit="g"
        cookWaterGrams={400}
        dilutionMode="concentration"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();

    // Switch back to ratio mode WITHOUT touching the ratio field.
    rerender(
      <DilutionPanel
        dilution={RESULT}
        soapConcentrationPercent="40"
        onSoapConcentrationChange={onSoapConcentrationChange}
        weightUnit="g"
        cookWaterGrams={400}
        dilutionMode="ratio"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });
});

describe('ratio mode says so while the ratio has not been applied to anything below it', () => {
  // The write-back deliberately waits for a real edit (see the describe above), so simply
  // selecting ratio mode leaves the panel telling two stories at once: "Water to add at
  // this ratio 3,200 g" and "2:1 lands at 25% soap" above, but a grid still computed at
  // the saved 30% (4,000 g solution, 2,800 g total water) below — and a printed sheet
  // saying 2,400 g. Three numbers, no statement anywhere that they answer different
  // questions. The line must NOT be a write-back: entering the mode must still change
  // nothing.
  const ratioProps = {
    ...BASE,
    dilutionScope: 'batch' as const,
    targetMl: '',
    cookWaterGrams: 400,
    dilutionMode: 'ratio' as const,
    waterPasteRatio: '2',
    onDilutionModeChange: () => {},
    onWaterPasteRatioChange: () => {},
  };

  it('names both the saved target and the ratio\'s own concentration, and keeps the ratio block visible', () => {
    render(<DilutionPanel {...ratioProps} />);
    const note = screen.getByText(/not applied yet/i);
    // Pinned to their ROLES, not merely to their presence somewhere in the sentence. Asserting
    // only /30%/ and /25%/ let a swapped pair — "your saved 25% target … not the 30% above",
    // exactly backwards — pass the whole suite; same failure mode the exceeds-solution remedy
    // copy closed earlier. The saved target is the one still in force; the ratio's figure is
    // the one nothing below is using yet.
    expect(note.textContent).toMatch(/saved 30% target/);
    expect(note.textContent).toMatch(/not the 25% above/);
    // No promise about where a single edit lands: from this untouched 2:1 / saved-30% state,
    // the one edit the ratio input's own step offers (2 → 2.5) sets the target to 21.4%, not
    // 25% — 25% needs a round trip (2 → 2.5 → 2), because the write-back waits for a touch.
    expect(note.textContent).not.toMatch(/move them to/);
    // The ratio block is what the maker came to ratio mode for — it stays.
    expect(screen.getByText('Water to add at this ratio')).toBeTruthy();
    expect(screen.getByText(/^3,200 g/)).toBeTruthy();
    // ...and the rows below still answer at the saved 30%, which is the split being named.
    expect(screen.getByText(/^4,000 g/)).toBeTruthy();
  });

  it('says nothing once the ratio has actually been edited — that write-back reconciles them', () => {
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel {...ratioProps} onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    // A different value than the current one, or React dedupes the change and no edit is
    // registered at all. waterPasteRatio is App-owned and the handler here is a no-op, so
    // the prop stays at 2 and the write-back still derives that ratio's own 25%.
    fireEvent.change(screen.getByLabelText('Water to paste ratio'), { target: { value: '3' } });
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
    expect(screen.queryByText(/not applied yet/i)).toBeNull();
  });

  it('says nothing when the ratio already lands on the saved target', () => {
    render(
      <DilutionPanel
        {...ratioProps}
        soapConcentrationPercent="25"
        dilution={{ ...RESULT, soapConcentrationPercent: 25 }}
      />,
    );
    expect(screen.queryByText(/not applied yet/i)).toBeNull();
  });

  it('says nothing when the ratio lands near enough to the saved target to print the same figure twice', () => {
    // The 0.05 tolerance is load-bearing, and it is reachable: the concentration field accepts
    // 25.02, and 2:1 on this paste (1,200 g anhydrous + 400 g cook water → 4,800 g solution)
    // lands at exactly 25.0. The two differ by 0.02 — a real difference, but smaller than the
    // 0.1 the write-back rounds to, so there is no split to report. Without the tolerance the
    // note renders and reads "your saved 25% target, not the 25% above": the same number
    // twice, since formatConcentrationPercent rounds both to one decimal.
    render(
      <DilutionPanel
        {...ratioProps}
        soapConcentrationPercent="25.02"
        dilution={{ ...RESULT, soapConcentrationPercent: 25.02 }}
      />,
    );
    expect(screen.queryByText(/not applied yet/i)).toBeNull();
    // The ratio's own readout is still there — this is a suppressed SPLIT, not a suppressed mode.
    expect(screen.getByText(/lands at 25% soap/i)).toBeTruthy();
  });

  it('is not a write-back: rendering it leaves the saved target untouched', () => {
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel {...ratioProps} onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    expect(screen.getByText(/not applied yet/i)).toBeTruthy();
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });

  it('carries into Custom amount scope, where the portion figures use the saved target too', () => {
    render(<DilutionPanel {...ratioProps} dilutionScope="portion" targetMl="1000" />);
    expect(screen.getByText(/not applied yet/i)).toBeTruthy();
  });

  it('says nothing in concentration mode', () => {
    render(<DilutionPanel {...ratioProps} dilutionMode="concentration" />);
    expect(screen.queryByText(/not applied yet/i)).toBeNull();
  });

  it('does not let the 1–99% clamp alert claim the clamped value is in use while this note says it is not', () => {
    // Both paragraphs render together for an untouched extreme ratio, and they contradicted
    // each other: the clamp alert said 1% "is used instead" while this note said the saved 30%
    // is still what everything below runs on. Nothing has been written back in the untouched
    // state, so the clamp alert's tense must be conditional — what WOULD be used.
    render(<DilutionPanel {...ratioProps} waterPasteRatio="100000" />);
    const clamp = screen.getByText(/outside the 1.99% range/i);
    expect(clamp.textContent).toMatch(/1% would be used instead/);
    expect(clamp.textContent).not.toMatch(/1% is used instead/);
    // The pair really is on screen together — that is what made the contradiction visible.
    expect(screen.getByText(/not applied yet/i).textContent).toMatch(/saved 30% target/);
  });

  it('lets the clamp alert speak in the present tense once the ratio has been applied', () => {
    // The mirror of the case above: after a real edit the write-back has fired, so the clamped
    // value genuinely IS the target every figure below is using, and the not-applied note is gone.
    render(<DilutionPanel {...ratioProps} waterPasteRatio="100000" />);
    fireEvent.change(screen.getByLabelText('Water to paste ratio'), { target: { value: '100001' } });
    const clamp = screen.getByText(/outside the 1.99% range/i);
    expect(clamp.textContent).toMatch(/1% is used instead/);
    expect(clamp.textContent).not.toMatch(/would be used/);
    expect(screen.queryByText(/not applied yet/i)).toBeNull();
  });
});

test('extreme ratio clamps the written-back concentration so the ratio panel cannot vanish', () => {
  // At a 100,000:1 ratio the true derived concentration rounds to 0.0%. calculateDilution
  // only accepts (0, 100) exclusive, so writing 0 back would null out `dilution` upstream —
  // and since this whole ratio UI is gated on `dilution`, it would silently vanish with no
  // way back except switching modes. The write-back must clamp into range, and the panel
  // must say so rather than just silently substituting a different number. Requires an
  // edit first (fireEvent.change below) — see the write-back's touched gate.
  const onSoapConcentrationChange = vi.fn();
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={onSoapConcentrationChange}
      weightUnit="g"
      cookWaterGrams={400}
      dilutionMode="ratio"
      waterPasteRatio="100000"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText('Water to paste ratio'), { target: { value: '100001' } });
  expect(onSoapConcentrationChange).toHaveBeenCalledWith('1');
  expect(onSoapConcentrationChange).not.toHaveBeenCalledWith('0');
  expect(screen.getByText(/outside the 1.99% range/i)).toBeTruthy();
});

test('invalid ratio explains why the ratio results vanished instead of just vanishing', () => {
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      cookWaterGrams={400}
      dilutionMode="ratio"
      waterPasteRatio="0"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  expect(screen.getByText(/ratio greater than zero/i)).toBeTruthy();
  expect(screen.queryByText(/lands at/i)).toBeNull();
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
  expect(screen.getByText(/uses your measured paste/i)).toBeTruthy();
});

test('a measurement declared as what is left after earlier dilutions does NOT correct the batch row — it is not the batch', () => {
  // Same 1,480 g reading as above, but declared "remaining" — the batch row must keep
  // showing the recipe's own computed 2,400 g, not a figure derived from a partial pot.
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      measuredPasteGrams="1480"
      measuredPasteIsRemaining
    />,
  );
  expect(screen.getByText(/^2,400 g/)).toBeTruthy();
  expect(screen.queryByText(/^2,520 g/)).toBeNull();
  expect(screen.queryByText(/uses your measured paste/i)).toBeNull();
});

test('the measured-paste hint names "Dilution water" explicitly in concentration mode', () => {
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      measuredPasteGrams="1480"
      dilutionMode="concentration"
    />,
  );
  expect(screen.getByText(/Dilution water above uses your measured paste/i)).toBeTruthy();
});

test('ratio mode + a measured paste: the hint names the ratio figure, not the suppressed "Dilution water" row', () => {
  // In ratio mode the main grid's "Dilution water to add" row is suppressed (see the
  // "does not show a competing" test below), so a hint that still said "Dilution water
  // above" would land positionally on Total water/Glycerin — neither of which is
  // measurement-corrected. The hint must name the actual corrected figure instead: "Water
  // to add at this ratio" (ratio mode's own pasteGrams already prefers a valid measurement).
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      cookWaterGrams={400}
      measuredPasteGrams="1480"
      dilutionMode="ratio"
      waterPasteRatio="2"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  expect(screen.queryByText(/^Dilution water above uses your measured paste/i)).toBeNull();
  expect(
    screen.getByText(/Water to add at this ratio above uses your measured paste/i),
  ).toBeTruthy();
});

test('ratio mode: a valid measured paste wins over the computed anhydrous + cook water', () => {
  // Computed paste would be 1,200 + 400 = 1,600 g. Measured 1,480 g (valid: between the
  // 1,200 g anhydrous floor and the 4,000 g solution ceiling) must be used instead, since
  // the reference's ratio method is applied to a weighed paste. At 2:1: 1,480 * 2 = 2,960 g
  // water, solution 4,440 g, so anhydrous is 1,200 / 4,440 = 27.0% soap — not the 25.0%
  // (1,200 / 4,800) the computed paste would have produced (see the earlier ratio test).
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      cookWaterGrams={400}
      measuredPasteGrams="1480"
      dilutionMode="ratio"
      waterPasteRatio="2"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  expect(screen.getByText(/^2,960 g/)).toBeTruthy();
  expect(screen.getByText(/lands at 27% soap/i)).toBeTruthy();
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

test('ratio mode does not show a competing "Dilution water to add" figure from the main grid', () => {
  // In ratio mode the ratio block already owns the water-to-add figure ("Water to add at
  // this ratio"). The main grid's own "Dilution water to add" row reflects whatever
  // concentration is currently PERSISTED — which the write-back narrows toward the ratio's
  // figure but rarely closes exactly (0.1% rounding), and under the 1-99% clamp can differ
  // by orders of magnitude — so showing both bare figures at once misleads about which
  // number to actually pour. The main grid must not render that row in ratio mode.
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      cookWaterGrams={400}
      dilutionMode="ratio"
      waterPasteRatio="2"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  expect(screen.getByText('Water to add at this ratio')).toBeTruthy();
  expect(screen.queryByText('Dilution water to add')).toBeNull();
});

test('concentration mode still shows "Dilution water to add" in the main grid', () => {
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      dilutionMode="concentration"
    />,
  );
  expect(screen.getByText('Dilution water to add')).toBeTruthy();
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

it('names the measurement declaration without repeating "whole batch"', () => {
  render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
  expect(screen.getByLabelText('all of it')).toBeTruthy();
  expect(screen.getByLabelText("what's left after earlier dilutions")).toBeTruthy();
});

// Moved from the old PartialDilution.test.tsx: these drove the measured-paste input, the
// declaration radios or the ml field, all of which now live in this shell rather than in
// PortionDilutionResults.
describe('portion scope: the measured-paste input and declaration that used to live in PartialDilution', () => {
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
    expect(screen.getByLabelText('Measured paste weight (g)')).toBeTruthy();
    expect(screen.getByText(/already more dilute/i)).toBeTruthy();
  });

  it('labels the measured-paste field without qualifying it as the whole batch — that distinction now lives in the declaration radios below it', () => {
    render(<DilutionPanel {...BASE} dilutionScope="portion" targetMl="1000" />);
    expect(screen.getByLabelText('Measured paste weight (g)')).toBeTruthy();
  });

  it('defaults to the "all of it" declaration', () => {
    render(
      <DilutionPanel {...BASE} dilutionScope="portion" targetMl="1000" measuredPasteGrams="1480" />,
    );
    expect(screen.getByRole('radio', { name: /all of it/i })).toHaveProperty('checked', true);
    expect(
      screen.getByRole('radio', { name: /what.s left after earlier dilutions/i }),
    ).toHaveProperty('checked', false);
  });

  it('the remaining-ceiling alert points back at the declaration radio by its actual rendered label, not a stale one', () => {
    // Regression pin: an earlier version of this alert quoted "the whole batch, before any
    // dilution" — the pre-rename label — after the declaration radio itself was renamed to
    // "all of it" in this shell, leaving the alert telling the maker to pick an option that
    // exists nowhere in the UI. RESULT's predicted whole-batch paste is 1,200 g anhydrous +
    // 400 g cook water = 1,600 g (see the equivalent PortionDilutionResults tests); 2,000 g
    // declared "remaining" exceeds it, so the ceiling alert fires.
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="portion"
        targetMl="1000"
        measuredPasteGrams="2000"
        measuredPasteIsRemaining
      />,
    );
    // Read the label live off the actual radio rather than hardcoding the string a second
    // time in this test — a copy-pasted literal would keep "passing" even if the radio's
    // real label and the alert's quoted phrase drifted apart again on the next rename. Only
    // asking the radio for its own label catches that divergence.
    const declarationRadio = screen.getByRole('radio', { name: /all of it/i });
    const declaredLabel = declarationRadio.closest('label')?.textContent?.trim();
    expect(declaredLabel).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(declaredLabel);
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
    {
      what: 'a remainder heavier than the whole batch ever was',
      props: { measuredPasteGrams: '2000', measuredPasteIsRemaining: true },
      match: /ever weighed/i,
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

  it('quotes the corrected whole-batch basis in the remaining-mode ceiling alert, not the water-only predicted figure', () => {
    // Moved here with the alert itself (it used to be pinned in PortionDilutionResults):
    // 1,000 g anhydrous + 600 g cook water = 1,600 g water-only predicted paste, but a
    // split liquid's 100 g of non-water solids make the TRUE whole-batch paste 1,700 g.
    const anhydrousGrams = 1000;
    const solutionGrams = anhydrousGrams / 0.33;
    const dilutionWaterGrams = solutionGrams - 1600;
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams,
          solutionGrams,
          dilutionWaterGrams,
          totalWaterGrams: 600 + dilutionWaterGrams,
          glycerinGrams: 0,
          soapConcentrationPercent: 33,
          targetExceedsPaste: false,
        }}
        wholeBatchPasteGrams={1700}
        measuredPasteGrams="3000"
        measuredPasteIsRemaining
        dilutionScope="batch"
        targetMl=""
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/more than the 1,700 g/i);
    expect(screen.getByRole('alert').textContent).not.toMatch(/more than the 1,600 g/i);
  });

  it('names the clamp-free whole-batch basis, so the ceiling and the drift note never quote two different figures', () => {
    // Also moved here with the alert. 100 g anhydrous + 150 g cook water at a 50% target:
    // targetExceedsPaste clamps dilutionWaterGrams to 0, which understates core's own
    // predicted paste at 200 g; the view model's clamp-free figure is the true 250 g, and
    // PortionDilutionResults' drift note quotes that same 250 g.
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams: 100,
          solutionGrams: 200,
          totalWaterGrams: 100,
          dilutionWaterGrams: 0,
          glycerinGrams: 0,
          soapConcentrationPercent: 50,
          targetExceedsPaste: true,
        }}
        wholeBatchPasteGrams={250}
        measuredPasteGrams="300"
        measuredPasteIsRemaining
        dilutionScope="batch"
        targetMl=""
      />,
    );
    // 300 g breaks both the solution ceiling and the whole-batch ceiling, so both alerts
    // fire — pick the whole-batch one by its own wording, since the solution alert quotes
    // the 200 g solution and would satisfy a looser match by accident.
    const ceiling = screen
      .getAllByRole('alert')
      .find((a) => /ever weighed/i.test(a.textContent ?? ''));
    expect(ceiling?.textContent).toMatch(/more than the 250 g/i);
    expect(ceiling?.textContent).not.toMatch(/200 g/);
  });

  it('the below-solids alert points at the declaration radio by its actual rendered label, not at the scope toggle', () => {
    // The old copy ended "enter the whole batch rather than the portion you are diluting",
    // and the only on-screen control now reading "Whole batch" is the SCOPE toggle — the
    // wrong control, and the wrong remedy for a batch that has already been drawn down.
    // Same dynamic style as the remaining-ceiling pin above: read the label off the radio
    // so a rename cannot silently strand the alert.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" measuredPasteGrams="900" />);
    const remainingRadio = screen.getByRole('radio', { name: /what.s left after earlier dilutions/i });
    const declaredLabel = remainingRadio.closest('label')?.textContent?.trim();
    expect(declaredLabel).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(declaredLabel);
    // And it must not send the maker to the scope toggle instead.
    expect(screen.getByRole('alert').textContent).not.toMatch(/whole batch rather than the portion/i);
  });

  it('says why a "what\'s left" reading leaves the Whole batch row alone', () => {
    // Enter 800 g, declare it as what's left, stay on the default scope: the row answers
    // with the recipe's original 2,400 g and used to say nothing about the declaration it
    // had just ignored.
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="batch"
        targetMl=""
        measuredPasteGrams="800"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.getByText(/^2,400 g/)).toBeTruthy();
    expect(screen.getByText(/recipe.s whole batch/i)).toBeTruthy();
  });

  it('does not send the maker to Custom amount when Custom amount has nothing to size from that reading', () => {
    // Same state as PortionDilutionResults' "a portion core refuses is explained" fixture:
    // 1,000 g anhydrous at 33% → a 3,030 g solution; 1,900 g of cook water leaves 130 g of
    // dilution water so targetExceedsPaste is FALSE, but a split liquid's 200 g of solids
    // make the true whole-batch paste 3,100 g — heavier than the solution, so the batch is
    // already past 33%. A 2,000 g "what's left" reading clears every rejection rule, and
    // Custom amount still cannot size a portion from it. Pointing there was a dead end.
    const anhydrousGrams = 1000;
    const cookWaterGrams = 1900;
    const solutionGrams = anhydrousGrams / 0.33;
    const totalWaterGrams = solutionGrams - anhydrousGrams;
    render(
      <DilutionPanel
        {...BASE}
        dilution={{
          anhydrousGrams, solutionGrams, totalWaterGrams,
          dilutionWaterGrams: totalWaterGrams - cookWaterGrams,
          glycerinGrams: 0, soapConcentrationPercent: 33, targetExceedsPaste: false,
        }}
        wholeBatchPasteGrams={anhydrousGrams + cookWaterGrams + 200}
        dilutionScope="batch"
        targetMl=""
        measuredPasteGrams="2000"
        measuredPasteIsRemaining
      />,
    );
    const hint = screen.getByText(/recipe.s whole batch/i);
    expect(hint.textContent).not.toMatch(/Switch to Custom amount/i);
    expect(hint.textContent).toMatch(/already more dilute than the target/i);
  });

  it('still points at Custom amount when a portion really can be sized from the reading', () => {
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="batch"
        targetMl=""
        measuredPasteGrams="800"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.getByText(/recipe.s whole batch/i).textContent).toMatch(/Switch to Custom amount/i);
  });

  it('drops that explanation once the reading is declared as all of it', () => {
    render(
      <DilutionPanel {...BASE} dilutionScope="batch" targetMl="" measuredPasteGrams="1480" />,
    );
    expect(screen.queryByText(/recipe.s whole batch/i)).toBeNull();
    expect(screen.getByText(/uses your measured paste/i)).toBeTruthy();
  });

  it('gives the declaration radios a visible caption, not just an aria-label', () => {
    // "( ) all of it   ( ) what's left after earlier dilutions" sitting above a second
    // unlabelled radio row leaves "all of WHAT?" unanswerable on screen.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
    expect(screen.getByText('That weight is:')).toBeTruthy();
  });
});

describe('figures that belong to one scope stay in that scope; caveats that describe the recipe do not', () => {
  it('does not print the whole-batch ratio pour figure in Custom amount scope', () => {
    // 1,200 g anhydrous + 400 g cook water = 1,600 g paste; at 2:1 that is 3,200 g of water
    // for the WHOLE batch — printed in the same primary emphasis as the portion's own much
    // smaller water figure, with nothing to say which one to pour.
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="portion"
        targetMl="1000"
        cookWaterGrams={400}
        dilutionMode="ratio"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    expect(screen.queryByText('Water to add at this ratio')).toBeNull();
    expect(screen.queryByText('3,200 g')).toBeNull();
    // The target-describing copy is not an amount, so it stays in both scopes.
    expect(screen.getByText(/lands at 25% soap/i)).toBeTruthy();
  });

  it('keeps the 1–99% clamp alert in Custom amount scope — it describes the target, not the amount', () => {
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="portion"
        targetMl="1000"
        cookWaterGrams={400}
        dilutionMode="ratio"
        waterPasteRatio="100000"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    expect(screen.getByText(/outside the 1.99% range/i)).toBeTruthy();
  });

  it('still prints the ratio pour figure in Whole batch scope', () => {
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="batch"
        targetMl=""
        cookWaterGrams={400}
        dilutionMode="ratio"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    expect(screen.getByText('Water to add at this ratio')).toBeTruthy();
    expect(screen.getByText(/^3,200 g/)).toBeTruthy();
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

describe('the g/oz/lb display-unit switch', () => {
  it('shows one unit at a time and switches the dilution figures', () => {
    render(<DilutionPanel {...BASE} dilutionScope="batch" weightUnit="g" targetMl="" />);
    const water = screen.getByText('Dilution water to add').closest('div')!;
    expect(water.textContent).toContain(' g');
    expect(water.textContent).not.toContain('oz');

    fireEvent.click(screen.getByRole('radio', { name: 'oz' }));
    expect(water.textContent).toContain('oz');
    expect(water.textContent).not.toContain(' g');
  });

  it('switches the portion figures in Custom amount scope, not only the batch row', () => {
    // The switch is a panel-wide reading aid, and Custom amount is where the figures a
    // maker actually weighs out live. Regressing the one prop that carries it into
    // PortionDilutionResults leaves a maker on a lb scale flipping to "g", watching the
    // Whole-batch row obey, and then weighing out a portion still quoted in lb — with the
    // radio saying grams. 1,000 ml of RESULT is 412 g of paste and 618 g of water.
    render(<DilutionPanel {...BASE} weightUnit="g" dilutionScope="portion" targetMl="1000" />);
    const paste = () => screen.getByText('Paste to weigh out').closest('div')!;
    const water = () => screen.getByText('Water to add').closest('div')!;
    expect(paste().textContent).toContain('412 g');
    expect(water().textContent).toContain('618 g');

    fireEvent.click(screen.getByRole('radio', { name: 'lb' }));
    expect(paste().textContent).toContain('0.91 lb');
    expect(paste().textContent).not.toContain(' g');
    expect(water().textContent).toContain('1.36 lb');
    expect(water().textContent).not.toContain(' g');
    // The ratio pour figure inside the portion grid is a ratio, not a weight — it must not
    // acquire a unit from the switch.
    expect(screen.getByText('Water : paste').closest('div')!.textContent).toMatch(/1\.5 : 1/);
  });

  it('switches the ratio pour figure, the one number ratio mode exists to produce', () => {
    // Ratio mode suppresses the main grid's own "Dilution water to add" row, so this row is
    // the ONLY water figure on screen in that mode — the single most consequential place for
    // the switch to be ignored. 1,200 g anhydrous + 400 g cook water at 2:1 = 3,200 g.
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="g"
        dilutionScope="batch"
        targetMl=""
        cookWaterGrams={400}
        dilutionMode="ratio"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    const row = () => screen.getByText('Water to add at this ratio').closest('div')!;
    expect(row().textContent).toContain('3,200 g');
    fireEvent.click(screen.getByRole('radio', { name: 'oz' }));
    expect(row().textContent).toContain('112.9 oz');
    expect(row().textContent).not.toContain(' g');
  });

  it('switches every weight row of the whole-batch grid together', () => {
    // One row obeying while the rest do not is worse than none obeying: the grid reads as a
    // single set of figures for one batch, so a mixed-unit grid invites adding 2.65 lb of
    // paste to 2,800 g of water.
    render(
      <DilutionPanel {...BASE} weightUnit="g" dilutionScope="batch" targetMl="" bottledSolutionGrams={4515} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'lb' }));
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
    // Volume is millilitres in every unit — the switch is about weights only.
    expect(screen.getByText('≈ Finished volume').closest('div')!.textContent).toContain('4,383 ml');
  });

  it('switches the figures quoted inside the alternative-liquid caveats too', () => {
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
        weightUnit="g"
        dilution={dilution}
        dilutionScope="batch"
        targetMl=""
        altLiquidWaterGrams={300}
        unknownLiquidGrams={0}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'oz' }));
    expect(screen.getByText(/plain distilled water only/i).textContent).toMatch(/Already 10\.6 oz lighter/);
    cleanup();

    render(
      <DilutionPanel
        {...BASE}
        weightUnit="g"
        dilution={dilution}
        dilutionScope="batch"
        targetMl=""
        altLiquidWaterGrams={300}
        unknownLiquidGrams={300}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'oz' }));
    const floor = screen.getByText(/the LEAST you will need/i).textContent ?? '';
    expect(floor).toMatch(/10\.6 oz of alternative liquid/);
    expect(floor).toMatch(/70\.5 oz is/);
    expect(floor).not.toMatch(/2,000 g/);
  });

  it('switches the undeclared-liquid figure in the can\'t-tell hedge', () => {
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="g"
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
    fireEvent.click(screen.getByRole('radio', { name: 'oz' }));
    expect(screen.getByText(/can.t tell whether/i).textContent).toMatch(/31\.7 oz of alternative liquid/);
  });

  it('leaves the grams-only figures in grams when the switch moves', () => {
    // The exception to everything above, pinned against the SWITCH rather than against the
    // app-wide unit (the two agree on mount, so seeding alone cannot tell them apart). The
    // measured-paste field is grams-only, so the bounds on what was typed into it, and the
    // echo of the reading itself, stay in grams however the maker sets this switch.
    const REJECTIONS: [Record<string, unknown>, RegExp, RegExp][] = [
      [{ measuredPasteGrams: '900' }, /1,200 g/, /2\.65 lb/],
      [{ measuredPasteGrams: '4500' }, /4,000 g/, /8\.82 lb/],
      [{ measuredPasteGrams: '1700', measuredPasteIsRemaining: true }, /1,600 g/, /3\.53 lb/],
    ];
    for (const [props, grams, converted] of REJECTIONS) {
      render(<DilutionPanel {...BASE} weightUnit="g" dilutionScope="batch" targetMl="" {...props} />);
      fireEvent.click(screen.getByRole('radio', { name: 'lb' }));
      const alert = screen.getByRole('alert').textContent ?? '';
      expect(alert).toMatch(grams);
      expect(alert).not.toMatch(converted);
      cleanup();
    }

    // The shell's echo of an accepted reading…
    render(<DilutionPanel {...BASE} weightUnit="g" dilutionScope="batch" targetMl="" measuredPasteGrams="1480" />);
    fireEvent.click(screen.getByRole('radio', { name: 'lb' }));
    const shellEcho = screen.getByText(/uses your measured paste/i).textContent ?? '';
    expect(shellEcho).toMatch(/1,480 g/);
    expect(shellEcho).not.toMatch(/3\.26 lb/);
    // …and PortionDilutionResults' echo of a remaining one, which the switch reaches through
    // the very prop this describe block pins.
    cleanup();
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="g"
        dilutionScope="portion"
        targetMl="1000"
        measuredPasteGrams="1480"
        measuredPasteIsRemaining
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'lb' }));
    const portionEcho = screen.getByText(/scaled down from your/i).textContent ?? '';
    expect(portionEcho).toMatch(/from your 1,480 g reading/);
    expect(portionEcho).not.toMatch(/3\.26 lb/);
    // The bench figures beside it did follow the switch — otherwise this pins nothing.
    expect(screen.getByText('Paste to weigh out').closest('div')!.textContent).toContain('lb');
  });

  it('starts on the app-wide unit, falling back to grams for kg', () => {
    const checked = (name: string) =>
      (screen.getByRole('radio', { name }) as HTMLInputElement).checked;
    const { unmount } = render(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" />);
    expect(checked('lb')).toBe(true);
    unmount();
    render(<DilutionPanel {...BASE} weightUnit="kg" dilutionScope="batch" targetMl="" />);
    expect(checked('g')).toBe(true);
  });

  it('re-seeds when the app-wide unit changes underneath it', () => {
    // The test above unmounts between renders, so it only ever exercises the useState
    // initializer — the whole re-seed effect could be deleted and it would still pass. The
    // bug the effect exists to prevent is a LIVE panel: change the app-wide unit in the
    // toolbar above and this switch stays on the unit the maker has since moved away from,
    // silently quoting the dilution in a unit no other panel is using.
    const checked = (name: string) =>
      (screen.getByRole('radio', { name }) as HTMLInputElement).checked;
    const { rerender } = render(
      <DilutionPanel {...BASE} weightUnit="g" dilutionScope="batch" targetMl="" />,
    );
    expect(checked('g')).toBe(true);
    rerender(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" />);
    expect(checked('lb')).toBe(true);
    expect(screen.getByText('Dilution water to add').closest('div')!.textContent).toContain('5.29 lb');
    // kg has no radio of its own, so the fallback has to hold on a change too, not just on
    // mount — otherwise switching the app to kg strands this panel on lb.
    rerender(<DilutionPanel {...BASE} weightUnit="kg" dilutionScope="batch" targetMl="" />);
    expect(checked('g')).toBe(true);
  });

  it('does not undo the maker\'s own choice on an unrelated re-render', () => {
    // The other half of the effect: it re-seeds only when weightUnit ITSELF changed
    // (prevWeightUnitRef). Without that guard every re-render — typing in the target field,
    // a recalculated dilution — would snap the switch back to the app-wide unit mid-session.
    const checked = (name: string) =>
      (screen.getByRole('radio', { name }) as HTMLInputElement).checked;
    const { rerender } = render(
      <DilutionPanel {...BASE} weightUnit="g" dilutionScope="batch" targetMl="" />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'lb' }));
    expect(checked('lb')).toBe(true);
    rerender(
      <DilutionPanel
        {...BASE}
        weightUnit="g"
        dilutionScope="batch"
        targetMl=""
        soapConcentrationPercent="28"
        dilution={{ ...RESULT, soapConcentrationPercent: 28 }}
      />,
    );
    expect(checked('lb')).toBe(true);
  });

  it('echoes the measured paste itself in grams too — it is the number the maker typed', () => {
    // Same class as the three thresholds below, applied to the reading rather than to the
    // bounds on it: the field is grams-only ("Measured paste weight (g, optional)"), so
    // typing 1480 and flipping the panel to lb rendered "uses your measured paste
    // (3.26 lb)" — the maker's own entry, echoed back as a number they never wrote.
    render(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" measuredPasteGrams="1480" />);
    const hint = screen.getByText(/uses your measured paste/i);
    expect(hint.textContent).toMatch(/1,480 g/);
    expect(hint.textContent).not.toMatch(/3\.26 lb/);
  });

  it('has a visible caption, not just an aria-label', () => {
    // Three bare radios reading "g oz lb" beside the panel heading, with the name only in
    // aria-label — the same gap this branch closed for the declaration radios below and
    // for the same reason. Sighted makers get no antecedent at all.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
    expect(screen.getByText('Show weights in:')).toBeTruthy();
    // The radios keep their own short accessible names — every unit assertion in this file
    // selects them that way.
    expect(screen.getByRole('radio', { name: 'g' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'lb' })).toBeTruthy();
  });

  it('quotes the measured-paste thresholds in grams, the unit that field is typed in', () => {
    // The input is grams-only ("Measured paste weight (g, optional)"), so a threshold
    // quoted in the display unit made the maker convert to check a claim about the number
    // they had just typed: "less than the 2.65 lb of soap this batch makes" against a
    // typed 900. Every OTHER figure in the panel is a bench readout and stays on the
    // display unit — these three are the exception because they are about the input.
    const alertText = () => screen.getByRole('alert').textContent ?? '';

    render(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" measuredPasteGrams="900" />);
    expect(alertText()).toMatch(/1,200 g/);
    expect(alertText()).not.toMatch(/2\.65 lb/);
    cleanup();

    render(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" measuredPasteGrams="4500" />);
    expect(alertText()).toMatch(/4,000 g/);
    expect(alertText()).not.toMatch(/8\.82 lb/);
    cleanup();

    // Remaining-mode ceiling: 1,200 g anhydrous + 400 g cook water = a 1,600 g basis.
    render(
      <DilutionPanel
        {...BASE}
        weightUnit="lb"
        dilutionScope="batch"
        targetMl=""
        measuredPasteGrams="1700"
        measuredPasteIsRemaining
      />,
    );
    expect(alertText()).toMatch(/1,600 g/);
    expect(alertText()).not.toMatch(/3\.53 lb/);
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

  it('points it toward MORE water in ratio mode too, naming the control actually on screen', () => {
    // The concentration field is not rendered in ratio mode, so the remedy names the
    // ratio — and a WIDER ratio is the one that makes room for the paste already weighed.
    render(
      <DilutionPanel
        {...BASE}
        dilutionScope="batch"
        targetMl=""
        measuredPasteGrams="4500"
        cookWaterGrams={400}
        dilutionMode="ratio"
        waterPasteRatio="2"
        onDilutionModeChange={() => {}}
        onWaterPasteRatioChange={() => {}}
      />,
    );
    const alert = screen
      .getAllByRole('alert')
      .map((a) => a.textContent ?? '')
      .find((t) => /cannot be diluted to/i.test(t)) ?? '';
    expect(alert).toMatch(/raise the water:paste ratio/i);
    expect(alert).not.toMatch(/lower the water:paste ratio/i);
    expect(alert).not.toMatch(/target concentration/i);
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

it('never prints the over-dilution verdict and its own hedge on one screen', () => {
  // Custom amount scope used to assert "the paste is already more dilute than the target"
  // two paragraphs above this shell's own "can't tell whether 50% is reachable" — same
  // panel, same state, opposite verdicts. The hedge is now PortionDilutionResults' own
  // (the shell's was a verbatim duplicate of it here — see the "printed once per screen"
  // describe), so the assertion reads the hedge's substance rather than the shell's
  // wording. What must never happen is the flat verdict appearing beside either.
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
  expect(screen.queryByText(/already more dilute/i)).toBeNull();
});
