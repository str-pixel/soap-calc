// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ResultsPanel } from './ResultsPanel';
import { calculateRecipe } from '../lib/calculateRecipe';
import { createStarterLines, DEFAULT_SETTINGS } from '../lib/recipe';

afterEach(cleanup);

test('an after-cook additive uses the process-aware label — LS shows "After dilution"', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="KOH"
      process="ls"
      lyeType="koh"
      displayTotals={displayTotals}
      weightUnit="g"
      additives={[
        { key: 'a', catalogId: 'fragrance', name: 'Fragrance', percentOfOil: 3, grams: 30, addAt: 'after_cook' },
      ]}
    />,
  );
  // The always-visible Results sidebar must say "After dilution" on LS, not the raw "After cook".
  expect(screen.getByText(/After dilution/)).toBeTruthy();
  expect(screen.queryByText(/After cook/)).toBeNull();
});
