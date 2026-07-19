// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
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

test('shows bottles filled from the finished solution weight and bottle size', () => {
  // 4000 g solution / 1.03 g/ml ≈ 3883 ml; 3883 / 250 = floor(15.5) = 15 bottles.
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" {...BOTTLE_PROPS} />);
  expect(screen.getByText(/Bottles filled/)).toBeTruthy();
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
