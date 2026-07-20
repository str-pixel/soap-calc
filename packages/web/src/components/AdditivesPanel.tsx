import { memo } from 'react';
import {
  catalogEntriesForProcess,
  catalogEntryById,
  LATHER_SUPPORT_PACK,
  parseDoseAmount,
  type AdditiveStage,
  type DoseBasis,
  type DoseUnit,
} from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import type { ProcessId } from '../lib/process';
import type { AdditiveLine } from '../lib/recipe';
import { newAdditiveKey } from '../lib/recipe';
import type { ComputedAdditive } from '../lib/calculateAdditives';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

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
function offeredDoseModesForProcess(process: ProcessId): typeof DOSE_MODES {
  return process === 'ls' ? DOSE_MODES : DOSE_MODES.filter((m) => m.basis !== 'solution');
}

const BASE_STAGE_OPTIONS: AdditiveStage[] = ['lye', 'oils', 'trace', 'top'];

/** Stages offered in the per-line dropdown. CP has no cook/dilution step, so only
 * HP/LS offer the contextual after-cook stage. */
function offeredStagesForProcess(process: ProcessId): AdditiveStage[] {
  return process === 'cp' ? BASE_STAGE_OPTIONS : [...BASE_STAGE_OPTIONS, 'after_cook'];
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

  function selectCatalog(key: string, catalogId: string) {
    const entry = catalogEntryById(catalogId);
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
      return [
        {
          key: newAdditiveKey(),
          catalogId: entry.id,
          name: entry.name,
          amount: String(item.percentOfOil),
          basis: 'oil',
          unit: 'percent',
          addAt: item.stage,
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
          <h2 className="panel__title">Additives</h2>
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

      {additives.length === 0 ? (
        <p className="results-hint">
          Optional extras (fragrance, sugar, clay, etc.) dosed per additive — not included in lye
          math.
        </p>
      ) : (
        <ul className="additive-list" aria-label="Recipe additives">
          {additives.map((line, rowIndex) => {
            const row = computed.find((item) => item.key === line.key);
            const entry = line.catalogId ? catalogEntryById(line.catalogId) : undefined;
            // An amount present but over its unit's ceiling (e.g. left at 500 after switching
            // from ppt to %) yields no grams — flag it so the dose doesn't just vanish silently.
            const amountInvalid =
              line.amount !== '' && parseDoseAmount(line.amount, line.unit) === null;
            // Mismatched-select guard: a line's current addAt must always be an option,
            // even when it falls outside this process's offered set (e.g. a stray
            // after_cook line viewed under CP) — otherwise the controlled <select> has
            // no matching <option> and silently falls back to a different value.
            const stageOptions = offeredStages.includes(line.addAt)
              ? offeredStages
              : [...offeredStages, line.addAt];
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
                : entry
                  ? [...catalogEntries, entry]
                  : catalogEntries;

            // Per-row accessible names, mirroring RecipeOilsPanel's per-oil labels: with
            // several rows, identical names ("Amount", "Amount", ...) are indistinguishable
            // in a screen-reader form list.
            const rowName = line.name.trim() || `additive ${rowIndex + 1}`;
            return (
              <li key={line.key} className="additive-list__row">
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
                <label className="field">
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
                <label className="field field--compact">
                  <span className="sr-only">Amount</span>
                  <input
                    type="number"
                    className="input input--number"
                    min={0}
                    max={line.unit === 'ppt' ? 1000 : 100}
                    step={0.1}
                    placeholder={line.unit === 'ppt' ? 'ppt' : '%'}
                    value={line.amount}
                    onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                    aria-label={`Amount for ${rowName}`}
                  />
                </label>
                <label className="field">
                  <span className="sr-only">Dose mode</span>
                  <select
                    className="input"
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
                </label>
                <label className="field">
                  <span className="sr-only">Add at</span>
                  <select
                    className="input"
                    aria-label={`Add at for ${rowName}`}
                    value={line.addAt}
                    onChange={(e) =>
                      updateLine(line.key, { addAt: e.target.value as AdditiveStage })
                    }
                  >
                    {stageOptions.map((stage) => (
                      <option key={stage} value={stage}>
                        {additiveStageLabel(stage, process)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="additive-list__grams" aria-live="polite">
                  {row ? formatWeight(row.grams, weightUnit) : '—'}
                </div>
                <button
                  type="button"
                  className="btn btn--icon"
                  onClick={() => removeLine(line.key)}
                  aria-label={`Remove ${rowName}`}
                >
                  ×
                </button>
                {amountInvalid && (
                  <p className="additive-list__hint" role="alert">
                    Max {line.unit === 'ppt' ? '1000 ppt' : '100%'} — reduce the amount
                  </p>
                )}
                {entry && (
                  <p className="additive-list__hint">
                    Typical {entry.typicalLow}
                    {entry.typicalHigh !== entry.typicalLow ? `–${entry.typicalHigh}` : ''}
                    {entry.doseUnit === 'ppt' ? ' ppt' : '%'} of oil weight
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
