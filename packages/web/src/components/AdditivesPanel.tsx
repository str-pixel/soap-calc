import {
  ADDITIVE_CATALOG,
  catalogEntryById,
  LATHER_SUPPORT_PACK,
  type AdditiveStage,
} from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import type { ProcessId } from '../lib/process';
import type { AdditiveLine } from '../lib/recipe';
import { newAdditiveKey } from '../lib/recipe';
import { computeRecipeAdditives } from '../lib/calculateAdditives';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type AdditivesPanelProps = {
  additives: AdditiveLine[];
  totalOilGrams: number;
  weightUnit: WeightUnit;
  process: ProcessId;
  onChange: (additives: AdditiveLine[]) => void;
};

const BASE_STAGE_OPTIONS: AdditiveStage[] = ['lye', 'oils', 'trace', 'top'];

/** Stages offered in the per-line dropdown. CP has no cook/dilution step, so only
 * HP/LS offer the contextual after-cook stage. */
function offeredStagesForProcess(process: ProcessId): AdditiveStage[] {
  return process === 'cp' ? BASE_STAGE_OPTIONS : [...BASE_STAGE_OPTIONS, 'after_cook'];
}

export function AdditivesPanel({
  additives,
  totalOilGrams,
  weightUnit,
  process,
  onChange,
}: AdditivesPanelProps) {
  const computed = computeRecipeAdditives(additives, totalOilGrams);
  const offeredStages = offeredStagesForProcess(process);

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
    });
  }

  function addLine() {
    onChange([
      ...additives,
      {
        key: newAdditiveKey(),
        catalogId: '',
        name: '',
        percentOfOil: '',
        addAt: 'trace',
      },
    ]);
  }

  function addLatherSupportPack() {
    const existingIds = new Set(
      additives.map((line) => line.catalogId).filter((id) => id !== ''),
    );
    const pack = LATHER_SUPPORT_PACK.flatMap((item) => {
      if (existingIds.has(item.catalogId)) return [];
      const entry = catalogEntryById(item.catalogId);
      if (!entry) return [];
      return [
        {
          key: newAdditiveKey(),
          catalogId: entry.id,
          name: entry.name,
          percentOfOil: String(item.percentOfOil),
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
          <p className="panel__subtitle">% of total oil weight</p>
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
          Optional extras (fragrance, sugar, clay, etc.) dosed as % of oil weight — not included
          in lye math.
        </p>
      ) : (
        <ul className="additive-list" aria-label="Recipe additives">
          {additives.map((line) => {
            const row = computed.find((item) => item.key === line.key);
            const entry = line.catalogId ? catalogEntryById(line.catalogId) : undefined;
            // Mismatched-select guard: a line's current addAt must always be an option,
            // even when it falls outside this process's offered set (e.g. a stray
            // after_cook line viewed under CP) — otherwise the controlled <select> has
            // no matching <option> and silently falls back to a different value.
            const stageOptions = offeredStages.includes(line.addAt)
              ? offeredStages
              : [...offeredStages, line.addAt];

            return (
              <li key={line.key} className="additive-list__row">
                <label className="field">
                  <span className="sr-only">Additive type</span>
                  <select
                    className="input"
                    value={line.catalogId}
                    onChange={(e) => selectCatalog(line.key, e.target.value)}
                  >
                    <option value="">Custom…</option>
                    {ADDITIVE_CATALOG.map((item) => (
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
                    placeholder="Name"
                    value={line.name}
                    onChange={(e) => updateLine(line.key, { name: e.target.value })}
                  />
                </label>
                <label className="field field--compact">
                  <span className="sr-only">Percent of oil</span>
                  <input
                    type="number"
                    className="input input--number"
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="%"
                    value={line.percentOfOil}
                    onChange={(e) => updateLine(line.key, { percentOfOil: e.target.value })}
                    aria-label="Percent of oil weight"
                  />
                </label>
                <label className="field">
                  <span className="sr-only">Add at</span>
                  <select
                    className="input"
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
                  aria-label="Remove additive"
                >
                  ×
                </button>
                {entry && (
                  <p className="additive-list__hint">
                    Typical {entry.typicalLow}
                    {entry.typicalHigh !== entry.typicalLow ? `–${entry.typicalHigh}` : ''}% of
                    oil weight
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
