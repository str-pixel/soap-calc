import { lsBottleCount, lsFinishedVolumeMl } from '@soap-calc/core';

type BottleCalculatorProps = {
  /** Mass of finished product available to bottle, grams. Null before a dilution exists. */
  finishedGrams: number | null;
  bottleSizeMl: string;
  onBottleSizeMlChange: (value: string) => void;
};

/**
 * Bottling is a step AFTER the batch dilution, not a part of it: a maker dilutes one large
 * batch and bottles from it later, often into more than one size. So this lives on its own
 * and stays collapsed until wanted, rather than putting a bottle-size field and a count in
 * among the dilution figures — the Dilution panel answers "how much soap did I make", this
 * answers "how do I package it".
 */
export function BottleCalculator({
  finishedGrams,
  bottleSizeMl,
  onBottleSizeMlChange,
}: BottleCalculatorProps) {
  const volumeMl = finishedGrams !== null ? lsFinishedVolumeMl(finishedGrams) : null;
  if (finishedGrams === null || volumeMl === null) return null;
  const bottleMl = Number(bottleSizeMl);
  const count =
    bottleSizeMl.trim() !== '' && Number.isFinite(bottleMl) && bottleMl > 0
      ? lsBottleCount(finishedGrams, bottleMl)
      : null;
  // The floor hides a part-bottle; naming it keeps the count reconcilable with the volume.
  // FLOOR, not round: a 499.5 ml remainder shown as "500 ml" beside "Bottles filled
  // (500 ml)" reads as an uncounted extra bottle.
  const leftoverMl = count !== null ? Math.floor(volumeMl - count * bottleMl) : null;

  return (
    <details className="panel panel--nested">
      {/* "— whole batch" is load-bearing, not decorative: this panel always reads
          `finishedGrams` for the ENTIRE batch, never a smaller amount sized in "Dilute
          part of the batch" just above it. Without the qualifier, a maker who just sized a
          1,200 ml portion there and opens this panel right below it can misread its count
          as being about that portion — the subtitle repeats the point for the same reason. */}
      <summary className="panel__title">Bottle count — whole batch</summary>
      <p className="panel__subtitle">
        Whole bottles the ENTIRE batch fills, from its {Math.round(volumeMl).toLocaleString('en-US')} ml
        — not a smaller amount sized above, if you used one.
      </p>
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
      {count !== null && (
        <dl className="results-grid">
          <div className="results-grid__item">
            <dt>≈ Bottles filled ({bottleSizeMl} ml)</dt>
            <dd>{count}</dd>
          </div>
          {leftoverMl !== null && leftoverMl > 0 && (
            <div className="results-grid__item">
              <dt>Left over (part bottle)</dt>
              <dd>{leftoverMl.toLocaleString('en-US')} ml</dd>
            </div>
          )}
        </dl>
      )}
    </details>
  );
}
