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

const BOTTLE_PROPS = { bottleSizeMl: '250', onBottleSizeMlChange: () => {} };

test('renders the dilution figures', () => {
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" {...BOTTLE_PROPS} />);
  expect(screen.getByText('Dilution water to add')).toBeTruthy();
  expect(screen.getByText('2,400 g')).toBeTruthy();
});

test('shows the target-exceeds-paste warning', () => {
  render(<DilutionPanel dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }} soapConcentrationPercent="90" onSoapConcentrationChange={() => {}} weightUnit="g" {...BOTTLE_PROPS} />);
  expect(screen.getByRole('alert').textContent).toContain('more dilute');
});

test('shows a hint when dilution is null', () => {
  render(<DilutionPanel dilution={null} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" {...BOTTLE_PROPS} />);
  expect(screen.getByText(/Enter oils and a target/)).toBeTruthy();
});

test('editing the concentration calls onSoapConcentrationChange', () => {
  const onChange = vi.fn();
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={onChange} weightUnit="g" {...BOTTLE_PROPS} />);
  fireEvent.change(screen.getByLabelText('Target soap concentration percent'), { target: { value: '25' } });
  expect(onChange).toHaveBeenCalledWith('25');
});

test('shows bottles filled from the finished solution weight and bottle size, hedged as approximate', () => {
  // 4000 g solution / 1.03 g/ml ≈ 3883 ml; 3883 / 250 = floor(15.5) = 15 bottles.
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" {...BOTTLE_PROPS} />);
  expect(screen.getByText(/≈\s*Bottles filled/)).toBeTruthy();
  expect(screen.getByText('15')).toBeTruthy();
});

test('editing the bottle size calls onBottleSizeMlChange', () => {
  const onChange = vi.fn();
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" bottleSizeMl="250" onBottleSizeMlChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Bottle size (ml)'), { target: { value: '500' } });
  expect(onChange).toHaveBeenCalledWith('500');
});

test('omits the bottle readout when dilution is null', () => {
  render(<DilutionPanel dilution={null} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" {...BOTTLE_PROPS} />);
  expect(screen.queryByText(/Bottles filled/)).toBeNull();
});

test('omits the bottle readout when the bottle size is invalid', () => {
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" bottleSizeMl="0" onBottleSizeMlChange={() => {}} />);
  expect(screen.queryByText(/Bottles filled/)).toBeNull();
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
        bottleSizeMl="250"
        onBottleSizeMlChange={() => {}}
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
      bottleSizeMl="250"
      onBottleSizeMlChange={() => {}}
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
      bottleSizeMl="250"
      onBottleSizeMlChange={() => {}}
      altLiquidWaterGrams={300}
      unknownLiquidGrams={300}
      overDilutionCertain={false}
    />,
  );
  expect(screen.getByText(/is the LEAST you will need/i)).toBeTruthy();
});
