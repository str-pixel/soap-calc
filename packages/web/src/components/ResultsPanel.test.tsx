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
        {
          key: 'a',
          catalogId: 'fragrance',
          name: 'Fragrance',
          amount: 3,
          unit: 'percent',
          basis: 'oil',
          percentOfOil: 3,
          grams: 30,
          addAt: 'after_cook',
        },
      ]}
    />,
  );
  // The always-visible Results sidebar must say "After dilution" on LS, not the raw "After cook".
  expect(screen.getByText(/After dilution/)).toBeTruthy();
  expect(screen.queryByText(/After cook/)).toBeNull();
});

test('a post-cook superfat renders an oil+grams line and a cook+post-cook total', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="NaOH"
      process="hp"
      lyeType="naoh"
      displayTotals={displayTotals}
      weightUnit="g"
      superfatPercent={DEFAULT_SETTINGS.superfatPercent}
      postCookSuperfat={{ oilId: 'shea-butter', percentOfOil: 3, grams: 30 }}
    />,
  );
  expect(screen.getByText(/Shea Butter/)).toBeTruthy();
  expect(screen.getByText('30 g')).toBeTruthy();
  // cook (5% default) + post-cook (3%) = 8%
  expect(screen.getByText('8%')).toBeTruthy();
});

test('a post-cook-superfat-only batch does not claim "additives" in the batch-weight note', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="NaOH"
      process="hp"
      lyeType="naoh"
      displayTotals={displayTotals}
      weightUnit="g"
      superfatPercent={DEFAULT_SETTINGS.superfatPercent}
      postCookSuperfat={{ oilId: 'shea-butter', percentOfOil: 3, grams: 30 }}
    />,
  );
  // No additive lines, so the batch-weight note must name only the post-cook superfat.
  expect(screen.getByText(/includes post-cook superfat/)).toBeTruthy();
  expect(screen.queryByText(/includes additives/)).toBeNull();
});

test('with no postCookSuperfat, no PCSF line or total-superfat line renders', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="NaOH"
      process="cp"
      lyeType="naoh"
      displayTotals={displayTotals}
      weightUnit="g"
    />,
  );
  expect(screen.queryByText('Total superfat')).toBeNull();
});
