import { useEffect } from 'react';
import {
  LS_DILUTION_TARGETS,
  LS_SOLUTION_DENSITY_G_PER_ML,
  lsConcentrationAboveAllMinimums,
  lsDilutionUsesFor,
  lsFinishedVolumeMl,
  type DilutionResult,
} from '@soap-calc/core';
import { formatConcentrationPercent } from '../lib/format';
import { formatWeight, formatWeightWithAlternates } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

export type DilutionMode = 'concentration' | 'ratio';

type DilutionPanelProps = {
  dilution: DilutionResult | null;
  soapConcentrationPercent: string;
  onSoapConcentrationChange: (value: string) => void;
  weightUnit: WeightUnit;
  /** Water the recipe's alternative liquids already put in the paste. Deducted from the
   * dilution figure upstream; passed here only so the readout can say so. */
  altLiquidWaterGrams?: number;
  /** Grams of that liquid whose water content was never declared. Non-zero makes every
   * figure here a lower bound rather than a measurement. */
  unknownLiquidGrams?: number;
  /** The over-dilution verdict holds whatever the undeclared liquid contains, so it is
   * stated as fact rather than hedged. */
  overDilutionCertain?: boolean;
  /** The mass of finished product (solution base + additives, append-mode post-cook oil,
   * split-liquid solids — see computeBottledSolutionGrams). Shown as its own row when it
   * differs from the solution, and it is what the finished VOLUME is derived from. The
   * dilution figures themselves stay chemistry-only. */
  bottledSolutionGrams?: number | null;
  /** The paste's true water (lye water + split-liquid water) — see useRecipeViewModel's
   * cookWaterGrams. Ratio mode needs the real paste mass (anhydrousGrams + this), not
   * dilution.totalWaterGrams - dilutionWaterGrams, which the targetExceedsPaste clamp can
   * zero out. */
  cookWaterGrams?: number;
  /** Which way the maker is choosing the dilution: a target concentration (the default,
   * and what the reference calls out at LS:1536), or a water:paste ratio by weight
   * (LS:1534 — 1:1 / 2:1 / 3:1). Session-local UI state, not a recipe setting. */
  dilutionMode?: DilutionMode;
  onDilutionModeChange?: (mode: DilutionMode) => void;
  /** Water:paste ratio by weight, as typed (e.g. "2" for 2:1). */
  waterPasteRatio?: string;
  onWaterPasteRatioChange?: (value: string) => void;
};

