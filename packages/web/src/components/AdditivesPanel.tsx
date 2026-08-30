import { memo } from 'react';
import {
  catalogEntriesForProcess,
  isAdditiveOfferedFor,
  catalogEntryById,
  effectiveCatalogEntry,
  LATHER_SUPPORT_PACK,
  parseDoseAmount,
  type AdditiveCatalogEntry,
  type AdditiveStage,
  type DoseBasis,
  type DoseUnit,
} from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import { processOffers, type ProcessId } from '../lib/process';
import type { AdditiveLine } from '../lib/recipe';
import { newAdditiveKey } from '../lib/recipe';
import type { ComputedAdditive } from '../lib/calculateAdditives';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';
import { SegRadioGroup } from './SegRadioGroup';

type AdditivesPanelProps = {
  additives: AdditiveLine[];
  computed: ComputedAdditive[];
  weightUnit: WeightUnit;
  process: ProcessId;
  onChange: (additives: AdditiveLine[]) => void;
};

const DOSE_MODES: { value: string; basis: DoseBasis; unit: DoseUnit; label: string }[] = [
  { value: 'oil-percent', basis: 'oil', unit: 'percent', label: '% of oil' },
  { value: 'batch-percent', basis: 'batch', unit: 'percent', label: '% of batch' },
  { value: 'oil-ppt', basis: 'oil', unit: 'ppt', label: 'ppt of oil' },
  { value: 'batch-ppt', basis: 'batch', unit: 'ppt', label: 'ppt of batch' },
  { value: 'solution-percent', basis: 'solution', unit: 'percent', label: '% of solution' },
  { value: 'solution-ppt', basis: 'solution', unit: 'ppt', label: 'ppt of solution' },
];

// The finished solution only exists for LS, so its dose modes are LS-only.
const PROCESS_LABELS: Record<ProcessId, string> = {
  cp: 'cold process',
  hp: 'hot process',
  ls: 'liquid soap',
};

function offeredDoseModesForProcess(process: ProcessId): typeof DOSE_MODES {
  return processOffers(process, 'solutionDosing')
    ? DOSE_MODES
    : DOSE_MODES.filter((m) => m.basis !== 'solution');
}

const BASE_STAGE_OPTIONS: AdditiveStage[] = ['lye', 'oils', 'trace', 'top'];

/** Short cell text for the stage seg. Each is contained in its full stage label, which
 * stays the accessible name (Label-in-Name, WCAG 2.5.3) — four full labels side by side
 * would not fit the column. Dropping the preposition is safe for these four: under the
 * "Add at" heading, LYE WATER / OILS / TRACE / TOP each name a place in the batch.
 *
 * `after_cook` is NOT in here — it names a MOMENT, and the preposition is the whole
 * claim. Abbreviated to its last word it read "ADD AT … DILUTION", which says to dose
 * into the dilution water; the stage means the opposite — after the dilution, into
 * finished soap. It keeps its full label and wraps to two lines instead. */
const ADDITIVE_STAGE_CELLS: Partial<Record<AdditiveStage, string>> = {
  lye: 'Lye water',
  oils: 'Oils',
  trace: 'Trace',
  top: 'Top',
};

/** What choosing this stage actually means, shown under the control for the selected one.
 * The lye-vs-oils distinction is the one that changes the soap rather than just the
 * order of operations, so both notes say why you would pick them. */
const ADDITIVE_STAGE_NOTES: Record<AdditiveStage, string> = {
  lye: 'Dissolved in the lye water before it meets the oils. Chelators are made here — citric acid becomes citrate in the lye solution. A fresh lye solution is hot enough to brown sugars.',
  oils: 'Stirred into the warm oils before the lye goes in. Preferred for sugar, which browns less here than in a hot lye solution. Salt can go either way — stirred into the oils, or dissolved in the lye water.',
  trace: 'Blended in once the batter has emulsified.',
  top: 'Onto the surface after pouring — decoration, not part of the batter.',
  after_cook: 'Stirred in after the cook, once saponification is finished.',
};

/** Stages offered per line. CP has no cook/dilution step, so only HP/LS offer the
 * contextual after-cook stage.
 *
 * LIQUID SOAP DROPS "ON TOP". It is a bar-soap stage — you decorate the surface of a
 * loaf — and a bottle has no surface to decorate. The reference rules out the additives
 * the stage exists for ("dried herbs, dried flowers, sprinkles… simply shouldn't be used
 * in liquid soap", LS:3067), and every "layer on top" in that text is unsaponified fat
 * separating out: a defect to fix, not a stage to choose. */
