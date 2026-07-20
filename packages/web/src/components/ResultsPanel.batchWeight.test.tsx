// @vitest-environment jsdom
// packages/web/src/components/ResultsPanel.batchWeight.test.tsx
// NOTE: the jsdom pragma above MUST be line 1 — web vitest defaults to environment:'node'.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ResultsPanel } from './ResultsPanel';

afterEach(cleanup);

// Minimal props: a real recipe render is covered elsewhere; here we assert the
// breakdown readout appears and totals the four slices from the props it receives.
const baseResult = {
  totalOilWeightGrams: 1000, lyeWeightGrams: 138, naohWeightGrams: 138, kohWeightGrams: 0,
  waterWeightGrams: 330, totalBatchWeightGrams: 1468, lyeConcentrationPercent: 30,
  waterLyeRatio: 2.4, lines: [], warnings: [], errors: [],
};

function renderPanel() {
  render(
    <ResultsPanel
      result={baseResult as never}
      inputErrors={[] as never}
      lyeLabel="NaOH"
      process={'cp' as never}
      lyeType={'naoh' as never}
      kohBlendPercent={'0'}
      displayTotals={{ recipeOilWeightGrams: 1000 } as never}
      weightUnit="g"
      waterMode={'concentration' as never}
      splitLiquid={undefined as never}
      splitLiquidGrams={null}
      additives={[] as never}
      superfatPercent={'5'}
      postCookSuperfat={null as never}
      pcsfIsExtra={false}
      extrasGrams={144}
      batchWeightWithExtras={1612}
      totalOilGrams={1000}
    />,
  );
}

describe('ResultsPanel batch-weight breakdown', () => {
  it('renders the total and the four slices', () => {
    renderPanel();
    const el = screen.getByTestId('batch-weight');
    expect(el.textContent).toMatch(/1,612 g/);   // total = oils+lye+water+extras
    expect(el.textContent).toMatch(/oils/i);
    expect(el.textContent).toMatch(/extras/i);
  });
});