export function DilutionPanel({
  dilution,
  soapConcentrationPercent,
  onSoapConcentrationChange,
  weightUnit,
  altLiquidWaterGrams = 0,
  unknownLiquidGrams = 0,
  overDilutionCertain = false,
  bottledSolutionGrams = null,
  cookWaterGrams = 0,
  dilutionMode = 'concentration',
  onDilutionModeChange,
  waterPasteRatio = '',
  onWaterPasteRatioChange,
}: DilutionPanelProps) {
  // Which intended uses the current target suits — the dilution figure is the one number
  // with no chemistry to pin it, so the guidance is by product, not by recipe.
  const suitedUses = lsDilutionUsesFor(Number(soapConcentrationPercent));
  // Ratio mode (LS:1534): weigh the paste, then add water at 1:1 / 2:1 / 3:1 by weight.
  // pasteGrams is anhydrousGrams + the paste's TRUE water — not dilution.totalWaterGrams -
  // dilutionWaterGrams, which the targetExceedsPaste clamp on dilutionWaterGrams can zero
  // out (see DilutionPanelProps.cookWaterGrams and PartialDilution's identical trap).
  const ratioNum = Number(waterPasteRatio);
  const ratioValid = Number.isFinite(ratioNum) && ratioNum > 0;
  const pasteGrams = dilution ? dilution.anhydrousGrams + cookWaterGrams : null;
  const ratioWaterGrams =
    dilution && pasteGrams !== null && ratioValid ? pasteGrams * ratioNum : null;
  const ratioSolutionGrams =
    pasteGrams !== null && ratioWaterGrams !== null ? pasteGrams + ratioWaterGrams : null;
  const ratioConcentrationPercent =
    dilution && ratioSolutionGrams !== null && ratioSolutionGrams > 0
      ? (dilution.anhydrousGrams / ratioSolutionGrams) * 100
      : null;
  // The ratio is an alternative way to CHOOSE the concentration, not a parallel result:
  // vm.dilution, PartialDilution, BottleCalculator and the printed BatchSheet all read the
  // persisted concentration, so without this write-back the app would show the ratio's own
  // water figure here beside a different figure everywhere else. Effect deps deliberately
  // exclude soapConcentrationPercent (what this writes) and onSoapConcentrationChange (a
  // fresh function every render) — only the ratio-mode inputs should retrigger it.
  useEffect(() => {
    if (dilutionMode === 'ratio' && ratioConcentrationPercent !== null) {
      onSoapConcentrationChange(String(Math.round(ratioConcentrationPercent * 10) / 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dilutionMode, ratioConcentrationPercent]);
  const bottledGrams = bottledSolutionGrams ?? dilution?.solutionGrams ?? null;
  // Every other figure here is mass. Volume is what tells a maker whether their dilution
  // vessel and packaging are big enough, and it is what the separate bottle count works
  // from — so the density bridge is shown here rather than left implicit.
  const finishedVolumeMl = bottledGrams !== null ? lsFinishedVolumeMl(bottledGrams) : null;
  // Show the product mass whenever it differs from the solution row, so the finished
  // VOLUME below (derived from it, not from the solution) reconciles with what is above it.
  const showBottledRow =
    dilution !== null && bottledGrams !== null && bottledGrams > dilution.solutionGrams + 0.5;
  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Dilution</h2>
          <p className="panel__subtitle">Water to add to reach a target soap concentration</p>
        </div>
      </div>
      {/* Two ways to choose the same number (LS:1534 ratio vs. LS:1536 concentration) —
          concentration is the default, and switching never clears the other mode's input,
          since each is its own bit of App state. */}
      <div className="dilution-mode-toggle" role="radiogroup" aria-label="Dilution input mode">
        <label className="field field--inline">
          <input
            type="radio"
            name="dilutionMode"
            checked={dilutionMode === 'concentration'}
            onChange={() => onDilutionModeChange?.('concentration')}
          />
          <span>Target concentration</span>
        </label>
        <label className="field field--inline">
          <input
            type="radio"
            name="dilutionMode"
            checked={dilutionMode === 'ratio'}
            onChange={() => onDilutionModeChange?.('ratio')}
          />
          <span>Water : paste ratio</span>
        </label>
      </div>
      {dilutionMode === 'ratio' ? (
        <label className="field">
          <span>Water : paste ratio (by weight)</span>
          <input
            type="number"
            className="input input--number"
            min={0.5}
            step={0.5}
            value={waterPasteRatio}
            onChange={(e) => onWaterPasteRatioChange?.(e.target.value)}
            aria-label="Water to paste ratio"
          />
        </label>
      ) : (
        <label className="field">
          <span>Target soap concentration (%)</span>
          <input
            type="number"
            className="input input--number"
            min={1}
            max={99}
            step={1}
            value={soapConcentrationPercent}
            onChange={(e) => onSoapConcentrationChange(e.target.value)}
            aria-label="Target soap concentration percent"
          />
        </label>
      )}
      {dilutionMode === 'ratio' && ratioConcentrationPercent !== null && ratioWaterGrams !== null && (
        <dl className="results-grid">
          <div className="results-grid__item results-grid__item--primary">
            <dt>Water to add at this ratio</dt>
            <dd>{formatWeightWithAlternates(ratioWaterGrams, weightUnit)}</dd>
          </div>
        </dl>
      )}
      {dilutionMode === 'ratio' && ratioConcentrationPercent !== null && (
        <p className="results-hint">
          <strong>
            {waterPasteRatio}:1 water:paste lands at{' '}
            {formatConcentrationPercent(ratioConcentrationPercent)}% soap.
          </strong>
        </p>
      )}
      {dilution ? (
        <>
          <dl className="results-grid">
            <div className="results-grid__item results-grid__item--primary">
              <dt>Dilution water to add</dt>
              <dd>{formatWeightWithAlternates(dilution.dilutionWaterGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Paste (anhydrous)</dt>
              <dd>{formatWeight(dilution.anhydrousGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Finished solution</dt>
              <dd>{formatWeight(dilution.solutionGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Total water</dt>
              <dd>{formatWeight(dilution.totalWaterGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Glycerin (retained)</dt>
              <dd>{formatWeight(dilution.glycerinGrams, weightUnit)}</dd>
            </div>
            {showBottledRow && bottledGrams !== null && (
              <div className="results-grid__item">
                <dt>≈ Finished product</dt>
                <dd>{formatWeight(bottledGrams, weightUnit)}</dd>
              </div>
            )}
            {finishedVolumeMl !== null && (
              <div className="results-grid__item">
                <dt>≈ Finished volume</dt>
                <dd>{Math.round(finishedVolumeMl).toLocaleString('en-US')} ml</dd>
              </div>
            )}
          </dl>
          {/* LS:1531 — shown regardless of which figure (concentration or ratio) the maker
              started from, since the swelling and absorbing it describes happens either way. */}
          <p className="results-hint">
            Whichever figure you start from, add the water in stages: enough to cover the paste,
            then more in small amounts, and give it time between — the paste swells and keeps
            absorbing. Recording where you stopped makes the next batch of the same recipe exact.
          </p>
          {finishedVolumeMl !== null && (
            <p className="results-hint">
              Volume assumes ~{LS_SOLUTION_DENSITY_G_PER_ML} g/ml — a planning figure, not
              a measured density. Weigh a known volume of your own solution if it has to be
              exact.
            </p>
          )}
          {dilution.targetExceedsPaste && (unknownLiquidGrams === 0 || overDilutionCertain) && (
            <p className="results-hint" role="alert">
              The paste is already more dilute than {formatConcentrationPercent(dilution.soapConcentrationPercent)}% — adding water
              only lowers the concentration further.
            </p>
          )}
          {dilution.targetExceedsPaste && unknownLiquidGrams > 0 && !overDilutionCertain && (
            // Suppressed, not reworded: targetExceedsPaste is a factual claim about the
            // paste, and it was derived from an ASSUMED water content. Asserting it can tell
            // the user a batch is finished when it still needs hundreds of grams of water.
            <p className="results-hint">
              Can&apos;t tell whether {formatConcentrationPercent(dilution.soapConcentrationPercent)}% is reachable —{' '}
              {formatWeight(unknownLiquidGrams, weightUnit)} of alternative liquid has no
              declared water content. Declare its % water in Split liquid.
            </p>
          )}
          {altLiquidWaterGrams > 0 && unknownLiquidGrams === 0 && (
            <p className="results-hint">
              Already {formatWeight(altLiquidWaterGrams, weightUnit)} lighter: that much
              water came in with the alternative liquid and is counted as part of the paste.
              Top up with plain distilled water only.
            </p>
          )}
          {/* Floor hint only when a positive floor exists. When the target already exceeds the
              paste, the can't-tell / certain-alert branches above own the message — rendering
              this too repeated "declare its % water" verbatim and printed a vacuous
              "0 g is the LEAST you will need". */}
          {altLiquidWaterGrams > 0 && unknownLiquidGrams > 0 && !dilution.targetExceedsPaste && (
            <p className="results-hint">
              {formatWeight(unknownLiquidGrams, weightUnit)} of alternative liquid has no
              declared water content — it is counted as all water, so{' '}
              {formatWeight(dilution.dilutionWaterGrams, weightUnit)} is the LEAST you will
              need. Declare its % water, or dilute in increments and check by weight.
            </p>
          )}
          <p className="results-hint">
            Minimum dilution is a property of the recipe, not the product: coconut-heavy soaps
            hold up to ~40% soap, most blends 25–35%, castile ~25%. Past that the soap thickens
            or sets.
            {lsConcentrationAboveAllMinimums(Number(soapConcentrationPercent))
              ? ' This target is above what even a coconut-heavy recipe holds as a liquid.'
              : ''}
          </p>
          <details className="results-hint dilution-uses">
            <summary>
              {suitedUses.length > 0
                ? `At ${formatConcentrationPercent(dilution.soapConcentrationPercent)}% this suits ${suitedUses
                    .map((u) => u.label.toLowerCase())
                    .join(', ')}`
                : `No common use calls for ${formatConcentrationPercent(dilution.soapConcentrationPercent)}% — see the usual targets`}
            </summary>
            <dl className="dilution-uses__list">
              {LS_DILUTION_TARGETS.map((t) => (
                <div
                  key={t.key}
                  className={
                    suitedUses.some((u) => u.key === t.key)
                      ? 'dilution-uses__row dilution-uses__row--match'
                      : 'dilution-uses__row'
                  }
                >
                  <dt>{t.label}</dt>
                  <dd>
                    {t.low === t.high ? `${t.low}%` : `${t.low}–${t.high}%`} soap
                    {t.note ? <span className="results-excluded"> {t.note}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              Diluting further and thickening with salt is the cheaper way to a thick soap —
              water costs a fraction of what the oils did. Not recommended for hair.
            </p>
          </details>
        </>
      ) : (
        <p className="results-hint">Enter oils and a target concentration (1–99%) to compute dilution.</p>
      )}
    </section>
  );
}
