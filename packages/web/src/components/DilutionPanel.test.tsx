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

test('renders the dilution figures', () => {
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  expect(screen.getByText('Dilution water to add')).toBeTruthy();
  // The pour figure carries the other scale units so it reads on any kitchen scale.
  expect(screen.getByText('2,400 g (84.7 oz / 5.29 lb)')).toBeTruthy();
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
  // and PartialDilution's identical trap), so the forbidden derivation would compute paste
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

test('ratio mode writes the derived concentration back once the ratio is actually edited, so downstream consumers reconcile', () => {
  // The ratio is an alternative way to CHOOSE the concentration, not a parallel result:
  // without this write-back, vm.dilution / PartialDilution / BatchSheet
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
  expect(screen.getByText(/measured paste/i)).toBeTruthy();
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
  expect(screen.queryByText(/measured paste/i)).toBeNull();
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
