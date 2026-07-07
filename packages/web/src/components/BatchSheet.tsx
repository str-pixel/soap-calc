import { formatSoapPropertyPercent } from '@soap-calc/core';
import type { BatchSheetData } from '../lib/batchSheet';
import {
  additiveStageLabel,
  batchSheetOilName,
  formatBatchSheetProperty,
  formatBatchWeight,
} from '../lib/batchSheet';
import { formatGrams } from '../lib/format';
import { formatWeight } from '../lib/weightUnits';

type BatchSheetProps = {
  data: BatchSheetData | null;
};

export function BatchSheet({ data }: BatchSheetProps) {
  if (!data) return null;

  const {
    recipeName,
    printedAt,
    batchNotes,
    weightUnit,
    lyeLabel,
    settings,
    lines,
    linePercents,
    result,
    displayTotals,
    additives,
    splitLiquid,
    splitLiquidGrams,
    properties,
    indexes,
    batchWeightWithExtras,
  } = data;

  const includedLines = result.lines.filter((line) => line.includedInLye && line.weightGrams > 0);
  const additiveGrams = additives.reduce((sum, item) => sum + item.grams, 0);
  const extrasGrams = additiveGrams + (splitLiquidGrams ?? 0);

  return (
    <article className="batch-sheet" aria-hidden="true">
      <header className="batch-sheet__header">
        <h1>{recipeName}</h1>
        <p className="batch-sheet__meta">Printed {printedAt}</p>
      </header>

      <section className="batch-sheet__section">
        <h2>Oils</h2>
        <table className="batch-sheet__table">
          <thead>
            <tr>
              <th scope="col">Oil</th>
              <th scope="col">Weight</th>
              <th scope="col">%</th>
            </tr>
          </thead>
          <tbody>
            {lines
              .filter((line) => Number(line.weightGrams) > 0)
              .map((line) => (
                <tr key={line.key}>
                  <td>{batchSheetOilName(line.oilId)}</td>
                  <td>{formatWeight(Number(line.weightGrams), weightUnit)}</td>
                  <td>{formatGrams(linePercents.get(line.key) ?? 0, 1)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section className="batch-sheet__section">
        <h2>Lye solution</h2>
        <dl className="batch-sheet__dl">
          <div>
            <dt>{lyeLabel}</dt>
            <dd>{formatWeight(result.lyeWeightGrams, weightUnit)}</dd>
          </div>
          <div>
            <dt>Water</dt>
            <dd>{formatWeight(result.waterWeightGrams, weightUnit)}</dd>
          </div>
          <div>
            <dt>Superfat</dt>
            <dd>{settings.superfatPercent}%</dd>
          </div>
          <div>
            <dt>Lye concentration</dt>
            <dd>{formatGrams(result.lyeConcentrationPercent, 1)}%</dd>
          </div>
          <div>
            <dt>Water : lye</dt>
            <dd>{formatGrams(result.waterLyeRatio, 2)} : 1</dd>
          </div>
          <div>
            <dt>Oil weight</dt>
            <dd>{formatWeight(displayTotals.recipeOilWeightGrams, weightUnit)}</dd>
          </div>
          <div>
            <dt>Batch weight</dt>
            <dd>
              {formatBatchWeight(batchWeightWithExtras, weightUnit)}
              {extrasGrams > 0 ? ' (with additives)' : ''}
            </dd>
          </div>
        </dl>
      </section>

      {includedLines.length > 0 && (
        <section className="batch-sheet__section">
          <h2>Lye per oil</h2>
          <table className="batch-sheet__table">
            <thead>
              <tr>
                <th scope="col">Oil</th>
                <th scope="col">Oil weight</th>
                <th scope="col">{lyeLabel}</th>
              </tr>
            </thead>
            <tbody>
              {includedLines.map((line) => (
                <tr key={line.oilId}>
                  <td>{batchSheetOilName(line.oilId)}</td>
                  <td>{formatWeight(line.weightGrams, weightUnit)}</td>
                  <td>{formatWeight(line.lyeGrams, weightUnit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(additives.length > 0 || (splitLiquid?.enabled && splitLiquidGrams)) && (
        <section className="batch-sheet__section">
          <h2>Additives &amp; liquids</h2>
          <ul className="batch-sheet__list">
            {splitLiquid?.enabled && splitLiquidGrams !== null && splitLiquidGrams > 0 && (
              <li>
                {splitLiquid.name.trim() || 'Alternative liquid'} —{' '}
                {formatWeight(splitLiquidGrams, weightUnit)} (
                {additiveStageLabel(splitLiquid.addAt)})
              </li>
            )}
            {additives.map((item) => (
              <li key={item.key}>
                {item.name} — {formatWeight(item.grams, weightUnit)} (
                {formatGrams(item.percentOfOil, 1)}% of oil, {additiveStageLabel(item.addAt)})
              </li>
            ))}
          </ul>
        </section>
      )}

      {properties?.properties && (
        <section className="batch-sheet__section">
          <h2>Estimated bar properties</h2>
          <dl className="batch-sheet__dl batch-sheet__dl--compact">
            <div>
              <dt>Hardness</dt>
              <dd>{formatSoapPropertyPercent(properties.properties.hardness)}</dd>
            </div>
            <div>
              <dt>Cleansing</dt>
              <dd>{formatSoapPropertyPercent(properties.properties.cleansing)}</dd>
            </div>
            <div>
              <dt>Conditioning</dt>
              <dd>{formatSoapPropertyPercent(properties.properties.condition)}</dd>
            </div>
            <div>
              <dt>Bubbly</dt>
              <dd>{formatSoapPropertyPercent(properties.properties.bubbly)}</dd>
            </div>
            <div>
              <dt>Creamy</dt>
              <dd>{formatSoapPropertyPercent(properties.properties.creamy)}</dd>
            </div>
            {indexes.iodine !== null && (
              <div>
                <dt>Iodine</dt>
                <dd>{formatBatchSheetProperty(indexes.iodine)}</dd>
              </div>
            )}
            {indexes.ins !== null && (
              <div>
                <dt>INS</dt>
                <dd>{formatBatchSheetProperty(indexes.ins)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {result.warnings.length > 0 && (
        <section className="batch-sheet__section">
          <h2>Warnings</h2>
          <ul className="batch-sheet__list">
            {result.warnings.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </section>
      )}

      {batchNotes.trim() && (
        <section className="batch-sheet__section">
          <h2>Process notes</h2>
          <p className="batch-sheet__notes">{batchNotes.trim()}</p>
        </section>
      )}

      <footer className="batch-sheet__footer">
        <p>Verify all weights before making. Wear eye protection and gloves when handling lye.</p>
      </footer>
    </article>
  );
}
