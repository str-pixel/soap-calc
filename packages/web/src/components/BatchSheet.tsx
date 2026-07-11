import { memo, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  formatSoapPropertyPercent,
  LOW_COVERAGE_PERCENT,
  saturatedUnsaturatedRatio,
} from '@soap-calc/core';
import type { BatchSheetData } from '../lib/batchSheet';
import {
  additiveStageLabel,
  batchSheetOilName,
  formatBatchSheetProperty,
  formatBatchWeight,
} from '../lib/batchSheet';
import { computeExtrasGrams } from '../lib/calculateAdditives';
import { formatGrams } from '../lib/format';
import { formatDose } from '../lib/formatDose';
import { formatWeight } from '../lib/weightUnits';

type BatchSheetProps = {
  data: BatchSheetData | null;
};

// memo: `data` is a stable view-model memo output; this print-only tree is large,
// so skip re-rendering it on unrelated keystrokes.
export const BatchSheet = memo(function BatchSheet({ data }: BatchSheetProps) {
  const [printedAt, setPrintedAt] = useState(() => new Date().toLocaleString());
  // The sheet's data is memoized long before the user hits Print, so a baked-in
  // timestamp would show generation time. beforeprint fires ahead of the print
  // snapshot; flushSync makes the re-render land inside the handler. Some WebKit
  // print paths never fire beforeprint, so also listen for the print media query
  // (guarded — jsdom has no matchMedia).
  useEffect(() => {
    const stamp = () => flushSync(() => setPrintedAt(new Date().toLocaleString()));
    window.addEventListener('beforeprint', stamp);
    const printMedia =
      typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
    const onMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) stamp();
    };
    printMedia?.addEventListener?.('change', onMediaChange);
    return () => {
      window.removeEventListener('beforeprint', stamp);
      printMedia?.removeEventListener?.('change', onMediaChange);
    };
  }, []);

  if (!data) return null;

  const {
    recipeName,
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
    postCookSuperfat,
    postCookSuperfatMethod,
    dilution,
    properties,
    indexes,
    batchWeightWithExtras,
    waterModeLabel,
    fattyAcids,
    insights,
    process,
  } = data;

  const mainSuperfatPercent = Number(settings.superfatPercent) || 0;
  const includedLines = result.lines.filter((line) => line.includedInLye && line.weightGrams > 0);
  const extrasGrams = computeExtrasGrams(
    additives,
    splitLiquidGrams,
    postCookSuperfat,
    postCookSuperfatMethod,
  );

  const isDualLye = settings.lyeType === 'dual';
  const satUnsat = fattyAcids.profile ? saturatedUnsaturatedRatio(fattyAcids.profile) : null;
  const propsPartial = !!properties?.properties && properties.coveragePercent < 99.9;
  // Compare rounded coverage, matching PropertiesPanel/FattyAcidPanel, so the printed
  // "X%" and the estimate treatment never disagree with the screen.
  const propsLow =
    !!properties?.properties && Math.round(properties.coveragePercent) < LOW_COVERAGE_PERCENT;
  const indexLow =
    (indexes.iodine !== null || indexes.ins !== null) &&
    Math.round(indexes.coveragePercent) < LOW_COVERAGE_PERCENT;
  const fattyAcidsLow = Math.round(fattyAcids.coveragePercent) < LOW_COVERAGE_PERCENT;

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
          {isDualLye ? (
            <>
              <div>
                <dt>NaOH</dt>
                <dd>{formatWeight(result.naohWeightGrams, weightUnit)}</dd>
              </div>
              <div>
                <dt>KOH ({settings.kohBlendPercent || '0'}% by weight)</dt>
                <dd>{formatWeight(result.kohWeightGrams, weightUnit)}</dd>
              </div>
              <div>
                <dt>Total alkali</dt>
                <dd>{formatWeight(result.lyeWeightGrams, weightUnit)}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>{lyeLabel}</dt>
              <dd>{formatWeight(result.lyeWeightGrams, weightUnit)}</dd>
            </div>
          )}
          <div>
            <dt>Water</dt>
            <dd>{formatWeight(result.waterWeightGrams, weightUnit)}</dd>
          </div>
          <div>
            <dt>Water method</dt>
            <dd>{waterModeLabel}</dd>
          </div>
          <div>
            <dt>Superfat</dt>
            <dd>{settings.superfatPercent || '0'}%</dd>
          </div>
          {postCookSuperfat && mainSuperfatPercent >= 0 && (
            <div>
              <dt>Total superfat</dt>
              <dd>
                {formatGrams(
                  (Number(settings.superfatPercent) || 0) + postCookSuperfat.percentOfOil,
                  1,
                )}
                %
              </dd>
            </div>
          )}
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
              {extrasGrams > 0 ? ' (with extras)' : ''}
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
                {isDualLye ? (
                  <>
                    <th scope="col">NaOH</th>
                    <th scope="col">KOH</th>
                    <th scope="col">Total</th>
                  </>
                ) : (
                  <th scope="col">{lyeLabel}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {includedLines.map((line, index) => (
                <tr key={`${line.oilId}-${index}-${line.weightGrams}`}>
                  <td>{batchSheetOilName(line.oilId)}</td>
                  <td>{formatWeight(line.weightGrams, weightUnit)}</td>
                  {isDualLye ? (
                    <>
                      <td>{formatWeight(line.naohGrams, weightUnit)}</td>
                      <td>{formatWeight(line.kohGrams, weightUnit)}</td>
                      <td>{formatWeight(line.lyeGrams, weightUnit)}</td>
                    </>
                  ) : (
                    <td>{formatWeight(line.lyeGrams, weightUnit)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(additives.length > 0 || (splitLiquid?.enabled && splitLiquidGrams) || postCookSuperfat) && (
        <section className="batch-sheet__section">
          <h2>Additives &amp; liquids</h2>
          <ul className="batch-sheet__list">
            {splitLiquid?.enabled && splitLiquidGrams !== null && splitLiquidGrams > 0 && (
              <li>
                {splitLiquid.name.trim() || 'Alternative liquid'} —{' '}
                {formatWeight(splitLiquidGrams, weightUnit)} (
                {additiveStageLabel(splitLiquid.addAt, process)})
              </li>
            )}
            {postCookSuperfat && (
              <li>
                {batchSheetOilName(postCookSuperfat.oilId)} —{' '}
                {formatWeight(postCookSuperfat.grams, weightUnit)} (
                {formatGrams(postCookSuperfat.percentOfOil, 1)}% post-cook superfat)
                {postCookSuperfatMethod === 'subtract' && mainSuperfatPercent >= 0 ? ' — reserved (lye reduced)' : ''}
              </li>
            )}
            {additives.map((item) => (
              <li key={item.key}>
                {item.name} — {formatWeight(item.grams, weightUnit)} (
                {formatDose(item.amount, item.basis, item.unit)}, {additiveStageLabel(item.addAt, process)})
              </li>
            ))}
          </ul>
        </section>
      )}

      {dilution && (
        <section className="batch-sheet__section">
          <h2>Dilution</h2>
          <dl className="batch-sheet__dl">
            <div><dt>Paste (anhydrous)</dt><dd>{formatWeight(dilution.anhydrousGrams, weightUnit)}</dd></div>
            <div><dt>Target concentration</dt><dd>{formatGrams(dilution.soapConcentrationPercent, 0)}%</dd></div>
            <div><dt>Dilution water to add</dt><dd>{formatWeight(dilution.dilutionWaterGrams, weightUnit)}</dd></div>
            <div><dt>Finished solution</dt><dd>{formatWeight(dilution.solutionGrams, weightUnit)}</dd></div>
            <div><dt>Glycerin (retained)</dt><dd>{formatWeight(dilution.glycerinGrams, weightUnit)}</dd></div>
          </dl>
        </section>
      )}

      {properties?.properties && (
        <section className="batch-sheet__section">
          <h2>Estimated bar properties</h2>
          <dl className="batch-sheet__dl batch-sheet__dl--compact">
            <div>
              <dt>Hardness</dt>
              <dd>{propsLow ? '~' : ''}{formatSoapPropertyPercent(properties.properties.hardness)}</dd>
            </div>
            <div>
              <dt>Cleansing</dt>
              <dd>{propsLow ? '~' : ''}{formatSoapPropertyPercent(properties.properties.cleansing)}</dd>
            </div>
            <div>
              <dt>Conditioning</dt>
              <dd>{propsLow ? '~' : ''}{formatSoapPropertyPercent(properties.properties.condition)}</dd>
            </div>
            <div>
              <dt>Bubbly</dt>
              <dd>{propsLow ? '~' : ''}{formatSoapPropertyPercent(properties.properties.bubbly)}</dd>
            </div>
            <div>
              <dt>Creamy</dt>
              <dd>{propsLow ? '~' : ''}{formatSoapPropertyPercent(properties.properties.creamy)}</dd>
            </div>
            {indexes.iodine !== null && (
              <div>
                <dt>Iodine</dt>
                <dd>{indexLow ? '~' : ''}{formatBatchSheetProperty(indexes.iodine)}</dd>
              </div>
            )}
            {indexes.ins !== null && (
              <div>
                <dt>INS</dt>
                <dd>{indexLow ? '~' : ''}{formatBatchSheetProperty(indexes.ins)}</dd>
              </div>
            )}
          </dl>
          {propsPartial && (
            <p className="batch-sheet__notes">
              {propsLow ? 'Estimated from' : 'Based on'}{' '}
              {Math.round(properties.coveragePercent)}% of recipe oils
              {properties.missingOilIds.length > 0
                ? ` (no data: ${properties.missingOilIds.map(batchSheetOilName).join(', ')})`
                : ''}
            </p>
          )}
        </section>
      )}

      {satUnsat && (
        <section className="batch-sheet__section">
          <h2>Fatty acids</h2>
          <p className="batch-sheet__notes">
            Saturated {fattyAcidsLow ? '~' : ''}{formatSoapPropertyPercent(satUnsat.saturated)} · Unsaturated{' '}
            {fattyAcidsLow ? '~' : ''}{formatSoapPropertyPercent(satUnsat.unsaturated)}
            {fattyAcids.coveragePercent < 99.9
              ? ` (${Math.round(fattyAcids.coveragePercent)}% of oils with data)`
              : ''}
          </p>
        </section>
      )}

      {insights.length > 0 && (
        <section className="batch-sheet__section">
          <h2>Formulation notes</h2>
          <ul className="batch-sheet__list">
            {insights.map((item) => (
              <li key={item.code}>{item.message}</li>
            ))}
          </ul>
        </section>
      )}

      {result.errors.length > 0 && (
        <section className="batch-sheet__section">
          <h2>Errors</h2>
          <ul className="batch-sheet__list batch-sheet__list--error">
            {result.errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
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
});
