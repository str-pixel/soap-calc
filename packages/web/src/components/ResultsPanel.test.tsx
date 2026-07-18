// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ResultsPanel } from './ResultsPanel';
import { calculateRecipe } from '../lib/calculateRecipe';
import { createStarterLines, DEFAULT_SETTINGS } from '../lib/recipe';
import { formatWeight } from '../lib/weightUnits';

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
      batchWeightWithExtras={(displayTotals?.batchWeightGrams ?? 0) + 30}
      additives={[
        {
          key: 'a',
          catalogId: 'fragrance',
          name: 'Fragrance',
          amount: 3,
          unit: 'percent',
          basis: 'oil',
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

test('an additive renders its actual dose basis/unit label', () => {
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
      batchWeightWithExtras={(displayTotals?.batchWeightGrams ?? 0) + 3}
      additives={[
        { key: 'a', catalogId: '', name: 'Eugenol', amount: 3, unit: 'ppt', basis: 'oil', grams: 3, addAt: 'trace' },
      ]}
    />,
  );
  expect(screen.getByText(/3 ppt of oil/)).toBeTruthy();
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
      batchWeightWithExtras={(displayTotals?.batchWeightGrams ?? 0) + 30}
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
      batchWeightWithExtras={(displayTotals?.batchWeightGrams ?? 0) + 30}
      superfatPercent={DEFAULT_SETTINGS.superfatPercent}
      postCookSuperfat={{ oilId: 'shea-butter', percentOfOil: 3, grams: 30 }}
      extrasGrams={30}
    />,
  );
  // No additive lines, so the batch-weight note must name only the post-cook superfat.
  expect(screen.getByText(/includes post-cook superfat/)).toBeTruthy();
  expect(screen.queryByText(/includes additives/)).toBeNull();
});

test('subtract: PCSF labeled reserved + batch weight uses the vm value (not a local recompute)', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result} inputErrors={[]} lyeLabel="NaOH" process="hp" lyeType="naoh"
      displayTotals={displayTotals} weightUnit="g"
      superfatPercent={DEFAULT_SETTINGS.superfatPercent}
      postCookSuperfat={{ oilId: 'shea-butter', percentOfOil: 5, grams: 50 }}
      pcsfIsExtra={false}
      batchWeightWithExtras={1234}
    />,
  );
  expect(screen.getByText(/reserved/i)).toBeTruthy();
  // The panel renders the vm's batch weight, not (full displayTotals batch + PCSF grams).
  expect(screen.getByText('1,234 g')).toBeTruthy();
});

test('subtract + negative main superfat: no "reserved" label and no Total superfat row (cookFactor guard leaves lye untouched, so both would be false)', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result} inputErrors={[]} lyeLabel="NaOH" process="hp" lyeType="naoh"
      displayTotals={displayTotals} weightUnit="g"
      superfatPercent="-2"
      postCookSuperfat={{ oilId: 'shea-butter', percentOfOil: 5, grams: 50 }}
      pcsfIsExtra={true}
      batchWeightWithExtras={1234}
    />,
  );
  expect(screen.queryByText(/reserved/i)).toBeNull();
  expect(screen.queryByText('Total superfat')).toBeNull();
});

test('subtract + non-negative main superfat: "reserved" label and Total superfat row both render', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result} inputErrors={[]} lyeLabel="NaOH" process="hp" lyeType="naoh"
      displayTotals={displayTotals} weightUnit="g"
      superfatPercent="2"
      postCookSuperfat={{ oilId: 'shea-butter', percentOfOil: 5, grams: 50 }}
      pcsfIsExtra={false}
      batchWeightWithExtras={1234}
    />,
  );
  expect(screen.getByText(/reserved/i)).toBeTruthy();
  expect(screen.getByText('Total superfat')).toBeTruthy();
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
      batchWeightWithExtras={displayTotals?.batchWeightGrams ?? 0}
    />,
  );
  expect(screen.queryByText('Total superfat')).toBeNull();
});

test('HP shows a usable-at-unmold cure window', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  const batchWeightWithExtras = displayTotals?.batchWeightGrams ?? 0;
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="NaOH"
      process="hp"
      lyeType="naoh"
      displayTotals={displayTotals}
      weightUnit="g"
      batchWeightWithExtras={batchWeightWithExtras}
      cureEstimate={{ minWeeks: 3, maxWeeks: 4, usableAtUnmold: true, finishingLabel: 'Cure' }}
      labelWeight={batchWeightWithExtras}
    />,
  );
  expect(screen.getByText(/≈ 3–4 weeks/)).toBeTruthy();
  expect(screen.getByText(/usable at unmold/i)).toBeTruthy();
});

test('CP shows a 4+ week cure and a reduced label weight', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  const batchWeightWithExtras = displayTotals?.batchWeightGrams ?? 0;
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="NaOH"
      process="cp"
      lyeType="naoh"
      displayTotals={displayTotals}
      weightUnit="g"
      batchWeightWithExtras={batchWeightWithExtras}
      cureEstimate={{ minWeeks: 4, usableAtUnmold: false, finishingLabel: 'Cure' }}
      labelWeight={batchWeightWithExtras * 0.85}
    />,
  );
  expect(screen.getByText(/≈ 4\+ weeks/)).toBeTruthy();
  expect(screen.queryByText(/usable at unmold/i)).toBeNull();
  expect(screen.getByText(/est\. label weight/i)).toBeTruthy();
  expect(screen.getByText(formatWeight(batchWeightWithExtras * 0.85, 'g'))).toBeTruthy();
});

test('cure line and label-weight text are single-sourced from cureEstimate, not the process prop', () => {
  // A transient variant/process mismatch: process prop says "cp" (Cure) but the resolved
  // profile (and thus cureEstimate) is an LS variant (Sequester). The cure window /
  // usableAtUnmold already come from the profile, so the finish label must agree with
  // them rather than the stale/mismatched process prop (#2).
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  const batchWeightWithExtras = displayTotals?.batchWeightGrams ?? 0;
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="NaOH"
      process="cp"
      lyeType="naoh"
      displayTotals={displayTotals}
      weightUnit="g"
      batchWeightWithExtras={batchWeightWithExtras}
      cureEstimate={{ minWeeks: 1, maxWeeks: 4, usableAtUnmold: false, finishingLabel: 'Sequester' }}
      labelWeight={batchWeightWithExtras * 0.85}
    />,
  );
  expect(screen.getByText(/Sequester \(est\.\)/)).toBeTruthy();
  expect(screen.queryByText(/^Cure \(est\.\)/)).toBeNull();
  expect(screen.getByText(/after sequester/i)).toBeTruthy();
});

test('LS with zero water loss shows the sequester window but no separate label-weight line', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  const batchWeightWithExtras = displayTotals?.batchWeightGrams ?? 0;
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="KOH"
      process="ls"
      lyeType="koh"
      displayTotals={displayTotals}
      weightUnit="g"
      batchWeightWithExtras={batchWeightWithExtras}
      cureEstimate={{ minWeeks: 1, maxWeeks: 4, usableAtUnmold: false, finishingLabel: 'Sequester' }}
      labelWeight={batchWeightWithExtras}
    />,
  );
  expect(screen.getByText(/≈ 1–4 weeks/)).toBeTruthy();
  expect(screen.queryByText(/Label weight/i)).toBeNull();
});
