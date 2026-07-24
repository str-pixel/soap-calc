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
  // (Now shown both in the additive amounts and the Full recipe list, so allow more than one.)
  expect(screen.getAllByText(/After dilution/).length).toBeGreaterThan(0);
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
  // Shea Butter now appears in both the post-cook-superfat line and the Full recipe list.
  expect(screen.getAllByText(/Shea Butter/).length).toBeGreaterThan(0);
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

const workability = {
  unmold: { minHours: 12, maxHours: 36 },
  cut: { minHours: 16, maxHours: 40 },
  stamp: { opensMinHours: 40, opensMaxHours: 52 },
  confidence: 'moderate' as const,
  factors: ['Hard-oil score 47', 'Natural gel'],
  caveats: ['Test firmness on a loaf offcut before cutting or stamping the batch.'],
};

test('renders the workability timeline for CP', () => {
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
      cureEstimate={{ minWeeks: 4, usableAtUnmold: false, finishingLabel: 'Cure', workability }}
      labelWeight={batchWeightWithExtras}
    />,
  );
  // Exact dt text — the surrounding cure/add-order copy also contains the word "unmold"
  // in prose (e.g. "unmold in 24–48 h"), so a loose /Unmold/i regex would over-match.
  expect(screen.getByText('Unmold')).toBeTruthy();
  expect(screen.getByText('Cut')).toBeTruthy();
  expect(screen.getByText('Stamp from')).toBeTruthy();
  expect(screen.getByText('≈ 12–36 h')).toBeTruthy();
  expect(screen.getByText(/loaf offcut/i)).toBeTruthy();
});

test('workability rows all share one unit (no unmold-in-hours / cut-in-days mix)', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  const batchWeightWithExtras = displayTotals?.batchWeightGrams ?? 0;
  // unmold max 46.8h sits just under the 48h hours/days seam; cut max 50.8h sits just over.
  const straddling = {
    ...workability,
    unmold: { minHours: 15.6, maxHours: 46.8 },
    cut: { minHours: 19.6, maxHours: 50.8 },
    stamp: { opensMinHours: 54.8, opensMaxHours: 71.2 },
  };
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
      cureEstimate={{ minWeeks: 4, usableAtUnmold: false, finishingLabel: 'Cure', workability: straddling }}
      labelWeight={batchWeightWithExtras}
    />,
  );
  expect(screen.getByText('≈ 16–47 h')).toBeTruthy(); // unmold
  expect(screen.getByText('≈ 20–51 h')).toBeTruthy(); // cut — hours, not "≈ 1–2 days"
  expect(screen.queryByText(/days/)).toBeNull();
});

test('omits the workability block when there is no estimate (e.g. LS)', () => {
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
      cureEstimate={{ minWeeks: 4, usableAtUnmold: false, finishingLabel: 'Sequester', workability: null }}
      labelWeight={batchWeightWithExtras}
    />,
  );
  expect(screen.queryByText(/Unmold/i)).toBeNull();
});

test('shows the HP texture note and no stamp row', () => {
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
      cureEstimate={{
        minWeeks: 0,
        usableAtUnmold: true,
        finishingLabel: 'Cure',
        workability: {
          unmold: { minHours: 6, maxHours: 18 },
          cut: { minHours: 6, maxHours: 18 },
          stamp: null,
          confidence: 'moderate',
          factors: [],
          caveats: [
            'Hot-process bars are unmoldable soon after the cook firms; their rustic surface takes stamps unevenly, so stamp timing varies.',
          ],
        },
      }}
      labelWeight={batchWeightWithExtras}
    />,
  );
  // Exact dt text — HP's own "usable at unmold" cure note and add-order step prose both
  // contain the word "unmold", so a loose /Unmold/i regex would over-match.
  expect(screen.getByText('Unmold')).toBeTruthy();
  expect(screen.queryByText(/Stamp from/i)).toBeNull();
  expect(screen.getByText(/rustic surface/i)).toBeTruthy();
});

test('renders the Full recipe list and process-aware Add-in-order steps', () => {
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
      totalOilGrams={displayTotals?.recipeOilWeightGrams ?? 0}
    />,
  );
  expect(screen.getByText('Full recipe')).toBeTruthy();
  expect(screen.getByText('Add in this order')).toBeTruthy();
  // Itemized alkali by its full name (the grid uses the short "NaOH").
  expect(screen.getByText('Sodium hydroxide (NaOH)')).toBeTruthy();
  // CP build steps keep the lye-into-water safety note.
  expect(screen.getByText(/never the reverse/)).toBeTruthy();
});

