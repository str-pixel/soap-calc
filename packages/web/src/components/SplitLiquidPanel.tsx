import {
  ADDITIVE_STAGE_LABELS,
  alternativeLiquidNoteFor,
  alternativeLiquidPreset,
  alternativeLiquidsForProcess,
  isAlternativeLiquidOfferedFor,
  type LyeSolutionWaterStatus,
  type SplitLiquidWaterSuggestion,
  type WaterMode,
} from '@soap-calc/core';
import { InfoTip } from './InfoTip';
import type { ProcessId } from '../lib/process';
import type { SplitLiquidRow } from '../lib/recipe';
import { newSplitLiquidKey } from '../lib/recipe';
import { splitLiquidWaterFraction, splitLiquidWaterInputState } from '../lib/calculateAdditives';
import { budgetSizingAvailable } from '../lib/splitLiquidSizing';
import type { ResolvedSplitLiquidRow } from '../lib/splitLiquidSizing';
import { formatInputNumber } from '../lib/format';
import { splitLiquidManualWaterHint } from '../lib/splitLiquidHint';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type SplitLiquidPanelProps = {
  rows: SplitLiquidRow[];
  /** The recipe's process — picks the book-faithful default sizing for a NEW liquid:
   * CP defaults to 'rest' (the split-not-discount remainder method); HP to '% of oil
   * weight' (the additive "+10% at the end" idiom); LS stays additive too, since the
   * dilution phase makes a total-liquid budget ambiguous. */
  process: ProcessId;
  /** View-model-resolved grams per row (same order as `rows`). */
  resolvedRows: ResolvedSplitLiquidRow[];
  totalOilGrams: number;
  lyeGrams: number;
  weightUnit: WeightUnit;
  waterMode: WaterMode;
  waterSuggestion: SplitLiquidWaterSuggestion | null;
  /** Effective-water check for the lye solution (in-lye rows or budget allocation). */
  lyeWaterStatus: LyeSolutionWaterStatus | null;
  /** True when an in-lye liquid's water content is undeclared: the 1:1 dissolution floor
   * cannot be checked either way, which must be said rather than read as a pass. */
  lyeWaterUnverifiable?: boolean;
  /** Budget allocation (budget sizing rows only): the calc's lye water + the target. */
  allocation: { lyeWaterGrams: number; targetLiquidGrams: number } | null;
  /** Auto-added lye compensating acid rows (view-model owned; null when none). */
  acidExtraLye: { naohGrams: number; kohGrams: number } | null;
  onChange: (rows: SplitLiquidRow[]) => void;
  onApplySuggestedWater?: (waterPercentOfOils: string) => void;
};

const NEW_ROW = (sizeMode: SplitLiquidRow['sizeMode']): SplitLiquidRow => ({
  key: newSplitLiquidKey(),
  presetKey: '',
  name: '',
  customWaterPercent: '',
  sizeMode,
  amount: '',
  addAt: 'trace',
});

