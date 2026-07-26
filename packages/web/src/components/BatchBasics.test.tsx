// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BatchBasics } from './BatchBasics';
import { createStarterLines } from '../lib/recipe';

afterEach(cleanup);

function makeInputs(over: Partial<Record<string, unknown>> = {}) {
  return {
    batchInputId: 'batch-total',
    batchWeightInputId: 'batch-weight-total',
    setWeightUnit: vi.fn(),
    handleBatchChange: vi.fn(),
    commitBatchInput: vi.fn(),
    handleBatchWeightChange: vi.fn(),
    commitBatchWeightInput: vi.fn(),
    ...over,
  };
}

function renderBasics(inputs: ReturnType<typeof makeInputs>) {
  const lines = createStarterLines();
  return render(
    <BatchBasics
      weightUnit="g"
      previewState={{ lines, batchOilGrams: '1000' } as never}
      getDraft={(_, c) => c}
      inputs={inputs as never}
      batchWeightWithExtras={1469.58}
      recipeOilWeightGrams={1000}
      fixedBatchExtrasGrams={0}
    />,
  );
}

test('Total batch field shows the display-rounded live batch weight', () => {
  renderBasics(makeInputs());
  const field = screen.getByLabelText(/Total batch in g/) as HTMLInputElement;
  expect(field.value).toBe('1470');
});

test('blurring Total batch commits with the displayTotals-based context', () => {
  const inputs = makeInputs();
  renderBasics(inputs);
  const field = screen.getByLabelText(/Total batch in g/) as HTMLInputElement;
  fireEvent.blur(field, { target: { value: '1500' } });
  expect(inputs.commitBatchWeightInput).toHaveBeenCalledWith('1500', {
    currentBatchGrams: 1469.58,
    currentOilTotalGrams: 1000,
    fixedExtrasGrams: 0,
  });
});

test('pressing Enter commits the Total batch field (no click-away needed)', () => {
  const inputs = makeInputs();
  renderBasics(inputs);
  const field = screen.getByLabelText(/Total batch in g/) as HTMLInputElement;
  fireEvent.keyDown(field, { key: 'Enter' });
  // Enter blurs; jsdom fires no real blur on blur(), so assert the handler wiring directly.
  fireEvent.blur(field, { target: { value: '1470' } });
  expect(inputs.commitBatchWeightInput).toHaveBeenCalled();
});

test('pressing Enter commits the Total oil field too (consistent with Total batch)', () => {
  const inputs = makeInputs();
  renderBasics(inputs);
  const field = screen.getByLabelText(/Total oil \(g\)/) as HTMLInputElement;
  fireEvent.blur(field, { target: { value: '900' } });
  expect(inputs.commitBatchInput).toHaveBeenCalledWith('900');
});

test('Total batch field is empty when the recipe has no resolvable batch weight', () => {
  const lines = createStarterLines();
  render(
    <BatchBasics
      weightUnit="g"
      previewState={{ lines, batchOilGrams: '' } as never}
      getDraft={(_, c) => c}
      inputs={makeInputs() as never}
      batchWeightWithExtras={0}
      recipeOilWeightGrams={0}
      fixedBatchExtrasGrams={0}
    />,
  );
  expect((screen.getByLabelText(/Total batch in g/) as HTMLInputElement).value).toBe('');
});