function offeredStagesForProcess(process: ProcessId): AdditiveStage[] {
  const base =
    process === 'ls' ? BASE_STAGE_OPTIONS.filter((s) => s !== 'top') : BASE_STAGE_OPTIONS;
  return processOffers(process, 'afterCookStage') ? [...base, 'after_cook'] : base;
}

/** The stage seg's cell text. after_cook shows its process-aware label whole ("After
 * cook" / "After dilution") — the cells wrap, so the word that carries the timing does
 * not have to be dropped to make it fit. */
function stageCell(stage: AdditiveStage, process: ProcessId): string {
  return ADDITIVE_STAGE_CELLS[stage] ?? additiveStageLabel(stage, process);
}

/** The note for the selected stage. LS's after-cook step is the dilution, and what goes
 * in there is different enough from a bar soap's post-cook stir to say so. */
function stageNote(stage: AdditiveStage, process: ProcessId): string {
  if (stage === 'after_cook' && process === 'ls') {
    return 'Stirred into the finished, diluted soap — where emollients and water-dispersible additives belong.';
  }
  return ADDITIVE_STAGE_NOTES[stage];
}

// memo: `computed` is a stable view-model memo output and `onChange` is a stable
// setState, so unrelated keystrokes skip re-rendering this panel.
export const AdditivesPanel = memo(function AdditivesPanel({
  additives,
  computed,
  weightUnit,
  process,
  onChange,
}: AdditivesPanelProps) {
  const offeredStages = offeredStagesForProcess(process);
  const offeredDoseModes = offeredDoseModesForProcess(process);
  const catalogEntries = catalogEntriesForProcess(process);

  function updateLine(key: string, patch: Partial<AdditiveLine>) {
    onChange(
      additives.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  // Ranges and default stages can differ per process (e.g. sodium lactate: 0.5–2% in the
  // CP lye water vs 3–4% at trace under HP) — resolve every catalog read through the
  // active process. Id/name are never overridden, so identity-based code (the
  // mismatched-select guard, dedup) can keep using the raw entry.
  const resolve = (e: AdditiveCatalogEntry | undefined) =>
    e ? effectiveCatalogEntry(e, process) : undefined;

  function selectCatalog(key: string, catalogId: string) {
    const entry = resolve(catalogEntryById(catalogId));
    if (!entry) {
      updateLine(key, { catalogId: '', name: '' });
      return;
    }
    updateLine(key, {
      catalogId: entry.id,
      name: entry.name,
      addAt: entry.defaultStage,
      // Seed the dose unit from the catalog IN BOTH DIRECTIONS: a ppt entry left on
      // '%' invites a 10x overdose, and a lingering 'ppt' after switching to a
      // %-dosed entry inverts it (hint says % while the amount computes as ppt).
      unit: entry.doseUnit ?? 'percent',
      // Seed the basis the same way: LS solution-dosed entries (pearlizer, wd-shea, LS
      // fragrance) mean % of the finished solution — leaving 'oil' silently under-doses
      // them several-fold (1% of oils ≈ 0.3% of solution at 35% concentration).
      basis: entry.doseBasis ?? 'oil',
    });
  }

  function addLine() {
    onChange([
      ...additives,
      {
        key: newAdditiveKey(),
        catalogId: '',
        name: '',
        amount: '',
        basis: 'oil',
        unit: 'percent',
        addAt: 'trace',
      },
    ]);
  }

  function addLatherSupportPack() {
    const existingIds = new Set(
      additives.map((line) => line.catalogId).filter((id) => id !== ''),
    );
    const pack = LATHER_SUPPORT_PACK.flatMap((item): AdditiveLine[] => {
      if (existingIds.has(item.catalogId)) return [];
      const entry = catalogEntryById(item.catalogId);
      if (!entry) return [];
      // Stage from the ingredient's own per-process default, not from the pack: the pack
      // says what and how much, the catalog says when, and only the catalog was audited
      // per process. Same resolution a hand-picked line gets from the type select below,
      // so one press and three picks land the same recipe.
      const forProcess = resolve(entry)!;
      return [
        {
          key: newAdditiveKey(),
          catalogId: entry.id,
          name: entry.name,
          amount: String(item.percentOfOil),
          basis: forProcess.doseBasis ?? 'oil',
          unit: forProcess.doseUnit ?? 'percent',
          addAt: forProcess.defaultStage,
        },
      ];
    });
    if (pack.length === 0) return;
    onChange([...additives, ...pack]);
  }

  const latherPackCatalogIds = LATHER_SUPPORT_PACK.map((item) => item.catalogId);
  const allLatherPackPresent = latherPackCatalogIds.every((id) =>
    additives.some((line) => line.catalogId === id),
  );

  function removeLine(key: string) {
    onChange(additives.filter((line) => line.key !== key));
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">
            <span className="panel__num" aria-hidden="true">05</span>Additives
          </h2>
          <p className="panel__subtitle">Dose per additive</p>
        </div>
        <div className="panel__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={addLatherSupportPack}
            disabled={allLatherPackPresent}
          >
            Lather support pack
          </button>
          <button type="button" className="btn btn--ghost" onClick={addLine}>
            + Add
          </button>
        </div>
      </div>

      {(process === 'hp' || process === 'ls') && (
        // Deliberately NOT in the empty-state branch: it applies whether or not rows exist.
        // The free fatty acids were removed from this catalog (they saponify — see
        // ADDITIVE_CATALOG's finished-soap comment); this is where HP/LS users find them
        // now. The typical dose differs per process (fluid HP vs no-paste LS cook).
        <p className="results-hint">
          Free fatty acids (stearic, lauric, myristic) saponify — dose them as oils in the oils
          list, typically {process === 'hp' ? '5–8%' : '5–10%'} of oils for a fluid
          {process === 'hp' ? ' cook' : ' no-paste cook'}.
        </p>
      )}
      {process === 'ls' && (
        // Same shape as the free-fatty-acid hint above: an ingredient whose main route is
        // another control, named here so nobody hunts for it in this list. Glycerin for
        // the cook is part of the lye solution, and only that route puts its weight in the
        // paste and takes it off the dilution water.
        <p className="results-hint">
          Glycerin for the cook goes in with the liquids, not here — swap part of the lye water
          for it under Water &amp; superfat. Entered there, its weight comes off the dilution
          water; this list only doses it into finished soap.
        </p>
      )}
      {additives.length === 0 ? (
        <p className="results-hint">
          Optional extras (fragrance, sugar, clay, etc.) dosed per additive — not included in lye
          math (citric acid's compensation lye is added automatically).
        </p>
      ) : (
        <ul className="additive-list" aria-label="Recipe additives">
          {additives.map((line, rowIndex) => {
            const row = computed.find((item) => item.key === line.key);
            // rawEntry for identity concerns (the catalog mismatched-select guard below);
            // entry — resolved per process — for everything dose-shaped (range hint,
            // doseUnit, hazards).
            const rawEntry = line.catalogId ? catalogEntryById(line.catalogId) : undefined;
            const entry = resolve(rawEntry);
            // A line the process doesn't offer is inert (computeRecipeAdditives withholds
            // its grams). Say so on the row, or it just reads as a dose that vanished.
            const isStrayEntry = rawEntry !== undefined && !isAdditiveOfferedFor(rawEntry, process);
            // An amount present but over its unit's ceiling (e.g. left at 500 after switching
            // from ppt to %) yields no grams — flag it so the dose doesn't just vanish silently.
            const amountInvalid =
              line.amount !== '' && parseDoseAmount(line.amount, line.unit) === null;
            // Mismatched-select guard: a line's current addAt must always be an option,
            // even when it falls outside this process's offered set (e.g. a stray
            // after_cook line viewed under CP) — otherwise the controlled <select> has
            // no matching <option> and silently falls back to a different value.
            // An entry may restrict its own stages (glycerin is after-dilution only — the
            // cook's route is the split-liquid row). Intersect, never widen: a stage the
            // process does not offer is not made available by an entry listing it.
            const entryStages = entry?.stages
              ? offeredStages.filter((stage) => entry.stages!.includes(stage))
              : offeredStages;
            const stageOptions = entryStages.includes(line.addAt)
              ? entryStages
              : [...entryStages, line.addAt];
            // Mismatched-select guard (dose mode): a stray `solution` line viewed
            // under CP/HP must still render its current option, even though
            // solution modes are otherwise LS-only — see stageOptions above.
            const doseModeValue = `${line.basis}-${line.unit}`;
            const doseModeOptions = offeredDoseModes.some((m) => m.value === doseModeValue)
              ? offeredDoseModes
              : [...offeredDoseModes, ...DOSE_MODES.filter((m) => m.value === doseModeValue)];
            // Mismatched-select guard (catalog): a stray process-scoped catalogId (e.g.
            // `guar` viewed under CP) must still render its current option, even though
            // it's not offered for this process — see stageOptions/doseModeOptions above.
            const catalogOptions =
              line.catalogId === '' || catalogEntries.some((item) => item.id === line.catalogId)
                ? catalogEntries
                : rawEntry
                  ? [...catalogEntries, rawEntry]
                  : catalogEntries;

            // Per-row accessible names, mirroring RecipeOilsPanel's per-oil labels: with
            // several rows, identical names ("Amount", "Amount", ...) are indistinguishable
            // in a screen-reader form list.
            const rowName = line.name.trim() || `additive ${rowIndex + 1}`;
            // A catalog pick copies the entry name into `line.name`, so showing the
            // name input too reads as the same control rendered twice. Catalog rows
            // never need it — renaming is what Custom… is for.
            const showNameField = !entry;
            return (
              <li key={line.key} className="additive-list__row">
                <div className="additive-list__names">
                <label className="field">
                  <span className="sr-only">Additive type</span>
                  <select
                    className="input"
                    aria-label={`Additive type for ${rowName}`}
                    value={line.catalogId}
                    onChange={(e) => selectCatalog(line.key, e.target.value)}
                  >
                    <option value="">Custom…</option>
                    {catalogOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {/* The × sits on the ingredient, matching the oil rows in the panel above:
                    the control that removes a line belongs beside the line it removes.
                    DIRECTLY AFTER THE TYPE SELECT, so grid auto-placement keeps it in row
                    one. Placed after the custom-name field it took the second cell of row
                    one instead, dropping the × to a row of its own at the left edge — the
                    state every newly added additive is in, since a new line has no catalog
                    entry and therefore always shows that field. */}
                <button
                  type="button"
                  className="btn btn--icon"
                  onClick={() => removeLine(line.key)}
                  aria-label={`Remove ${rowName}`}
                >
                  ×
                </button>
                {showNameField && (
                  <label className="field additive-list__custom-name">
                    <span className="sr-only">Name</span>
                    <input
                      type="text"
                      className="input"
                      aria-label={`Name for ${rowName}`}
                      placeholder="Name"
                      value={line.name}
                      onChange={(e) => updateLine(line.key, { name: e.target.value })}
                    />
                  </label>
                )}
                </div>
                {/* Amount and dose are ledger rows — the panel's own label column, so a row
                    reads down the left edge (AMOUNT / DOSE / ADDS) instead of each sub-row
                    finding its own. The amount is a figure and takes the figure treatment,
                    the same one an oil's weight takes one panel up; dose and stage are enums
                    and keep their boxes, since the ink slab is reserved for numerics. */}
                {/* ONE STATEMENT, not two rows. The amount and what it is a percentage
                    OF — "5 % of oil" — are one claim, and splitting them across an AMOUNT
                    row and a DOSE row printed the unit twice: the slab's own "%" suffix,
                    then "% of oil" again underneath. It also left a lone select sitting
                    directly above the Add-at seg, which read as a second, quieter way to
                    say the same thing (reported as a duplicate control). It never was one
                    — this picks the BASIS the amount is measured against (oil, batch, or
                    the finished solution), the seg picks the STAGE it goes in, and the two
                    are independent: 1% of oil can go into the lye water or at trace. The
                    basis is the amount's unit now, so each question has exactly one
                    control and the row states the whole dose in one line. */}
                <label className="ledger__row additive-list__amount">
                  <span className="micro-label">Amount</span>
                  <span className="ledger__figure">
                    <input
                      type="number"
                      className="input figure-field"
                      min={0}
                      max={line.unit === 'ppt' ? 1000 : 100}
                      step={0.1}
                      // No placeholder: the unit is a visible suffix inside the slab, so a
                      // "%" ghost in an empty one just read "% %".
                      value={line.amount}
                      onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                      aria-label={`Amount for ${rowName}`}
                    />
                    {/* aria-label WINS over the wrapping <label>, so this still announces
                        as "Dose mode for <additive>" — unchanged — while the visible
                        "Amount" names the figure. The label's own control is still the
                        input (first labelable descendant), so clicking "Amount" focuses
                        the figure, not this. */}
                    <select
                      className="input ledger__basis"
                      aria-label={`Dose mode for ${rowName}`}
                      value={`${line.basis}-${line.unit}`}
                      onChange={(e) => {
                        const mode = DOSE_MODES.find((m) => m.value === e.target.value);
                        if (mode) updateLine(line.key, { basis: mode.basis, unit: mode.unit });
                      }}
                    >
                      {doseModeOptions.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                {/* A seg, not a dropdown: four stages worth comparing at a glance, and the
                    choice between them changes the soap rather than just the order of
                    work — a closed <select> hid both facts. The selected cell explains
                    itself underneath, so the reason to pick one is on screen at the moment
                    of picking rather than in a tooltip. */}
                <div className="additive-list__stage">
                  <span className="micro-label">Add at</span>
                  {/* One offered stage is not a choice: a seg of a single cell is a control
                      that cannot do anything, and a radio group of one is a poor thing to
                      hand a screen reader. Entries that restrict themselves to one stage
                      (glycerin — the cook's route is the split-liquid row) state it
                      instead, and the note underneath explains why it is the only one. */}
                  {stageOptions.length === 1 ? (
                    <p className="additive-list__stage-fixed">
                      {additiveStageLabel(stageOptions[0], process)}
                    </p>
                  ) : (
                  <SegRadioGroup
                    label={`Add at for ${rowName}`}
                    name={`additive-stage-${line.key}`}
                    options={stageOptions.map((stage) => ({
                      value: stage,
                      cell: stageCell(stage, process),
                      name: additiveStageLabel(stage, process),
                    }))}
                    value={line.addAt}
                    onChange={(addAt) => updateLine(line.key, { addAt })}
                  />
                  )}
                  <p className="inline-note additive-list__stage-note">
                    {stageNote(line.addAt, process)}
                  </p>
                </div>
                <div className="additive-list__foot">
                  <span className="micro-label">Adds</span>
                  <div className="additive-list__grams" aria-live="polite">
                    {row ? formatWeight(row.grams, weightUnit) : '—'}
                  </div>
                </div>
                {amountInvalid && (
                  <p className="additive-list__hint" role="alert">
                    Max {line.unit === 'ppt' ? '1000 ppt' : '100%'} — reduce the amount
                  </p>
                )}
                {isStrayEntry && (
                  <p className="additive-list__hint" role="alert">
                    {rawEntry!.name} is not used in {PROCESS_LABELS[process]} — this line is
                    not being added, and its dose range belongs to a different process. Remove
                    it, or switch the recipe&apos;s process.
                  </p>
                )}
                {entry && !isStrayEntry && (
                  <p className="additive-list__hint">
                    Typical {entry.typicalLow}
                    {entry.typicalHigh !== entry.typicalLow ? `–${entry.typicalHigh}` : ''}
                    {entry.doseUnit === 'ppt' ? ' ppt' : '%'} of{' '}
                    {entry.doseBasis === 'solution' ? 'diluted solution' : 'oil weight'}
                  </p>
                )}
                {/* What this additive does HERE, and where its other route lives when one
                    ingredient is split across two controls. Beneath the range, since the
                    range is the thing a maker came to the row for. */}
                {entry?.note && !isStrayEntry && (
                  <p className="inline-note additive-list__note">{entry.note}</p>
                )}
                {!row && !processOffers(process, 'solutionDosing') && line.basis === 'solution' && line.amount !== '' &&
                  (parseDoseAmount(line.amount, line.unit) ?? 0) > 0 && (
                  // Driven off the LINE, not a computed row: computeRecipeAdditives DROPS
                  // the line when the basis weight is 0, so the old `row.grams === 0` gate
                  // was unreachable for any realistic recipe and this hint never rendered.
                  //
                  // CP/HP only. Under LS the DilutionPanel already tells the user to set a
                  // concentration, on the same screen. Outside LS there IS no finished
                  // solution and no panel to explain its absence, so an imported line must be
                  // pointed at its dose mode rather than at a field the process doesn't have
                  // — the same render-inertly-but-honestly rule as the mismatched-select
                  // guards above.
                  <p className="additive-list__hint" role="alert">
                    Dosed against the finished solution, which only liquid soap has — switch
                    this line to % of oil weight
                  </p>
                )}
                {row?.extraLye && (row.extraLye.naohGrams > 0 || row.extraLye.kohGrams > 0) && (
                  <p className="additive-list__hint">
                    {[
                      row.extraLye.naohGrams > 0
                        ? `+${formatWeight(row.extraLye.naohGrams, weightUnit)} NaOH`
                        : null,
                      row.extraLye.kohGrams > 0
                        ? `+${formatWeight(row.extraLye.kohGrams, weightUnit)} KOH`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}{' '}
                    added to lye — forms the citrate chelator
                  </p>
                )}
                {entry && entry.hazards && entry.hazards.length > 0 && (
                  <ul className="additive-list__hazards" aria-label="Hazards">
                    {entry.hazards.map((hazard) => (
                      <li key={hazard} className="additive-list__hazard">
                        {hazard}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
});