export function SplitLiquidPanel({
  rows,
  process,
  resolvedRows,
  totalOilGrams,
  lyeGrams,
  weightUnit,
  waterMode,
  waterSuggestion,
  lyeWaterStatus,
  lyeWaterUnverifiable = false,
  allocation,
  acidExtraLye,
  onChange,
  onApplySuggestedWater,
}: SplitLiquidPanelProps) {
  // Budget modes need a water mode whose setting reads as a total-liquid target:
  // percent-of-oils (target = % × oils) or lye_water_ratio (target = N × lye — the
  // splitLiquidCalcOverride ratio branch; this is what makes the glycerin
  // parts-of-the-lye-solution mode expressible under LS's native water mode).
  const budgetModesAvailable = budgetSizingAvailable(waterMode);
  // A liquid withheld from this process must not be offered here. Presets already chosen
  // still resolve by key (alternativeLiquidPreset is unfiltered), so a recipe saved under
  // CP keeps showing its vinegar row after a switch to LS rather than silently losing it.
  const presetsForProcess = alternativeLiquidsForProcess(process);
  const isLiquidSoap = process === 'ls';
  const gramsByKey = new Map(resolvedRows.map(({ row, grams }) => [row.key, grams]));
  const totalGrams = resolvedRows.reduce((sum, { grams }) => sum + (grams ?? 0), 0);

  const updateRow = (key: string, patch: Partial<SplitLiquidRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const canApplyWater =
    waterMode === 'percent_of_oils' &&
    waterSuggestion?.suggestedWaterPercentOfOils !== null &&
    onApplySuggestedWater;

  const manualHint =
    waterSuggestion && waterMode !== 'percent_of_oils'
      ? splitLiquidManualWaterHint({
          waterMode,
          waterSuggestion,
          lyeGrams,
          totalOilGrams,
          weightUnit,
        })
      : null;

  const showShortfall = lyeWaterStatus !== null && lyeWaterStatus.shortfallGrams > 0;
  // The thick-liquid note aggregates every row's displaced water against the budget.
  const displacedWaterGrams = resolvedRows.reduce((sum, { row, grams }) => {
    const fraction = grams != null ? splitLiquidWaterFraction(row) : null;
    // Skip undeclared rows: (1 - 1) made them contribute exactly 0, so the note could never
    // fire for the one row type whose thickness nobody has stated. They get their own note.
    return fraction === null ? sum : sum + grams! * (1 - fraction);
  }, 0);
  const showFluidityNote =
    allocation !== null && displacedWaterGrams > allocation.targetLiquidGrams * 0.05;

  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <span className="panel__title-row">
            <h2 className="panel__title">Split liquid</h2>
            <InfoTip term="split liquid">
              Dissolve the lye in a minimum of plain water, and add the rest of the
              recipe&apos;s liquid — milk, puree, beer — separately. Keeping sugary liquids
              out of hot lye helps prevent scorching and darkening.
            </InfoTip>
          </span>
          <p className="panel__subtitle">
            Minimum water in lye; alternative liquids added separately
          </p>
          {isLiquidSoap && (
            <p className="split-liquid-note">
              Liquid soap has a third liquid stage these rows never touch: the dilution
              water. Everything sized here joins the paste before the cook, and its water
              is already counted against the dilution figure — dilute with plain distilled
              water only.
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            const restFree = !rows.some((r) => r.sizeMode === 'rest');
            const defaultSizeMode =
              process === 'cp' && budgetModesAvailable && restFree ? 'rest' : 'percent_of_oils';
            onChange([...rows, NEW_ROW(defaultSizeMode)]);
          }}
        >
          + Add liquid
        </button>
      </div>

      {rows.length > 0 && (
        <div className="split-liquid-rows">
          {rows.map((row) => {
            const preset = alternativeLiquidPreset(row.presetKey);
            const grams = gramsByKey.get(row.key) ?? null;
            // Mismatched-select guard, mirroring AdditivesPanel: a row's chosen preset must
            // always be among its options, even when this process doesn't offer it —
            // otherwise the controlled <select> shows the first option instead ("Custom…")
            // and misrepresents which liquid the recipe actually carries.
            const isStray = preset !== null && !isAlternativeLiquidOfferedFor(preset, process);
            // A budget row under a water mode with no total-liquid budget is inert: it
            // resolves to no grams rather than silently sizing against the full lye water.
            const waterState = splitLiquidWaterInputState(row);
            const isInertBudgetRow =
              !budgetModesAvailable &&
              (row.sizeMode === 'rest' || row.sizeMode === 'percent_of_liquid');
            const options = isStray ? [...presetsForProcess, preset] : presetsForProcess;
            const otherHasRest = rows.some((r) => r.key !== row.key && r.sizeMode === 'rest');
            const recommendTrace =
              row.addAt === 'lye' &&
              (preset?.flags.includes('sugars') || preset?.flags.includes('alcohol'));
            return (
              <div className="settings-grid split-liquid-row" key={row.key}>
                <label className="field">
                  <span>Liquid preset</span>
                  <select
                    className="input"
                    value={row.presetKey}
                    onChange={(e) => {
                      const nextKey = e.target.value;
                      const nextPreset = alternativeLiquidPreset(nextKey);
                      updateRow(row.key, {
                        presetKey: nextPreset ? nextKey : '',
                        // A preset names the liquid; back to custom keeps what was typed.
                        name: nextPreset ? nextPreset.label : row.name,
                      });
                    }}
                  >
                    <option value="">Custom…</option>
                    {options.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Liquid name</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. goat milk, pumpkin puree"
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                  />
                </label>
                {preset === null && (
                  <label className="field">
                    <span>% water (optional)</span>
                    <input
                      type="number"
                      className="input"
                      min={1}
                      max={100}
                      step={1}
                      placeholder="100"
                      aria-invalid={waterState === 'invalid' || undefined}
                      value={row.customWaterPercent}
                      onChange={(e) => updateRow(row.key, { customWaterPercent: e.target.value })}
                    />
                  </label>
                )}
                <label className="field">
                  <span>
                    Sized by
                    <InfoTip term="sized by">
                      How the liquid&apos;s amount is measured. &ldquo;% of oil weight&rdquo;
                      is a share of the oils (20% of 1,000 g oils = 200 g), added on top of
                      the lye water. &ldquo;Weight&rdquo; is exact grams, also on top.
                      &ldquo;% of total liquid&rdquo; is a share of the recipe&apos;s
                      total-liquid amount, carved out of that total — the lye water shrinks
                      to match. &ldquo;All liquid above the lye minimum&rdquo; keeps the lye
                      solution at equal parts water and lye and gives this liquid everything
                      else. Liquids are never sized against the batch weight — that total
                      is a result, not an ingredient.
                    </InfoTip>
                  </span>
                  <select
                    className="input"
                    aria-label="Sized by"
                    value={row.sizeMode}
                    onChange={(e) =>
                      updateRow(row.key, { sizeMode: e.target.value as SplitLiquidRow['sizeMode'] })
                    }
                  >
                    <option value="percent_of_oils">% of oil weight</option>
                    <option value="grams">Weight</option>
                    <option value="percent_of_liquid" disabled={!budgetModesAvailable}>
                      % of total liquid{budgetModesAvailable ? '' : ' (needs % of oils water)'}
                    </option>
                    <option value="rest" disabled={!budgetModesAvailable || otherHasRest}>
                      All liquid above the lye minimum
                      {!budgetModesAvailable
                        ? ' (needs % of oils water)'
                        : otherHasRest
                          ? ' (already used)'
                          : ''}
                    </option>
                  </select>
                </label>
                {row.sizeMode !== 'rest' && (
                  <label className="field">
                    <span>Amount</span>
                    <input
                      type="number"
                      className="input"
                      min={0}
                      step={0.1}
                      value={row.amount}
                      onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                    />
                  </label>
                )}
                <label className="field">
                  <span>
                    Add at
                    <InfoTip term="add at">
                      Where the liquid joins the batch. At trace (after the oils and lye are
                      blended) is the safest default for milks and other sugary liquids; in
                      the lye water exposes them to the hottest step. All three stages come
                      before a liquid-soap cook — dilution is deliberately not offered, since
                      anything added after the cook is never sterilised by it.
                    </InfoTip>
                  </span>
                  <select
                    className="input"
                    aria-label="Add at"
                    value={row.addAt}
                    onChange={(e) =>
                      updateRow(row.key, { addAt: e.target.value as SplitLiquidRow['addAt'] })
                    }
                  >
                    <option value="lye">In lye water</option>
                    <option value="oils">With oils</option>
                    <option value="trace">At trace</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn--ghost split-liquid-row__remove"
                  aria-label="Remove liquid"
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                >
                  Remove
                </button>
                {grams !== null && grams > 0 && (
                  <p className="split-liquid-preview">
                    {row.name.trim() || 'Alternative liquid'}: {formatWeight(grams, weightUnit)}{' '}
                    ({ADDITIVE_STAGE_LABELS[row.addAt]})
                  </p>
                )}
                {recommendTrace && (
                  <p className="split-liquid-note">
                    Recommended: at trace — sugars scorch in hot lye. If it must go in the
                    lye, freeze the liquid and add the lye slowly.
                  </p>
                )}
                {waterState === 'invalid' && (
                  <p className="split-liquid-warning" role="alert">
                    Enter 1–100 for % water — this value is being ignored, and the liquid is
                    treated as having no declared water content.
                  </p>
                )}
                {waterState === 'unknown' && grams !== null && grams > 0 && (
                  <p className="split-liquid-note">
                    No % water declared: this liquid is counted as all water where that
                    errs safe, and left out where it doesn&apos;t. Declaring it sharpens the
                    dilution and lye-water figures.
                  </p>
                )}
                {isInertBudgetRow && (
                  <p className="split-liquid-warning" role="alert">
                    This sizing needs &ldquo;% of oils&rdquo; water or a water:lye ratio —
                    lye-concentration water sets the lye solution&apos;s strength, so there
                    is no total-liquid budget to carve this out of. This liquid is not being
                    added. Switch the water method, or size it by % of oil weight or Weight.
                  </p>
                )}
                {isStray && (
                  <p className="split-liquid-warning" role="alert">
                    {preset!.label} is not used in liquid soap — this row still counts as
                    liquid, but earns no lye adjustment here. Remove it, or switch the
                    recipe back to a bar process.
                  </p>
                )}
                {!isStray && preset && alternativeLiquidNoteFor(preset, process) && (
                  <p className="split-liquid-note">{alternativeLiquidNoteFor(preset, process)}</p>
                )}
              </div>
            );
          })}

          {allocation && totalGrams > 0 && (
            <p className="split-liquid-preview">
              {formatWeight(allocation.lyeWaterGrams, weightUnit)} lye water (
              {lyeGrams > 0 && Math.abs(allocation.lyeWaterGrams / lyeGrams - 1) > 0.005
                ? `${(allocation.lyeWaterGrams / lyeGrams).toFixed(2)} : 1`
                : '1 : 1'}
              ) +{' '}
              {formatWeight(totalGrams, weightUnit)} alternative liquid ={' '}
              {formatWeight(allocation.targetLiquidGrams, weightUnit)} total liquid
            </p>
          )}
          {acidExtraLye && (acidExtraLye.naohGrams > 0 || acidExtraLye.kohGrams > 0) && (
            <p className="split-liquid-note">
              {`${[
                acidExtraLye.naohGrams > 0
                  ? `+${formatWeight(acidExtraLye.naohGrams, weightUnit)} NaOH`
                  : null,
                acidExtraLye.kohGrams > 0
                  ? `+${formatWeight(acidExtraLye.kohGrams, weightUnit)} KOH`
                  : null,
              ]
                .filter(Boolean)
                .join(' and ')} added to offset the acid — already included in the lye figures.`}
            </p>
          )}
          {showFluidityNote && (
            <p className="split-liquid-note">
              Thick liquids — a meaningful share of them isn&apos;t water, so expect a
              thicker, faster trace than the water figure suggests.
            </p>
          )}
          {lyeWaterUnverifiable && (
            <p className="split-liquid-warning" role="alert">
              Can&apos;t verify the lye will dissolve — an alternative liquid in the lye
              water has no declared water content, so it is left out of the check. Declare
              its % water, or move it to trace.
            </p>
          )}
          {showShortfall && (
            <p className="split-liquid-warning" role="alert">
              Not enough water to dissolve the lye: the solution has{' '}
              {formatWeight(lyeWaterStatus!.effectiveWaterGrams, weightUnit)} of real water
              against the {formatWeight(lyeWaterStatus!.floorGrams, weightUnit)} minimum —
              equal parts water and lye — needed to dissolve it. Add at least{' '}
              {formatWeight(lyeWaterStatus!.shortfallGrams, weightUnit)} more water, or move
              liquids to trace instead.
            </p>
          )}
          {waterSuggestion && waterSuggestion.reductionGrams > 0 && (
            <div className="split-liquid-suggestion">
              <p>
                Suggested lye water:{' '}
                <strong>{formatWeight(waterSuggestion.suggestedWaterGrams, weightUnit)}</strong>
                <span className="results-excluded">
                  {' '}
                  (reduce by {formatWeight(waterSuggestion.reductionGrams, weightUnit)})
                </span>
              </p>
              {canApplyWater && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() =>
                    onApplySuggestedWater!(
                      formatInputNumber(waterSuggestion.suggestedWaterPercentOfOils!, 1),
                    )
                  }
                >
                  Apply {formatInputNumber(waterSuggestion.suggestedWaterPercentOfOils!, 1)}% water
                  of oils
                </button>
              )}
              {manualHint && (
                <p className="split-liquid-suggestion__hint">{manualHint}</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