test('a recipe-derived cure model renders the two milestone rows instead of the fixed window', () => {
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
      cureEstimate={{
        minWeeks: 4,
        usableAtUnmold: false,
        finishingLabel: 'Cure',
        workability: null,
        model: {
          usable: { minWeeks: 4.2, maxWeeks: 6.3 },
          second: { kind: 'best', minWeeks: 8, maxWeeks: 12.8 },
          confidence: 'low',
          factors: ['Slow FAs 77%'],
          caveats: ['Fatty-acid data covers only 60% of these oils — the cure drivers are partly estimated.'],
        },
      }}
    />,
  );
  expect(screen.getByText('Usable from (est.)')).toBeTruthy();
  expect(screen.getByText('At its best (est.)')).toBeTruthy();
  expect(screen.queryByText('Cure (est.)')).toBeNull();
  expect(screen.getByText(/covers only 60%/)).toBeTruthy();
  expect(screen.getByText('low confidence')).toBeTruthy();
  expect(screen.getByText('Slow FAs 77%')).toBeTruthy();
});

test('HP with usableAtUnmold and a model shows "At unmold", not a contradictory weeks range', () => {
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
      batchWeightWithExtras={displayTotals?.batchWeightGrams ?? 0}
      cureEstimate={{
        minWeeks: 3,
        maxWeeks: 4,
        usableAtUnmold: true,
        finishingLabel: 'Cure',
        workability: null,
        model: {
          usable: { minWeeks: 3, maxWeeks: 4.5 },
          second: { kind: 'best', minWeeks: 8, maxWeeks: 12.8 },
          confidence: 'low',
          factors: [],
          caveats: [],
        },
      }}
    />,
  );
  expect(screen.getByText('At unmold')).toBeTruthy();
  expect(screen.queryByText('Usable from (est.)')).toBeNull();
  expect(screen.getByText('At its best (est.)')).toBeTruthy();
});

test('a use-within model renders the shelf label, not "At its best"', () => {
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
      cureEstimate={{
        minWeeks: 4,
        usableAtUnmold: false,
        finishingLabel: 'Cure',
        workability: null,
        model: {
          usable: { minWeeks: 5.4, maxWeeks: 8 },
          second: { kind: 'useWithin', minWeeks: 13, maxWeeks: 13 },
          confidence: 'low',
          factors: [],
          caveats: [],
        },
      }}
    />,
  );
  expect(screen.getByText('Use within (est.)')).toBeTruthy();
  expect(screen.queryByText('At its best (est.)')).toBeNull();
});

test('a null model falls back to the fixed per-process window row', () => {
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
      batchWeightWithExtras={displayTotals?.batchWeightGrams ?? 0}
      cureEstimate={{
        minWeeks: 1,
        maxWeeks: 4,
        usableAtUnmold: false,
        finishingLabel: 'Sequester',
        workability: null,
        model: null,
      }}
    />,
  );
  expect(screen.getByText('Sequester (est.)')).toBeTruthy();
  expect(screen.queryByText('Usable from (est.)')).toBeNull();
  // null model → no cure confidence chip; this fixture's workability is also null, so
  // there's no workability chip either, making a bare null-check on "low confidence" valid.
  expect(screen.queryByText(/low confidence/)).toBeNull();
});

test('the add-in-order CP step quotes the same unmold/cure windows as the estimate rows', () => {
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
      cureEstimate={{
        minWeeks: 4,
        usableAtUnmold: false,
        finishingLabel: 'Cure',
        workability: {
          unmold: { minHours: 11, maxHours: 34 },
          cut: { minHours: 15, maxHours: 38 },
          stamp: null,
          confidence: 'moderate',
          factors: [],
          caveats: [],
        },
        model: {
          usable: { minWeeks: 5, maxWeeks: 7.5 },
          second: { kind: 'best', minWeeks: 8, maxWeeks: 12.8 },
          confidence: 'low',
          factors: [],
          caveats: [],
        },
      }}
    />,
  );
  expect(screen.getByText(/unmold ≈ 11–34 h and cure ≈ 5–7.5 weeks/)).toBeTruthy();
  expect(screen.queryByText(/24–48 h/)).toBeNull();
});
