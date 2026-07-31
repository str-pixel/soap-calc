import {
  LS_DILUTION_TARGETS,
  lsBottleCount,
  lsConcentrationAboveAllMinimums,
  lsDilutionUsesFor,
  type DilutionResult,
} from '@soap-calc/core';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type DilutionPanelProps = {
  dilution: DilutionResult | null;
  soapConcentrationPercent: string;
  onSoapConcentrationChange: (value: string) => void;
  weightUnit: WeightUnit;
  /** Bottle size in ml for the "bottles filled" readout below. */
  bottleSizeMl: string;
  onBottleSizeMlChange: (value: string) => void;
  /** Water the recipe's alternative liquids already put in the paste. Deducted from the
   * dilution figure upstream; passed here only so the readout can say so. */
  altLiquidWaterGrams?: number;
  /** Grams of that liquid whose water content was never declared. Non-zero makes every
   * figure here a lower bound rather than a measurement. */
  unknownLiquidGrams?: number;
  /** The over-dilution verdict holds whatever the undeclared liquid contains, so it is
   * stated as fact rather than hedged. */
  overDilutionCertain?: boolean;
  /** Grams bottled with the solution but outside the anhydrous+water figure: additives
   * (solution-dosed and otherwise), append-mode post-cook oil, split-liquid solids.
   * Counted into the bottle estimate only — the dilution figures stay chemistry-only. */
  finishedExtrasGrams?: number;
};

export function DilutionPanel({
  dilution,
  soapConcentrationPercent,
  onSoapConcentrationChange,
  weightUnit,
  bottleSizeMl,
  onBottleSizeMlChange,
  altLiquidWaterGrams = 0,
  unknownLiquidGrams = 0,
  overDilutionCertain = false,
  finishedExtrasGrams = 0,
}: DilutionPanelProps) {
  const bottleMl = Number(bottleSizeMl);
  // Which intended uses the current target suits — the dilution figure is the one number
  // with no chemistry to pin it, so the guidance is by product, not by recipe.
  const suitedUses = lsDilutionUsesFor(Number(soapConcentrationPercent));
  const bottleCount =
    dilution && Number.isFinite(bottleMl) && bottleMl > 0
      ? lsBottleCount(dilution.solutionGrams + finishedExtrasGrams, bottleMl)
      : null;
  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Dilution</h2>
          <p className="panel__subtitle">Water to add to reach a target soap concentration</p>
        </div>
      </div>
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
      <label className="field">
        <span>Bottle size (ml)</span>
        <input
          type="number"
          className="input input--number"
          min={1}
          step={1}
          value={bottleSizeMl}
          onChange={(e) => onBottleSizeMlChange(e.target.value)}
          aria-label="Bottle size (ml)"
        />
      </label>
      {dilution ? (
        <>
          <dl className="results-grid">
            <div className="results-grid__item results-grid__item--primary">
              <dt>Dilution water to add</dt>
              <dd>{formatWeight(dilution.dilutionWaterGrams, weightUnit)}</dd>
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
            {bottleCount !== null && (
              <div className="results-grid__item">
                <dt>≈ Bottles filled ({bottleSizeMl} ml)</dt>
                <dd>{bottleCount}</dd>
              </div>
            )}
          </dl>
          {dilution.targetExceedsPaste && (unknownLiquidGrams === 0 || overDilutionCertain) && (
            <p className="results-hint" role="alert">
              The paste is already more dilute than {dilution.soapConcentrationPercent}% — adding water
              only lowers the concentration further.
            </p>
          )}
          {dilution.targetExceedsPaste && unknownLiquidGrams > 0 && !overDilutionCertain && (
            // Suppressed, not reworded: targetExceedsPaste is a factual claim about the
            // paste, and it was derived from an ASSUMED water content. Asserting it can tell
            // the user a batch is finished when it still needs hundreds of grams of water.
            <p className="results-hint">
              Can&apos;t tell whether {dilution.soapConcentrationPercent}% is reachable —{' '}
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
                ? `At ${dilution.soapConcentrationPercent}% this suits ${suitedUses
                    .map((u) => u.label.toLowerCase())
                    .join(', ')}`
                : `No common use calls for ${dilution.soapConcentrationPercent}% — see the usual targets`}
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
