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

test('shows the finished volume the bottle count derives from, and names the density', () => {
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  // 4,000 g ÷ 1.03 g/ml = 3,883 ml. Volume is what sizes the dilution vessel and the
  // packaging, and it is what the separate bottle count works from.
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

test('ratio mode writes the derived concentration back so downstream consumers reconcile', () => {
  // The ratio is an alternative way to CHOOSE the concentration, not a parallel result:
  // without this write-back, vm.dilution / PartialDilution / BottleCalculator / BatchSheet
  // would all keep showing the old persisted concentration's figures beside this panel's.
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
  expect(onSoapConcentrationChange).toHaveBeenCalledWith('25');
});

test('extreme ratio clamps the written-back concentration so the ratio panel cannot vanish', () => {
  // At a 100,000:1 ratio the true derived concentration rounds to 0.0%. calculateDilution
  // only accepts (0, 100) exclusive, so writing 0 back would null out `dilution` upstream —
  // and since this whole ratio UI is gated on `dilution`, it would silently vanish with no
  // way back except switching modes. The write-back must clamp into range, and the panel
  // must say so rather than just silently substituting a different number.
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

test('leaves bottling to the separate bottle count — no size field, no count here', () => {
  // Makers dilute one large batch and package it later, often into several sizes, so the
  // dilution figures stay about the batch (see BottleCalculator).
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  expect(screen.queryByLabelText('Bottle size (ml)')).toBeNull();
  expect(screen.queryByText(/Bottles filled/)).toBeNull();
});
