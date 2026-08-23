import { memo, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  alternativeLiquidPreset,
  effectiveSuperfatPercent,
  formatPropertyScore,
  formatSoapPropertyPercent,
  lsFinishedVolumeMl,
  lsPreservativeById,
  lsPreservativeDoseTier,
  LOW_COVERAGE_PERCENT,
  preservativeDoseGrams,
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
import { finishedProductGramsFor, preservativeDosingBasisGramsFor } from '../lib/calculateAdditives';
import { formatConcentrationPercent, formatGrams } from '../lib/format';
import { splitLiquidProcedureStep } from '../lib/recipeSummary';
import { formatDose } from '../lib/formatDose';
import { formatWeight } from '../lib/weightUnits';
import {
  correctedDilutionWaterGrams,
  hasCorrectedPasteBasis,
  measuredPasteIsValidFor,
  parseGradualWaterRecordGrams,
  parseMeasuredPasteGrams,
  weighedOrComputedPotGramsFor,
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
  // The verdict this sheet's own COPY answers to, and DilutionPanel's `measuredPasteValid`
  // exactly: it gates the "Dilution water above uses the measured paste weight" note below
  // and — per Task 5 — OUTRANKS targetExceedsPaste there, since that flag is derived from the
  // recipe's ASSUMED cook water and the measurement is direct evidence against it. The printed
  // water FIGURE goes through the identical ceiling inside correctedDilutionWaterGrams
  // (lib/measuredPaste's correctedPotGramsFor), so the two never disagree about whether a
  // reading is usable.
  //
  // The corrected basis and the cook water go into the gate too, not only into the water
  // figure below: the floor under a reading counts an alternative liquid's solids, and
  // the sheet is the page carried to the bench — it must refuse exactly what the panel
  // refuses, or the two would disagree about whether the maker's own reading was usable.
  const measuredPasteValid = dilution
    ? measuredPasteIsValidFor(measuredPasteGrams, dilution, data.wholeBatchPasteGrams, data.cookWaterGrams)
    : false;
  // wholeBatchPasteGrams is the second correction the shared helper applies: an alternative
  // liquid's non-water solids are real mass in the pot that calculateDilution's
  // anhydrous + water arithmetic never counts, so the recipe's own dilutionWaterGrams
  // prescribes the solids' worth of extra water. DilutionPanel's ratio block has always
  // poured off the corrected paste, so this row and that one used to differ by exactly the
  // solids — with the sheet, the page actually carried to the scale, holding the wrong one.
  // Whether the printed figures came off the corrected paste, which decides whether the
  // undeclared-liquid caveat below reads as a floor or as "the same either way". The
  // four-clause predicate is lib/measuredPaste's, shared with the panel and with the paste
  // floor itself rather than written out a sixth time.
  const correctedPasteBasis = hasCorrectedPasteBasis(data.wholeBatchPasteGrams);
  const dilutionWaterGramsPrinted = dilution
    ? correctedDilutionWaterGrams(dilution, measuredPasteGrams, data.wholeBatchPasteGrams, data.cookWaterGrams)
    : 0;
  // The sheet is the page taken to the bench, so it must carry what actually gets
  // bottled, not only the chemistry-only solution above: bottledSolutionGrams adds in
  // additives, append-mode post-cook oil, and split-liquid solids, and is bigger than
  // dilution.solutionGrams whenever any of those are present (mirrors DilutionPanel's
  // own preservativeDosingBasis/bottledGrams). lsFinishedVolumeMl is the same core helper
  // the on-screen panel uses — never recomputed here.
  // The shared resolution (lib/calculateAdditives), not a hand-written ?? chain: the sheet
  // is the page carried to the bench, so its dosing basis must be the one the screen
  // quotes — and the one the preservative dose is a percentage of. Preservative-free; see
  // bottledGrams below for what the finished-product row and volume actually render.
  const preservativeDosingBasisGrams = preservativeDosingBasisGramsFor(bottledSolutionGrams, dilution);

  // THE SHEET IS A BATCH DOCUMENT. It prints the batch's dose and says so — never the
  // Dilution panel's Custom amount portion. `dilutionScope` is session-only state that no
  // recipe file records, so a sheet that mirrored it would print one mass before a reload
  // and another after. preservativeDosingBasisGrams is preservativeDosingBasisGramsFor(...),
  // the same expression behind vm.preservativeDosingBasisGrams that App hands the snippet
  // in batch scope, so sheet, panel and snippet cannot drift on what the dose is a % of.
  const preservative = lsPreservativeById(settings.preservativeId);
  const preservativeDosePct = Number(settings.preservativeDosePct);
  const preservativeTier = lsPreservativeDoseTier(preservativeDosePct, preservative);
  const preservativeName =
    preservative?.label ?? (settings.preservativeCustomName.trim() || 'Custom preservative');
  // The three preservative fields default to a real, legal Suttocide A dose
  // (recipe.ts:165-168) because liquid soap is water-based and needs one — that seed is the
  // app's recommendation, not a placeholder. The sheet prints it like any other line: its
  // grams are inside the bottled mass below, and a bench page must name what its mass
  // carries. Suppressing this row while folding in its weight printed a figure the page
  // could not account for.
  // Blank is the ordinary case (no gradual record) and must print nothing; junk (and a
  // negative, which is not a pour) must also print nothing rather than a bare row with an
  // empty or impossible figure.
  //
  // ZERO IS A RECORD, not a blank (the shared parser's `>= 0`, and its trim before the parse
  // — see parseGradualWaterRecordGrams): the pot before any water at all is Gradual
  // Dilution's own starting entry (LS:1531), and the panel's own copy says so in as many
  // words — "0 g counts, and is where the record starts" (DilutionPanel's batch ask). While
  // this read `> 0` the page taken to the bench dropped both rows for exactly that record, so
  // a maker who had recorded the starting weight found the screen and the paper disagreeing
  // about whether a record existed. That is why the predicate is now shared rather than
  // written out here: the same answer decides these two rows and the panel's own derivation.
  const gradualWaterRecordedGrams =
    parseGradualWaterRecordGrams(settings.gradualWaterGrams) ?? null;
  // WHICH ARM GOVERNS, in the sheet's own terms (spec §1). Identical to
  // `resolveDilution(...).governs === 'plan'` by construction: that rule's ONLY test for a
  // record's presence is this same parser on this same field, so the page and the screen
  // cannot disagree about which arm is speaking. Named rather than spelled out at each of the
  // three notes below, so a future note cannot be added on the flag while its neighbours read
  // the arm.
  const planGoverns = gradualWaterRecordedGrams === null;
  // What that record MADE, which is the other half of the line spec §4 asks this sheet to
  // carry: paste + water, from the same two figures the panel adds up, so the page taken to
  // the bench states the mass that exists rather than only the water that went into it.
  // Deliberately NOT a second row in the list: "Finished solution" is already
  // there, the write-back makes the two agree to within a gram, and two near-identical
  // masses in one column read as an error. It rides the note below instead, where it can be
  // named as the record's own.
  //
  // ONE CALL, to the resolution the panel's own "Finished so far" counts from
  // (lib/measuredPaste's weighedOrComputedPotGramsFor): the pot the maker weighed when that
  // reading describes a possible one, else the recipe's computed pot. This sheet used to
  // hand-roll that selection out of two helpers imported from DilutionPanel — the same
  // arithmetic, spelled twice, with nothing holding the copies together and the panel's
  // import graph dragged into this module for it.
  //
  // IT IS NOT correctedPotGramsFor, the gate behind this page's own "Dilution water to add"
  // row, and the difference is a difference of QUESTION rather than of rigour. That row
  // measures a pour against the saved target, so a reading past what the target can hold is
  // refused there. This row states what the RECORD makes, which is a claim about the pot and
  // the pour alone — the panel derives its own target from exactly this figure, so a
  // target-derived ceiling on it would let that output pick its own input (the render loop
  // measuredPasteDescribesPotFor documents). Where the two answer differently the record has
  // not been applied to the saved target, and the note under this row says so in as many
  // words. Making them agree by putting the ceiling here would print a mass on paper that the
  // panel does not show on screen for the same record, which is the split the shared
  // resolution exists to prevent.
  const gradualPasteBasisGrams =
    weighedOrComputedPotGramsFor(
      dilution,
      measuredPasteGrams,
      data.wholeBatchPasteGrams,
      data.cookWaterGrams,
    )?.grams ?? null;
  const gradualFinishedGrams =
    gradualWaterRecordedGrams !== null && gradualPasteBasisGrams !== null
      ? gradualPasteBasisGrams + gradualWaterRecordedGrams
      : null;
  // Same predicate as the view model's dose (see its comment): no preservativeSetByUser
  // gate. This one figure feeds both the printed row below and the bottled mass above, so
  // the sheet cannot print a mass that includes a preservative it does not name — the
  // defect that suppressing this row while folding in its grams produced.
  const preservativeGrams =
    preservativeDosingBasisGrams !== null &&
    preservativeTier !== 'none' &&
    preservativeTier !== 'impossible'
      ? preservativeDoseGrams(preservativeDosingBasisGrams, preservativeDosePct)
      : null;
  // What the bottle actually weighs (spec §3): the basis plus the dose. Fed from
  // preservativeGrams above — the sheet's ONE dose figure — not from a prop, so the
  // printed dose row and the printed mass cannot disagree even in a test that builds
  // `data` directly: a fixture either doses both or neither. (A prop carried this value
  // briefly; a caller omitting it could print a dose beside a preservative-free mass —
  // two sources for one quantity, the exact drift this file exists to prevent.)
  const bottledGrams = finishedProductGramsFor(preservativeDosingBasisGrams, preservativeGrams ?? 0);
  const finishedVolumeMl = bottledGrams !== null ? lsFinishedVolumeMl(bottledGrams) : null;
  // Compared against the finished mass the page ALREADY prints under whichever arm governs —
  // "That record makes …" when a record does, else the "Finished solution" row. Keyed on
  // solutionGrams alone, a record mid-pour (whose bottle is lighter than the plan's solution)
  // hid this row while "≈ Finished volume" below went on converting it, leaving a millilitre
  // figure on the bench page derived from a mass nothing on it stated. Same rule, same
  // reasoning, as DilutionPanel's own showBottledRow.
  const governingFinishedGrams = gradualFinishedGrams ?? dilution?.solutionGrams ?? null;
  const showBottledRow =
    dilution !== null &&
    bottledGrams !== null &&
    governingFinishedGrams !== null &&
    bottledGrams > governingFinishedGrams + 0.5;
  // Named locals so the row's <dd> isn't packing six things and two inline ternaries.
  // Both always end their own sentence with a period — the base note used to end bare
  // ("...once cooled" with no full stop) and only gained one when the ceiling note was
  // appended, so a row with no ceiling breach printed no closing punctuation at all.
  const stageNote =
    preservative?.addBelowC != null
      ? `add after dilution, below ${preservative.addBelowC} °C.`
      : 'add after dilution, once cooled.';
  const ceilingNote =
    preservativeTier === 'above-max' && preservative
      ? ` NOTE: above the ${preservative.ceiling === 'eu' ? 'EU legal maximum' : "supplier's maximum"} of ${preservative.maxPct}%.`
      : '';

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
              !correctedPasteBasis
                ? ' (at least)'
                : ''}
            </dd></div>
            <div><dt>Finished solution</dt><dd>{formatWeight(dilution.solutionGrams, weightUnit)}</dd></div>
            <div><dt>Glycerin (retained)</dt><dd>{formatWeight(dilution.glycerinGrams, weightUnit)}</dd></div>
            {showBottledRow && bottledGrams !== null && (
              <div><dt>≈ Bottled (with extras)</dt><dd>{formatWeight(bottledGrams, weightUnit)}</dd></div>
            )}
            {/* What went in the pot, when the maker diluted gradually (LS:1531 — "record how
                much water you started with and how much additional water you added"). It sits
                beside "Dilution water to add" deliberately and is NAMED against it: that row
                is what the saved target implies, this one is what was actually poured. They
                are usually close, because recording the water writes its own concentration
                back into the target — but they answer different questions, and a sheet that
                let one stand in for the other would be the paper version of the confusion
                this feature exists to remove. Absent entirely when nothing was recorded. */}
            {gradualWaterRecordedGrams !== null && (
              <div>
                <dt>Water actually added</dt>
                <dd>{formatWeight(gradualWaterRecordedGrams, weightUnit)}</dd>
              </div>
            )}
            {/* Which row answers which question, said out loud rather than left to two
                labels that both read as "water for this batch". They are usually within a
                gram of each other, because recording the water writes its own concentration
                back into the target — but they are not the same claim, and while a record
                sits beside a target it has not been applied to they can be hundreds of
                grams apart with nothing on the page distinguishing them. The finished mass
                the record produced rides here too (spec §4), where it is named as the
                record's own and cannot be mistaken for the target-derived "Finished
                solution" row above. */}
            {gradualWaterRecordedGrams !== null && gradualFinishedGrams !== null && (
              <div>
                <dt>That record makes</dt>
                <dd>
                  {formatWeight(gradualFinishedGrams, weightUnit)} — paste plus the water you
                  recorded. &ldquo;Dilution water to add&rdquo; above is what the saved{' '}
                  {formatConcentrationPercent(dilution.soapConcentrationPercent)}% target
                  implies instead.
                </dd>
              </div>
            )}
            {preservativeGrams !== null && (
              <div>
                <dt>Preservative</dt>
                <dd>
                  {preservativeName} · {preservativeDosePct}% ·{' '}
                  {formatWeight(preservativeGrams, weightUnit)} (whole batch) — {stageNote}
                  {ceilingNote}
                </dd>
              </div>
            )}
            {finishedVolumeMl !== null && (
              <div><dt>≈ Finished volume</dt><dd>{Math.round(finishedVolumeMl).toLocaleString('en-US')} ml</dd></div>
            )}
          </dl>
          {measuredPasteValid && (
            <p className="batch-sheet__note">
              Dilution water above uses the measured paste weight (
              {/* Grams, not the sheet's print unit — the same rule the two on-screen echoes
                  follow. The field this comes from is grams-only ("Measured paste weight —
                  the whole batch (g, optional)"), so printing a sheet in lb quoted a typed
                  1,600 back as
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
              above — so both branches below are suppressed the same way DilutionPanel does.

              ALL THREE NOTES BELOW ARE PLAN-GOVERNS ONLY (spec §4: "BatchSheet's three verdict
              notes lean on write-back having aligned target ≈ record → gated on
              plan-governs"). Each is a verdict about a TARGET — the paste has passed it, the
              pot outweighs its solution, or an undeclared liquid makes it unknowable — and
              while they were true of every record too, that was only because the record wrote
              the target it is being judged against. Nothing writes it now, so under a record
              these would print a verdict about a number the maker has stopped aiming at,
              directly beside the two rows that say what the batch actually is ("Water actually
              added", "That record makes …"). Those rows, and the contrast copy on the second
              of them, are what speaks for a record page (spec §4 keeps them deliberately: a
              labelled plan-vs-record comparison is not the reassurance framing §2 retires). */}
          {/* The sheet is the page carried to the bench, so the state DilutionPanel's
              pasteAlreadyPastTarget alert explains on screen has to be explained here too:
              the corrected pot outweighs the whole solution its soap makes at the target, so
              correctedDilutionWaterGrams clamps and "Dilution water to add" above prints
              "0 g". Printed bare, that reads as a batch needing nothing.

              Same predicate as the panel's, and the same core gating — see its comment for
              why !targetExceedsPaste is load-bearing (this strictly subsumes that flag),
              why a valid measurement suppresses it, and why no undeclared-liquid hedge
              belongs on it. NOT the same render condition any more: the panel's alert
              yields to the exceeds-solution rejection (its `!exceedsSolutionAlert` clause,
              decided 2026-08-16, second round) because that refusal renders in its place
              and already accounts for the 0 g row. This sheet prints no rejection
              paragraphs, so there is nothing on the page for this note to yield to —
              copying the yield would leave the printed "0 g" bare in exactly the state
              the note exists to explain. (A reading that trips that rejection is not
              measuredPasteValid, so the clause below keeps this note on the sheet there;
              the divergence is deliberate, not drift.) Unreachable without a corrected
              paste basis, which is why the branch below reads data.wholeBatchPasteGrams
              directly. */}
          {planGoverns &&
          !dilution.targetExceedsPaste &&
          !measuredPasteValid &&
          correctedPasteBasis &&
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
          {planGoverns && dilution.targetExceedsPaste && !measuredPasteValid && data.overDilutionCertain ? (
            // Certain across the unknown's whole 0-100% range — state the fact, exactly as
            // the panel does; hedging here made the two surfaces disagree for one recipe.
            <p className="batch-sheet__note">
              The paste is already more dilute than{' '}
              {formatConcentrationPercent(dilution.soapConcentrationPercent)}% — adding water only
              lowers the concentration further.
            </p>
          ) : null}
          {planGoverns &&
          data.unknownLiquidGrams &&
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
              {correctedPasteBasis
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
