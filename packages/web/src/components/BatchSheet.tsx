import { memo, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  alternativeLiquidPreset,
  effectiveSuperfatPercent,
  formatPropertyScore,
  formatSoapPropertyPercent,
  lsFinishedVolumeMl,
  LOW_COVERAGE_PERCENT,
  saturatedUnsaturatedRatio,
  fToC,
} from '@soap-calc/core';
import type { BatchSheetData } from '../lib/batchSheet';
import {
  additiveStageLabel,
  batchSheetOilName,
  formatBatchSheetProperty,
  formatBatchWeight,
} from '../lib/batchSheet';
import { formatConcentrationPercent, formatGrams } from '../lib/format';
import { splitLiquidProcedureStep } from '../lib/recipeSummary';
import { formatDose } from '../lib/formatDose';
import { formatWeight } from '../lib/weightUnits';
import {
  correctedDilutionWaterGrams,
  measuredPasteIsValidFor,
  parseMeasuredPasteGrams,
} from '../lib/measuredPaste';

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
    splitLiquidRows,
    splitLiquidGrams,
    postCookSuperfat,
    pcsfIsExtra,
    extrasGrams,
    dilution,
    measuredPasteGrams,
    measuredPasteIsRemaining,
    bottledSolutionGrams,
    neutralization,
    properties,
    indexes,
    batchWeightWithExtras,
    waterModeLabel,
    fattyAcids,
    insights,
    process,
  } = data;

  const modeled = fattyAcids.modeledOilIds;

  const mainSuperfatPercent = Number(settings.superfatPercent) || 0;
  const includedLines = result.lines.filter((line) => line.includedInLye && line.weightGrams > 0);

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
  // A valid measured paste corrects the printed dilution water the same way it corrects
  // DilutionPanel's on-screen batch row (lib/measuredPaste, shared so both surfaces always
  // show the same number) — and, per Task 5, OUTRANKS targetExceedsPaste below, since that
  // flag is derived from the recipe's ASSUMED cook water and the measurement is direct
  // evidence against it.
  //
  // The corrected basis and the cook water go into the validity gate too, not only into the
  // water figure below: the floor under a reading counts an alternative liquid's solids, and
  // the sheet is the page carried to the bench — it must refuse exactly what the panel
  // refuses, or the two would disagree about whether the maker's own reading was usable.
  const measuredPasteValid = dilution
    ? measuredPasteIsValidFor(
        measuredPasteGrams,
        dilution,
        measuredPasteIsRemaining,
        data.wholeBatchPasteGrams,
        data.cookWaterGrams,
      )
    : false;
  // wholeBatchPasteGrams is the second correction the shared helper applies: an alternative
  // liquid's non-water solids are real mass in the pot that calculateDilution's
  // anhydrous + water arithmetic never counts, so the recipe's own dilutionWaterGrams
  // prescribes the solids' worth of extra water. DilutionPanel's ratio block has always
  // poured off the corrected paste, so this row and that one used to differ by exactly the
  // solids — with the sheet, the page actually carried to the scale, holding the wrong one.
  // Whether the printed figures came off the corrected paste, which decides whether the
  // undeclared-liquid caveat below reads as a floor or as "the same either way".
  const hasCorrectedPasteBasis =
    data.wholeBatchPasteGrams !== undefined &&
    data.wholeBatchPasteGrams !== null &&
    Number.isFinite(data.wholeBatchPasteGrams) &&
    data.wholeBatchPasteGrams > 0;
  const dilutionWaterGramsPrinted = dilution
    ? correctedDilutionWaterGrams(
        dilution,
        measuredPasteGrams,
        measuredPasteIsRemaining,
        data.wholeBatchPasteGrams,
        data.cookWaterGrams,
      )
    : 0;
  // The sheet is the page taken to the bench, so it must carry what actually gets
  // bottled, not only the chemistry-only solution above: bottledSolutionGrams adds in
  // additives, append-mode post-cook oil, and split-liquid solids, and is bigger than
  // dilution.solutionGrams whenever any of those are present (mirrors DilutionPanel's
  // own bottledGrams/showBottledRow). lsFinishedVolumeMl is the same core helper the
  // on-screen panel uses — never recomputed here.
  const bottledGrams = bottledSolutionGrams ?? dilution?.solutionGrams ?? null;
  const finishedVolumeMl = bottledGrams !== null ? lsFinishedVolumeMl(bottledGrams) : null;
  const showBottledRow =
    dilution !== null && bottledGrams !== null && bottledGrams > dilution.solutionGrams + 0.5;

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
          {data.soapingTempF !== undefined && (
            <div>
              <dt>Soaping temperature</dt>
              <dd>{fToC(data.soapingTempF)} °C ({data.soapingTempF} °F)</dd>
            </div>
          )}
          <div>
            <dt>Superfat</dt>
            <dd>{settings.superfatPercent || '0'}%</dd>
          </div>
          {postCookSuperfat && mainSuperfatPercent >= 0 && (
            <div>
              <dt>Total superfat</dt>
              <dd>
                {formatGrams(
                  effectiveSuperfatPercent(
                    Number(settings.superfatPercent) || 0,
                    postCookSuperfat.percentOfOil,
                  ),
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
        {data.lyeWaterUnverifiable ? (
          <p className="batch-sheet__note">
            The 1:1 lye-dissolution check could not run — an in-lye liquid has no
            declared water content.
          </p>
        ) : null}
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

      {(additives.length > 0 || splitLiquidGrams || postCookSuperfat) && (
        <section className="batch-sheet__section">
          <h2>Additives &amp; liquids</h2>
          <ul className="batch-sheet__list">
            {splitLiquidRows.map(({ row, grams }) => {
              if (grams === null || grams <= 0) return null;
              const step = splitLiquidProcedureStep({ row, grams, weightUnit, process });
              const note = alternativeLiquidPreset(row.presetKey)?.note;
              return (
                <li key={row.key}>
                  {row.name.trim() || 'Alternative liquid'} —{' '}
                  {formatWeight(grams, weightUnit)} ({additiveStageLabel(row.addAt, process)})
                  {step && <div className="batch-sheet__note">{step.step}</div>}
                  {note && <div className="batch-sheet__note">{note}</div>}
                </li>
              );
            })}
            {postCookSuperfat?.oils.map((oil, i) => (
              <li key={`pcsf-${i}`}>
                {batchSheetOilName(oil.oilId)} —{' '}
                {formatWeight(oil.grams, weightUnit)} (
                {formatGrams(oil.percentOfOil, 1)}% post-cook superfat)
                {!pcsfIsExtra ? ' — reserved (lye reduced)' : ''}
              </li>
            ))}
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
            {/* formatConcentrationPercent everywhere the target prints (here and in
                DilutionPanel) — one shared rule, so sheet and panel cannot disagree. */}
            <div><dt>Target concentration</dt><dd>{formatConcentrationPercent(dilution.soapConcentrationPercent)}%</dd></div>
            <div><dt>Dilution water to add</dt><dd>
              {formatWeight(dilutionWaterGramsPrinted, weightUnit)}
              {/* The marker only survives without a corrected paste basis. With one the
                  figure is solutionGrams − (anhydrous + lye water + the liquid's whole
                  mass), and declaring the undeclared liquid's % water moves mass between
                  its water and its solids without moving that sum — so the figure is exact,
                  not a floor, and "(at least)" told the maker to expect a number that can
                  never come. */}
              {data.unknownLiquidGrams &&
              !dilution.targetExceedsPaste &&
              !measuredPasteValid &&
              !hasCorrectedPasteBasis
                ? ' (at least)'
                : ''}
            </dd></div>
            <div><dt>Finished solution</dt><dd>{formatWeight(dilution.solutionGrams, weightUnit)}</dd></div>
            <div><dt>Glycerin (retained)</dt><dd>{formatWeight(dilution.glycerinGrams, weightUnit)}</dd></div>
            {showBottledRow && bottledGrams !== null && (
              <div><dt>≈ Bottled (with extras)</dt><dd>{formatWeight(bottledGrams, weightUnit)}</dd></div>
            )}
            {finishedVolumeMl !== null && (
              <div><dt>≈ Finished volume</dt><dd>{Math.round(finishedVolumeMl).toLocaleString('en-US')} ml</dd></div>
            )}
          </dl>
          {measuredPasteValid && (
            <p className="batch-sheet__note">
              Dilution water above uses the measured paste weight (
              {/* Grams, not the sheet's print unit — the same rule the two on-screen echoes
                  follow. The field this comes from is grams-only ("Measured paste weight
                  (g, optional)"), so printing a sheet in lb quoted a typed 1,600 back as
                  "3.53 lb": the maker's own entry, in a unit they never used, on the page
                  they take to the bench. Every other weight on this sheet is a bench
                  readout and stays on the print unit. */}
              {formatWeight(parseMeasuredPasteGrams(measuredPasteGrams) as number, 'g')}), not
              the recipe&apos;s computed paste.
            </p>
          )}
          {/* targetExceedsPaste is a factual claim about the paste, but it was derived from
              an ASSUMED water content — asserting it here could tell the maker a batch is
              already dilute enough when it still needs hundreds of grams of water. Mirrors
              DilutionPanel's can't-tell branch instead of the floor caveat below. A valid
              measured paste outranks the flag outright (Task 5) — see dilutionWaterGramsPrinted
              above — so both branches below are suppressed the same way DilutionPanel does. */}
          {/* The sheet is the page carried to the bench, so the state DilutionPanel's
              pasteAlreadyPastTarget alert explains on screen has to be explained here too:
              the corrected pot outweighs the whole solution its soap makes at the target, so
              correctedDilutionWaterGrams clamps and "Dilution water to add" above prints
              "0 g". Printed bare, that reads as a batch needing nothing.

              Same predicate and same gating as the panel's — see its comment for why
              !targetExceedsPaste is load-bearing (this strictly subsumes that flag), why a
              valid measurement suppresses it, and why no undeclared-liquid hedge belongs on
              it. Unreachable without a corrected paste basis, which is why the branch below
              reads data.wholeBatchPasteGrams directly. */}
          {!dilution.targetExceedsPaste &&
          !measuredPasteValid &&
          hasCorrectedPasteBasis &&
          (data.wholeBatchPasteGrams as number) > dilution.solutionGrams ? (
            <p className="batch-sheet__note">
              The paste is already more dilute than{' '}
              {formatConcentrationPercent(dilution.soapConcentrationPercent)}%: it weighs{' '}
              {formatWeight(data.wholeBatchPasteGrams as number, weightUnit)} against the{' '}
              {formatWeight(dilution.solutionGrams, weightUnit)} its soap makes at that
              concentration, so there is no dilution water to add. Lower the target
              concentration (more water) until the paste can reach it, or weigh the paste —
              the cook boils off water this figure still counts.
            </p>
          ) : null}
          {dilution.targetExceedsPaste && !measuredPasteValid && data.overDilutionCertain ? (
            // Certain across the unknown's whole 0-100% range — state the fact, exactly as
            // the panel does; hedging here made the two surfaces disagree for one recipe.
            <p className="batch-sheet__note">
              The paste is already more dilute than{' '}
              {formatConcentrationPercent(dilution.soapConcentrationPercent)}% — adding water only
              lowers the concentration further.
            </p>
          ) : null}
          {data.unknownLiquidGrams &&
          dilution.targetExceedsPaste &&
          !measuredPasteValid &&
          !data.overDilutionCertain ? (
            <p className="batch-sheet__note">
              Can&apos;t tell whether {formatConcentrationPercent(dilution.soapConcentrationPercent)}% is
              reachable — {formatWeight(data.unknownLiquidGrams, weightUnit)} of alternative
              liquid has no declared water content. Declare its % water in Split liquid.
            </p>
          ) : null}
          {data.unknownLiquidGrams && !dilution.targetExceedsPaste ? (
            <p className="batch-sheet__note">
              {formatWeight(data.unknownLiquidGrams, weightUnit)} of alternative liquid has
              no declared water content —{' '}
              {hasCorrectedPasteBasis
                ? 'the dilution figure above is the same whatever it turns out to be, since the liquid is in the pot either way. What is unknown is how much of your paste is water.'
                : 'it is counted as all water, so the dilution figure is the least you will need. Dilute in increments and check by weight.'}
            </p>
          ) : null}
        </section>
      )}

      {neutralization && (
        <section className="batch-sheet__section">
          <h2>Neutralize</h2>
          <dl className="batch-sheet__dl">
            <div><dt>Lye excess</dt><dd>{formatGrams(neutralization.lyeExcessPercent, 1)}%</dd></div>
            <div><dt>Citric acid (estimate)</dt><dd>{formatWeight(neutralization.citricAcidGrams, weightUnit)}</dd></div>
            <div><dt>Dissolve in hot water (1:4)</dt><dd>{formatWeight(neutralization.dilutionWaterGrams, weightUnit)}</dd></div>
            <div><dt>Or stearic acid</dt><dd>{formatWeight(neutralization.stearicAcidGrams, weightUnit)}</dd></div>
          </dl>
          <p>Add gradually to pH {neutralization.targetPhLow}–{neutralization.targetPhHigh}; verify with a test.</p>
          <p>Stearic acid cannot be overdosed — melt it in; any surplus cools and is filtered off.</p>
        </section>
      )}

      {properties?.properties && (
        <section className="batch-sheet__section">
          <h2>Estimated bar properties</h2>
          <dl className="batch-sheet__dl batch-sheet__dl--compact">
            <div>
              <dt>Hardness</dt>
              <dd>{propsLow ? '~' : ''}{formatPropertyScore(properties.properties.hardness)}</dd>
            </div>
            <div>
              <dt>Cleansing</dt>
              <dd>{propsLow ? '~' : ''}{formatPropertyScore(properties.properties.cleansing)}</dd>
            </div>
            <div>
              <dt>Conditioning</dt>
              <dd>{propsLow ? '~' : ''}{formatPropertyScore(properties.properties.condition)}</dd>
            </div>
            <div>
              <dt>Bubbly</dt>
              <dd>{propsLow ? '~' : ''}{formatPropertyScore(properties.properties.bubbly)}</dd>
            </div>
            <div>
              <dt>Creamy</dt>
              <dd>{propsLow ? '~' : ''}{formatPropertyScore(properties.properties.creamy)}</dd>
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
          {modeled.length > 0 && (
            <p className="batch-sheet__notes">
              Modeled profile (reconstructed, not measured):{' '}
              {modeled.map(batchSheetOilName).join(', ')}
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
        <p>
          Verify all weights before making. Wear eye protection and gloves when handling lye —
          freshly mixed lye solution is caustic and heats to about 93&nbsp;°C (200&nbsp;°F).
        </p>
      </footer>
    </article>
  );
});
