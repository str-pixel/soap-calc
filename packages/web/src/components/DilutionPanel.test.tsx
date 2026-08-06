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

/**
 * The three name sources that apply to the inputs in this panel, in the precedence the
 * accessible-name algorithm gives them: aria-label, then aria-labelledby, then the wrapping
 * <label>. Written out rather than pulled from dom-accessibility-api, which is only a
 * transitive dependency here — and writing it out is the point: the precedence IS the claim
 * being made, that an aria-label silently replaces the words on screen rather than adding
 * to them.
 */
function accessibleNameOf(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel !== null) return ariaLabel;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy !== null) return document.getElementById(labelledBy)?.textContent ?? '';
  return el.closest('label')?.textContent ?? '';
}

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
  // judges a measured reading against it) and then computed the ratio against the water-only
  // one anyway. 300 g anhydrous, 100 g cook water, plus 100 g of split liquid at
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
      for (const mode of ['concentration', 'ratio'] as const) {
        for (const reading of ['', '900', '1480', '4500', '-500']) {
          render(
            <DilutionPanel
              {...BASE}
              dilutionScope={scope}
              targetMl={scope === 'batch' ? '' : '1000'}
              dilutionMode={mode}
              waterPasteRatio="2"
              onDilutionModeChange={() => {}}
              onWaterPasteRatioChange={() => {}}
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
      for (const mode of ['concentration', 'ratio'] as const) {
        render(
          <DilutionPanel
            {...BASE}
            dilutionScope={scope}
            targetMl={scope === 'batch' ? '' : '1000'}
            dilutionMode={mode}
            waterPasteRatio="2"
            onDilutionModeChange={() => {}}
            onWaterPasteRatioChange={() => {}}
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
    // A rejected reading is the only state where this alert stacks on another, and it is
    // the one where its closing remedy is already spent: the maker weighed the pot, the
    // reading was refused above, and "or weigh the paste above" sends them back to do it
    // again. The verdict itself stays — the row fell back to the recipe's own clamped
    // figure precisely BECAUSE the reading was refused, so it still needs accounting for.
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

    // Rejected (1,950 g is heavier than the 1,900 g solution): two alerts, and the second
    // ends at the remedy.
    render(<DilutionPanel {...props} measuredPasteGrams="1950" />);
    const stacked = screen.getAllByRole('alert').map((n) => n.textContent!.replace(/\s+/g, ' '));
    expect(stacked).toHaveLength(2);
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
    const quoted = Number((hint.match(/([\d,]+) g/g) ?? [])
      .map((s) => Number(s.replace(/[, g]/g, '')))
      .find((n) => n !== 300));
    expect(quoted).toBeLessThanOrEqual(Number(row.replace(/[, g]/g, '')));
    expect(quoted).toBe(2006);
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
    // The bench figures beside it DID follow the switch — otherwise this pins nothing.
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toContain('lb');
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
    // bounds on it: the field is grams-only ("Measured paste weight — the whole batch (g, optional)"), so
    // typing 1480 and flipping the panel to lb rendered "uses your measured paste
    // (3.26 lb)" — the maker's own entry, echoed back as a number they never wrote.
    render(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" measuredPasteGrams="1480" />);
    const hint = screen.getByText(/uses your measured paste/i);
    expect(hint.textContent).toMatch(/1,480 g/);
    expect(hint.textContent).not.toMatch(/3\.26 lb/);
  });

  it('has a visible caption, not just an aria-label, and uses the app name for this control', () => {
    // Three bare radios reading "g oz lb" beside the panel heading, with the name only in
    // aria-label — the same gap this branch closed for the ratio presets below and
    // for the same reason. Sighted makers get no antecedent at all.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
    // The app already names this choice: BatchBasics captions its global weight-unit select
    // "Weight unit". A panel-local switch for the same choice under a different phrase read
    // as a different kind of setting.
    expect(screen.getByText('Weight unit')).toBeTruthy();
    // The radios keep their own short accessible names — every unit assertion in this file
    // selects them that way.
    expect(screen.getByRole('radio', { name: 'g' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'lb' })).toBeTruthy();
  });

  it('names the unit group so it contains the visible label without colliding with the global one', () => {
    // Two claims, and they pull against each other. Label-in-Name wants the accessible name
    // to CONTAIN the visible "Weight unit", so voice control can act on the words on screen.
    // But BatchBasics' global selector answers to exactly "Weight unit" and SettingsPanel's
    // own test queries that exact string — making this group's name equal to it would put
    // two controls behind one exact query at App level. Containment plus a qualifier
    // satisfies both; anything that reduces this to the bare string breaks the second.
    render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
    const group = screen.getByRole('radiogroup', { name: /weight unit/i });
    const name = group.getAttribute('aria-label') ?? '';
    expect(name).toContain('Weight unit');
    expect(name).not.toBe('Weight unit');
    // And an exact-string query still finds nothing here, which is what keeps the global
    // selector's own query unambiguous once both are on one page.
    expect(screen.queryByLabelText('Weight unit')).toBeNull();
  });

  it('quotes the measured-paste thresholds in grams, the unit that field is typed in', () => {
    // The input is grams-only ("Measured paste weight — the whole batch (g,
    // optional)"), so a threshold
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
  // The whole batch, asked for by volume: 7,500 g ÷ 1.03 g/ml. Round-tripping through String
  // is exact in JS, so the fraction lands on 1 and nothing is clamped.
  const FULL_VOLUME_ML = String(7500 / 1.03);

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

describe("ratio mode offers the reference's own starting ratios", () => {
  // RESULT's paste is 1,200 anhydrous + 400 cook water = 1,600 g, so 2:1 is 3,200 g of
  // water, a 4,800 g solution and 1,200/4,800 = 25% soap.
  const RATIO_BASE = {
    ...BASE,
    dilutionScope: 'batch' as const,
    targetMl: '',
    cookWaterGrams: 400,
    dilutionMode: 'ratio' as const,
    waterPasteRatio: '2',
    onDilutionModeChange: () => {},
    onWaterPasteRatioChange: () => {},
  };
  const PRESETS = ['1:1', '2:1', '2.5:1', '3:1'];
  const checked = (name: string) =>
    (screen.getByRole('radio', { name }) as HTMLInputElement).checked;

  it('offers the four printed ratios without taking away the free input', () => {
    render(<DilutionPanel {...RATIO_BASE} />);
    for (const name of PRESETS) expect(screen.getByRole('radio', { name })).toBeTruthy();
    // A maker must still be able to type a ratio the reference never printed.
    expect(screen.getByLabelText('Water to paste ratio')).toBeTruthy();
  });

  it('checks the preset the current ratio equals, and none of them when it is custom', () => {
    render(<DilutionPanel {...RATIO_BASE} waterPasteRatio="2.5" />);
    expect(checked('2.5:1')).toBe(true);
    expect(checked('2:1')).toBe(false);
    cleanup();
    render(<DilutionPanel {...RATIO_BASE} waterPasteRatio="1.75" />);
    expect(PRESETS.some((name) => checked(name))).toBe(false);
  });

  it('applies the preset that is ALREADY checked, which is the one on the default path', () => {
    // App seeds waterPasteRatio to '2' and the target to 30%, so entering ratio mode renders
    // 2:1 already checked beside "Not applied yet: … still uses your saved 30% target, not
    // the 25% above". The obvious move is to click the highlighted 2:1 — and a radio that is
    // already checked fires no `change` event at all, so onChange never ran, ratioTouched
    // stayed false and nothing applied. Two clicks, zero write-backs, note still on screen.
    // Re-asserting the same ratio is an explicit edit; `click` fires whether or not
    // checkedness moves, which is what makes it reachable.
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        {...RATIO_BASE}
        waterPasteRatio="2"
        soapConcentrationPercent="30"
        onSoapConcentrationChange={onSoapConcentrationChange}
      />,
    );
    const preset = screen.getByRole('radio', { name: '2:1' }) as HTMLInputElement;
    expect(preset.checked).toBe(true);
    // The state the maker is looking at: the ratio's own 25% has not been applied.
    expect(screen.getByText(/Not applied yet/i)).toBeTruthy();
    fireEvent.click(preset);
    // 1,200 anhydrous + 400 cook water = 1,600 g paste; 2:1 → 4,800 g solution → 25%.
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
  });

  it('applies it through a click on the label too, the way a maker actually hits a radio', () => {
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        {...RATIO_BASE}
        waterPasteRatio="2"
        soapConcentrationPercent="30"
        onSoapConcentrationChange={onSoapConcentrationChange}
      />,
    );
    const label = screen.getByRole('radio', { name: '2:1' }).closest('label')!;
    fireEvent.click(label);
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
  });

  it('applies the already-checked preset from the KEYBOARD, where no click ever arrives', () => {
    // An event census in Chromium on a real radio group, listeners on the raw inputs:
    //   checked   + Space  → keydown, keyup                          ← nothing else at all
    //   checked   + click  → click                                   (the onClick fix)
    //   unchecked + Space  → keydown, keyup, click, input, change
    //   arrow to sibling   → keydown, click(sibling), keyup(sibling)
    // So Space on the checked preset — which is exactly where roving focus lands when you
    // tab into the group on the seeded path — fired NO activation event. Same inertness the
    // onClick fix closed for the mouse, still open for anyone not using one.
    //
    // Driven with fireEvent, NOT userEvent.keyboard(' '): jsdom synthesises a `click` on a
    // checked radio where Chromium fires none (censused both ways), so a userEvent-driven
    // test would pass through the onClick handler and prove nothing about this one. keydown
    // + keyup alone is what the real browser delivers here.
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        {...RATIO_BASE}
        waterPasteRatio="2"
        soapConcentrationPercent="30"
        onSoapConcentrationChange={onSoapConcentrationChange}
      />,
    );
    const preset = screen.getByRole('radio', { name: '2:1' }) as HTMLInputElement;
    expect(preset.checked).toBe(true);
    preset.focus();
    fireEvent.keyDown(preset, { key: ' ', code: 'Space' });
    fireEvent.keyUp(preset, { key: ' ', code: 'Space' });
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
  });

  it('does not apply a preset merely because a key came up over it', () => {
    // The handler has to be Space and nothing else. Focus arrives by Tab, and the Tab KEYUP
    // lands on the newly focused element — so an ungated keyup would write a ratio back the
    // moment the group was tabbed into, with no pick at all. That is the round-2 bug
    // (entering ratio mode rewriting a typed target with no user action) in a new costume.
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        {...RATIO_BASE}
        waterPasteRatio="2"
        soapConcentrationPercent="30"
        onSoapConcentrationChange={onSoapConcentrationChange}
      />,
    );
    const preset = screen.getByRole('radio', { name: '2:1' });
    preset.focus();
    for (const key of ['Tab', 'ArrowDown', 'Enter', 'a']) {
      fireEvent.keyUp(preset, { key });
    }
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });

  it('picking a preset sets the ratio and counts as a real edit, so it applies', () => {
    // Same gate the typed input carries: entering ratio mode writes nothing back, but a
    // deliberate pick is an edit and must apply, or the panel would show a ratio nothing
    // downstream is running on. The mocked handler never feeds the new value back, so the
    // write-back still derives from the rendered '2' — 25%, as above.
    const onWaterPasteRatioChange = vi.fn();
    const onSoapConcentrationChange = vi.fn();
    render(
      <DilutionPanel
        {...RATIO_BASE}
        onWaterPasteRatioChange={onWaterPasteRatioChange}
        onSoapConcentrationChange={onSoapConcentrationChange}
      />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: '3:1' }));
    expect(onWaterPasteRatioChange).toHaveBeenCalledWith('3');
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
  });

  /** The one paragraph of ratio guidance, however it is worded. Selected STRUCTURALLY — the
   *  hint immediately after the presets group — rather than by any phrase in it, so every
   *  assertion below is about the claims and none is propped up by the wording it inspects.
   *  It used to be selected by "coconut-heavy soaps" filtered on "2:1", which was itself the
   *  evidence of a duplicated claim: the only reason a filter was needed is that a second
   *  paragraph on the same screen was making the same point. That claim has one owner now
   *  (see the minimum-dilution test below), so the disambiguation is gone with it. */
  const ratioGuidance = () => {
    const presets = screen.getByRole('radiogroup', { name: /starting points/i });
    const paragraph = presets.nextElementSibling;
    expect(paragraph?.className).toContain('results-hint');
    return paragraph?.textContent ?? '';
  };

  /** The minimum-dilution paragraph, which renders in both modes and both scopes. */
  const minimumDilutionCopy = () =>
    screen.getByText(/minimum dilution is a property of the recipe/i).textContent ?? '';

  it('attributes the starting ratios rather than calling them common or universal', () => {
    render(<DilutionPanel {...RATIO_BASE} />);
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
    // ratio common, so this panel must not, in the prose or in either group name.
    expect(text).not.toMatch(/common/i);
    expect(screen.getByRole('radiogroup', { name: /starting points/i })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: /common/i })).toBeNull();
    expect(screen.queryByText(/common starting points/i)).toBeNull();
  });

  it('drives the water requirement off the recipe minimum, not off a dissolving mechanism', () => {
    render(<DilutionPanel {...RATIO_BASE} />);
    const text = ratioGuidance();
    // The reference's model is a per-recipe MINIMUM dilution (LS:1524 — under it the
    // solution is supersaturated and paste is left over; LS:1603 — every recipe has its
    // own). LS:1534 gives no mechanism at all for needing more water.
    expect(text).toMatch(/minimum/i);
    expect(text).toMatch(/undissolved/i);
    // "expect to add more as the paste dissolves" was invented AND backwards: too little
    // water is what prevents dissolution. The absorb-and-swell picture is Gradual
    // Dilution's (LS:1531), a different method, and the LS:1531 paragraph further down
    // already owns it for both modes — so it must not be imported here.
    expect(text).not.toMatch(/as the paste dissolv/i);
    expect(text).not.toMatch(/absorb/i);
    expect(text).not.toMatch(/swell/i);
  });

  it('treats the minimum as a floor to clear and never as the destination', () => {
    render(<DilutionPanel {...RATIO_BASE} />);
    const text = ratioGuidance();
    // The supported claim is a BOUND ON HOW LITTLE water: LS:1524 (below the minimum the
    // solution is supersaturated with paste left over) and LS:1605 (once it is met the soap
    // is fully dissolved). Everything above the floor is the PRODUCT's call, and the
    // reference is emphatic — LS:1605 hands the decision over explicitly ("you can then
    // decide… depending on what the product will be used for"), LS:3585 calls diluting to
    // the minimum for thickness a "preconceived (and incorrect) notion", and LS:1690 asks
    // whether the commercial soaps use the absolute minimum and answers NO WAY.
    expect(text).toMatch(/how little water/i);
    // The first repair of the dissolving mechanism overshot into "Where you land is set by
    // the recipe's own minimum", which asserts the floor IS the destination. Pinned as a
    // claim, not a string: nothing here may make the minimum the place you end up.
    expect(text).not.toMatch(/where you land/i);
    expect(text).not.toMatch(/minimum[^.]*\b(target|destination|lands?|end up|stop)\b/i);
    expect(text).not.toMatch(/\b(land|end up|stop|finish)\w*\b[^.]*\bminimum\b/i);
    // And the panel must stay coherent with itself: the paragraph that owns the minimum
    // says in as many words that it is not the product's business, and the intended-use
    // list below is where the destination is actually chosen.
    expect(minimumDilutionCopy()).toMatch(/property of the recipe, not the product/i);
    expect(screen.getByText(/this suits|see the usual targets/i)).toBeTruthy();
  });

  it('accounts for the fourth preset by where it comes from, not by demoting it', () => {
    render(<DilutionPanel {...RATIO_BASE} />);
    const text = ratioGuidance();
    // 2.5:1 is on screen as a button and appears exactly once in the reference (LS:2172).
    // That once is a "Dilution Preference" table for the beginner recipe LS:2192 names as
    // the Beginner Castile, where it is the MORE DILUTE of the two ratios offered and lands
    // 21.3% soap (paste 19.31 oz anhydrous + 6.62 oz lye water = 25.93; 2.5 x 25.93 = 64.83
    // oz water, the table's own figure; 19.31 / 90.75) — inside the 20-30% band LS:2181
    // gives castile. So it is a castile-calibrated choice, and "a step between those two
    // rather than a starting point of its own" asserted the opposite of its only source,
    // while fighting this group's own "Starting points" legend.
    expect(screen.getByRole('radio', { name: '2.5:1' })).toBeTruthy();
    expect(text).toMatch(/2\.5:1/);
    expect(text).toMatch(/castile/i);
    // "the more dilute of the two it offers" had no antecedent — LS:2172 offers five rows
    // (two ratios + three solution percentages), so a reader checking the table found five
    // where the sentence said two. The comparison is scoped to the ratio rows it is about.
    expect(text).toMatch(/two ratio rows/i);
    expect(text).not.toMatch(/step between/i);
    expect(text).not.toMatch(/rather than a starting point/i);
    // No figure: the live readout below prints what 2.5:1 lands at for the CURRENT recipe,
    // and 21.3% is only the book's paste-to-anhydrous ratio. A fixed number here would
    // argue with a computed one a paragraph away.
    expect(text).not.toMatch(/21|%/);
  });

  it('gives the oils-to-minimum claim a single owner on screen', () => {
    // Ratio + Whole batch renders both paragraphs at once, and both used to say which oils
    // need more water. The minimum-dilution paragraph carries the actual figures (LS:1603
    // coconut ~40% / castile ~25%, LS:1605 most blends 25-35%) and renders in BOTH modes
    // and BOTH scopes, so it owns the claim and the ratio-only guidance drops it.
    render(<DilutionPanel {...RATIO_BASE} />);
    // Paragraphs only. The intended-use list further down also says "coconut-heavy", in a
    // note that comes from core's LS_DILUTION_TARGETS and makes a different claim — that a
    // coconut-heavy soap runs thinner, so a foaming-dispenser range can go higher. It is
    // inside the <details>, not a hint paragraph, and core stays zero-diff regardless.
    const namingCoconut = screen.getAllByText(/coconut/i).filter((el) => el.tagName === 'P');
    expect(namingCoconut).toHaveLength(1);
    expect(namingCoconut[0].textContent).toMatch(/minimum dilution is a property/i);
    expect(ratioGuidance()).not.toMatch(/coconut/i);
    expect(minimumDilutionCopy()).toMatch(/coconut-heavy soaps/i);
  });

  it('says the below-minimum failure is undissolved soap, never thickening or setting', () => {
    render(<DilutionPanel {...RATIO_BASE} />);
    const text = minimumDilutionCopy();
    // The reference states the failure four times, and it is the same state each time —
    // supersaturation with soap left over: lumps of undiluted paste or a thick, goopy
    // layer on top (LS:1519), "remaining soap paste" (LS:1524), "remaining soap pieces or
    // a white foamy layer on top" (LS:1610), "saturated and have remaining soap"
    // (LS:2181). "Past that the soap thickens or sets" claimed a viscosity consequence
    // instead: "thickens" is contradicted outright for the case the sentence led with
    // (LS:1657 — coconut-heavy soaps are thin as milk or juice even AT the minimum), and
    // "sets" is the book's word for cold dilution water (LS:2277, LS:2370) or NaOH
    // (LS:2679), never for too little water. It was also the exact belief LS:3585 names a
    // "preconceived (and incorrect) notion" — which this panel cites while it was printing
    // the claim.
    expect(text).toMatch(/undissolved/i);
    expect(text).toMatch(/lumps/i);
    expect(text).toMatch(/layer/i);
    // Pinned as a claim, not a string: no viscosity consequence in any wording.
    expect(text).not.toMatch(/thickens|\bsets?\b|solidif|congeal|harden|\bgels?\b/i);
    // The ratio guidance names the same failure state, so the two paragraphs that both
    // derive from the minimum can never disagree about what going under it does.
    expect(ratioGuidance()).toMatch(/undissolved/i);
  });

  it('states the unsaturated rule where it states the castor exception', () => {
    render(<DilutionPanel {...RATIO_BASE} />);
    const text = minimumDilutionCopy();
    // Ricinoleic acid is unsaturated yet increases solubility and dilutes rapidly (LS:848,
    // LS:915, LS:2382), which is why "castile and other high-unsaturated blends need more
    // water" was an overgeneralization worth killing. But an exception needs its rule: while
    // this clause sat in the ratio paragraph, that paragraph had already been narrowed to
    // "olive-heavy castile" and no longer stated the unsaturated rule at all, so the reader
    // met an exception to nothing. It lives beside the castile figure now and names the rule
    // in the same breath.
    expect(text).toMatch(/castor/i);
    expect(text).toMatch(/unsaturated/i);
    expect(text).toMatch(/castile/i);
    // Direction only. The reference gives castor's effect on solubility, never a
    // concentration for castor-rich blends, so no % may be attached to it.
    expect(text).toMatch(/more soluble/i);
    expect(text).not.toMatch(/castor[^.]*\d+\s*%/i);
    // And the sweeping form stays dead wherever it might come back.
    expect(text).not.toMatch(/high-unsaturated/i);
    expect(ratioGuidance()).not.toMatch(/high-unsaturated/i);
  });

  it('carries the weigh-your-paste caveat in ratio mode and nowhere else', () => {
    render(<DilutionPanel {...RATIO_BASE} />);
    const caveat = screen.getByText(/only as exact as the paste it multiplies/i);
    expect(caveat).toBeTruthy();
    // What goes on the scale is the PASTE. Both routes the reference gives yield paste and
    // never pot + paste: a tared scale (LS:1534), or the crockpot shortcut, which
    // SUBTRACTS the empty pot (LS:1538). "Weigh the pot and enter it as Measured paste
    // weight below" was that shortcut with its subtraction deleted — a maker following it
    // literally enters a figure carrying 2-4 kg of empty crockpot, and the ratio multiplies
    // that mass into the dilution water. Both halves are pinned: name the paste, and if the
    // pot is mentioned at all, name the subtraction with it.
    expect(caveat.textContent).toMatch(/weigh the paste and enter it as measured paste weight/i);
    expect(caveat.textContent).toMatch(/subtract the empty pot/i);
    expect(caveat.textContent).not.toMatch(/weigh the (crock)?pot and enter/i);
    cleanup();
    // The reference attaches it to its ratio rows and to no concentration row.
    render(<DilutionPanel {...RATIO_BASE} dilutionMode="concentration" />);
    expect(screen.queryByText(/only as exact as the paste it multiplies/i)).toBeNull();
  });

  it('says the caveat is met rather than repeating it, in the scope that has no other answer', () => {
    // 1,480 g clears the 1,200 g anhydrous floor and sits under the 4,000 g solution, so
    // the ratio is already multiplying a weighed paste. Custom amount is where this sentence
    // is the ONLY thing on screen saying so — the grid's own "uses your measured paste" hint
    // is whole-batch and does not render here.
    render(<DilutionPanel {...RATIO_BASE} dilutionScope="portion" targetMl="1000" measuredPasteGrams="1480" />);
    expect(screen.getByText(/you have weighed the paste \(1,480 g\)/i)).toBeTruthy();
    // The instruction is discharged, in whatever words it is written — including any
    // reintroduced pot-weighing form of it.
    expect(screen.queryByText(/enter it as measured paste weight/i)).toBeNull();
    expect(screen.queryByText(/weigh the (crock)?pot/i)).toBeNull();
  });

  it('does not repeat it in Whole batch, where the grid hint already says it', () => {
    // Both paragraphs quoted the same 1,480 g and both gave the cook-evaporation reason, one
    // above the grid and one below it. The grid hint is the one that also names WHICH row the
    // reading corrected, so it owns the message wherever it renders.
    render(<DilutionPanel {...RATIO_BASE} measuredPasteGrams="1480" />);
    expect(screen.getByText(/uses your measured paste/i)).toBeTruthy();
    expect(screen.queryByText(/you have weighed the paste/i)).toBeNull();
    // …and the estimate half is untouched: no reading, no grid hint, so the caveat is the
    // only answer and still renders in this very scope.
    cleanup();
    render(<DilutionPanel {...RATIO_BASE} />);
    expect(screen.getByText(/only as exact as the paste it multiplies/i)).toBeTruthy();
  });

  it('does not name the ratio row while the ratio row is gated off', () => {
    // Batch scope, ratio mode, EMPTY ratio field, valid reading: the "Water to add at this
    // ratio" row is suppressed (nothing to compute), and the grid hint said "Water to add at
    // this ratio above uses your measured paste (1,480 g)…" — pointing at a row that is not
    // on screen, directly under "Enter a water:paste ratio greater than zero". Pre-existing;
    // same copy-points-at-nothing class as the caveat below.
    render(<DilutionPanel {...RATIO_BASE} waterPasteRatio="" measuredPasteGrams="1480" />);
    expect(screen.getByText(/Enter a water:paste ratio greater than zero/i)).toBeTruthy();
    expect(screen.queryByText(/uses your measured paste/i)).toBeNull();
    // The control, so this is a gate and not a deletion: with the ratio back, the row is on
    // screen and the hint names it again.
    cleanup();
    render(<DilutionPanel {...RATIO_BASE} waterPasteRatio="2" measuredPasteGrams="1480" />);
    expect(screen.getByText('Water to add at this ratio')).toBeTruthy();
    expect(screen.getByText(/uses your measured paste/i)).toBeTruthy();
    // …and concentration mode, which has its own row and has never been gated on a ratio.
    cleanup();
    render(<DilutionPanel {...RATIO_BASE} dilutionMode="concentration" waterPasteRatio="" measuredPasteGrams="1480" />);
    expect(screen.getByText(/uses your measured paste/i)).toBeTruthy();
  });

  it('says nothing about "this ratio" while there is no ratio to speak of', () => {
    // With the field empty the panel prints "Enter a water:paste ratio greater than zero"
    // — and printed "A ratio is only as exact as the paste it multiplies, and this one runs
    // on…" directly above it, about a ratio that does not exist.
    render(<DilutionPanel {...RATIO_BASE} waterPasteRatio="" />);
    expect(screen.getByText(/Enter a water:paste ratio greater than zero/i)).toBeTruthy();
    expect(screen.queryByText(/only as exact as the paste it multiplies/i)).toBeNull();
    cleanup();
    render(<DilutionPanel {...RATIO_BASE} waterPasteRatio="" dilutionScope="portion" targetMl="1000" measuredPasteGrams="1480" />);
    expect(screen.queryByText(/you have weighed the paste/i)).toBeNull();
  });

  it('keeps the estimate but drops the instruction when a reading is on screen unused', () => {
    // 900 g is below the 1,200 g anhydrous floor, so it is REFUSED and cannot correct the
    // batch — the ratio really is running on the computed paste and the caveat still holds.
    // Telling a maker who has just been to the scale to go to the scale is the one thing
    // this must not do. (This used to be pinned with a "what's left" reading; the rejected
    // one is what still reaches this branch now that every reading is the whole batch.)
    render(<DilutionPanel {...RATIO_BASE} measuredPasteGrams="900" />);
    const caveat = screen.getByText(/only as exact as the paste it multiplies/i);
    expect(caveat).toBeTruthy();
    // Pinned on the claim, not the sentence: no weighing instruction in any wording, so a
    // rewrite cannot smuggle one back in past a stale exact-string assertion.
    expect(caveat.textContent).not.toMatch(/enter it as measured paste weight/i);
    expect(caveat.textContent).not.toMatch(/weigh the (paste|pot|crockpot)/i);
  });
});
