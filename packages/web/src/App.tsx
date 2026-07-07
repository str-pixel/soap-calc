import { useMemo, useRef } from 'react';
import { OilPicker } from './components/OilPicker';
import { FattyAcidPanel } from './components/FattyAcidPanel';
import { FormulationInsightsPanel } from './components/FormulationInsightsPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { useDebouncedCommit } from './hooks/useDebouncedCommit';
import { useDraftInputs } from './hooks/useDraftInputs';
import { useRecipeAutosave } from './hooks/useRecipeAutosave';
import { useFormulationInsights } from './hooks/useFormulationInsights';
import { useRecipeCalculation } from './hooks/useRecipeCalculation';
import { useRecipeEditor } from './hooks/useRecipeEditor';
import { useRecipeProperties } from './hooks/useRecipeProperties';
import { useRecipeStorage } from './hooks/useRecipeStorage';
import { commitDrafts } from './lib/commitDrafts';
import {
  addRecipeLine,
  resyncFromWeights,
  syncBatchTotalEdit,
  syncPercentEdit,
  syncWeightEdit,
  type SyncedRecipe,
} from './lib/lineWeightSync';
import { isTarOil, oilById } from './lib/oils';
import { newLineKey, type RecipeLine, type WeightUnit } from './lib/recipe';
import {
  previewPercentDisplay,
  previewWeightDisplay,
  usePreviewRecipeState,
  usePreviewSettings,
} from './lib/recipePreview';
import {
  gramsStringToInputDisplay,
  parseInputDisplayToGrams,
  parsePercentInput,
  WEIGHT_UNITS,
  WEIGHT_UNIT_OPTIONS,
} from './lib/weightUnits';

export default function App() {
  const {
    recipeName,
    setRecipeName,
    lines,
    setLines,
    settings,
    setSettings,
    savedRecipes,
    selectedSavedId,
    setSelectedSavedId,
    saveMessage,
    handleSave,
    handleLoad,
    handleDelete,
    handleNew,
    handleExport,
    handleImportFile,
  } = useRecipeStorage();

  const importInputRef = useRef<HTMLInputElement>(null);
  const { getDraft, setDraft, clearDraft, clearAllDrafts, drafts } = useDraftInputs();
  const debouncer = useDebouncedCommit();
  const { applySynced, applySyncedUpdate, linesRef, batchRef } = useRecipeEditor(
    lines,
    settings.batchOilGrams,
    setLines,
    setSettings,
  );
  const weightUnit = settings.weightUnit;
  const weightUnitConfig = WEIGHT_UNITS[weightUnit];
  const batchInputId = 'batch-total';

  const previewState = usePreviewRecipeState(
    lines,
    settings.batchOilGrams,
    drafts,
    weightUnit,
  );
  const previewLineByKey = useMemo(
    () => Object.fromEntries(previewState.lines.map((line) => [line.key, line])),
    [previewState.lines],
  );
  const previewSettings = usePreviewSettings(settings, previewState.batchOilGrams);
  useRecipeAutosave(recipeName, previewState.lines, previewSettings);
  const { result, inputErrors, displayTotals } = useRecipeCalculation(
    previewState.lines,
    previewSettings,
  );
  const { properties, indexes } = useRecipeProperties(previewState.lines, previewSettings);
  const { fattyAcids, insights } = useFormulationInsights(
    previewState.lines,
    previewSettings,
    properties,
    result,
  );
  const lyeLabel = settings.lyeType === 'naoh' ? 'NaOH' : 'KOH';

  function updateLine(key: string, patch: Partial<RecipeLine>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.oilId) {
          const oil = oilById(patch.oilId);
          if (!isTarOil(oil)) {
            const { tarLyeTreatment: _, ...rest } = next;
            return rest;
          }
          if (!next.tarLyeTreatment) {
            return { ...next, tarLyeTreatment: 'include' };
          }
        }
        return next;
      }),
    );
  }

  function weightInputId(key: string): string {
    return `weight-${key}`;
  }

  function percentInputId(key: string): string {
    return `percent-${key}`;
  }

  function flushCommittedDrafts(): SyncedRecipe {
    debouncer.cancelAll();
    const synced = commitDrafts(linesRef.current, batchRef.current, drafts, weightUnit);
    if (Object.keys(drafts).length > 0) {
      clearAllDrafts();
      applySynced(synced);
    }
    return synced;
  }

  function discardDrafts() {
    debouncer.cancelAll();
    clearAllDrafts();
  }

  function handleSaveCommitted() {
    const synced = flushCommittedDrafts();
    handleSave({
      lines: synced.lines,
      settings: { ...settings, batchOilGrams: synced.batchOilGrams },
    });
  }

  function handleExportCommitted() {
    const synced = flushCommittedDrafts();
    handleExport({
      lines: synced.lines,
      settings: { ...settings, batchOilGrams: synced.batchOilGrams },
    });
  }

  function handleNewRecipe() {
    discardDrafts();
    handleNew();
  }

  function handleLoadRecipe(id: string) {
    discardDrafts();
    handleLoad(id);
  }

  function commitWeightInput(key: string, displayValue: string) {
    const weightGrams = parseInputDisplayToGrams(displayValue, weightUnit);
    clearDraft(weightInputId(key));
    if (weightGrams === null) return;

    applySyncedUpdate((prev, batchOilGrams) =>
      syncWeightEdit(prev, key, weightGrams, batchOilGrams),
    );
  }

  function commitPercentInput(key: string, displayValue: string) {
    const weightPercent = parsePercentInput(displayValue);
    clearDraft(percentInputId(key));
    if (weightPercent === null) return;

    applySyncedUpdate((prev, batchOilGrams) =>
      syncPercentEdit(prev, key, weightPercent, batchOilGrams),
    );
  }

  function commitBatchInput(displayValue: string) {
    const batchOilGrams = parseInputDisplayToGrams(displayValue, weightUnit);
    clearDraft(batchInputId);
    if (batchOilGrams === null) return;

    if (batchOilGrams === '') {
      applySyncedUpdate((prev) => resyncFromWeights(prev));
      return;
    }

    applySyncedUpdate((prev) => ({
      lines: syncBatchTotalEdit(prev, batchOilGrams),
      batchOilGrams,
    }));
  }

  function handleWeightChange(key: string, displayValue: string) {
    setDraft(weightInputId(key), displayValue);
  }

  function handleBatchChange(displayValue: string) {
    setDraft(batchInputId, displayValue);
  }

  function setWeightUnit(nextUnit: WeightUnit) {
    debouncer.cancelAll();
    clearAllDrafts();
    setSettings((s) => ({ ...s, weightUnit: nextUnit }));
  }

  function addLine() {
    const newLine = { key: newLineKey(), oilId: 'olive-oil', weightGrams: '', weightPercent: '' };
    applySyncedUpdate((prev, batchOilGrams) => addRecipeLine(prev, batchOilGrams, newLine));
  }

  function removeLine(key: string) {
    if (lines.length <= 1) return;
    applySyncedUpdate((prev) => resyncFromWeights(prev.filter((line) => line.key !== key)));
    clearDraft(weightInputId(key));
    clearDraft(percentInputId(key));
    debouncer.cancel(weightInputId(key));
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <h1>Soap Calc</h1>
          <p className="header__tagline">
            Lye &amp; water from a public oil database — FNWL cross-check &amp; ISO 3657 units
          </p>
        </div>

        <div className="recipe-toolbar">
          <label className="recipe-toolbar__name">
            <span className="sr-only">Recipe name</span>
            <input
              type="text"
              className="input recipe-toolbar__name-input"
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              placeholder="Recipe name"
            />
          </label>

          <div className="recipe-toolbar__actions">
            <button type="button" className="btn btn--ghost" onClick={handleNewRecipe}>
              New
            </button>
            <button type="button" className="btn" onClick={handleSaveCommitted}>
              Save
            </button>
            <button type="button" className="btn btn--ghost" onClick={handleExportCommitted}>
              Export
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => importInputRef.current?.click()}
            >
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  discardDrafts();
                  handleImportFile(file);
                }
                e.target.value = '';
              }}
            />
            <label className="recipe-toolbar__load">
              <span className="sr-only">Saved recipes</span>
              <select
                className="input"
                value={selectedSavedId}
                onChange={(e) => setSelectedSavedId(e.target.value)}
                aria-label="Saved recipes"
              >
                <option value="">Saved recipes…</option>
                {savedRecipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => handleLoadRecipe(selectedSavedId)}
              disabled={!selectedSavedId}
            >
              Load
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--danger"
              onClick={() => handleDelete(selectedSavedId)}
              disabled={!selectedSavedId}
            >
              Delete
            </button>
          </div>

          {saveMessage && (
            <p className="recipe-toolbar__status" role="status">
              {saveMessage}
            </p>
          )}
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Recipe oils</h2>
            <button type="button" className="btn btn--ghost" onClick={addLine}>
              + Add oil
            </button>
          </div>

          <div className="recipe-entry-bar">
            <label className="field field--inline">
              <span>Weight unit</span>
              <select
                className="input"
                value={weightUnit}
                onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}
              >
                {WEIGHT_UNIT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} ({option.short})
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--inline">
              <span>Total oil ({weightUnitConfig.short})</span>
              <input
                type="number"
                className="input input--number"
                min={0}
                step={weightUnitConfig.inputStep}
                value={getDraft(
                  batchInputId,
                  gramsStringToInputDisplay(previewState.batchOilGrams, weightUnit),
                )}
                onChange={(e) => handleBatchChange(e.target.value)}
                onBlur={(e) => debouncer.flush(batchInputId, () => commitBatchInput(e.target.value))}
              />
            </label>
          </div>

          <div className="recipe-table">
            <div className="recipe-table__head">
              <span>Oil</span>
              <span>Weight ({weightUnitConfig.short})</span>
              <span>%</span>
              <span className="sr-only">Actions</span>
            </div>

            {lines.map((line) => {
              const oil = oilById(line.oilId);
              const showTar = isTarOil(oil);
              const previewLine = previewLineByKey[line.key];

              return (
                <div key={line.key} className="recipe-table__row">
                  <div className="recipe-table__oil">
                    <OilPicker
                      value={line.oilId}
                      onChange={(oilId) => updateLine(line.key, { oilId })}
                    />
                    {showTar && (
                      <label className="tar-treatment">
                        <span>Tar lye</span>
                        <select
                          value={line.tarLyeTreatment ?? 'include'}
                          onChange={(e) =>
                            updateLine(line.key, {
                              tarLyeTreatment: e.target.value as 'include' | 'additive',
                            })
                          }
                        >
                          <option value="include">Include in lye</option>
                          <option value="additive">Add at trace</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <div>
                    <input
                      type="number"
                      className="input input--number"
                      min={0}
                      step={weightUnitConfig.inputStep}
                      value={getDraft(
                        weightInputId(line.key),
                        previewWeightDisplay(line, previewLine, weightUnit),
                      )}
                      onChange={(e) => handleWeightChange(line.key, e.target.value)}
                      onBlur={(e) =>
                        debouncer.flush(weightInputId(line.key), () =>
                          commitWeightInput(line.key, e.target.value),
                        )
                      }
                      aria-label={`Weight in ${weightUnitConfig.short}`}
                    />
                  </div>
                  <div className="recipe-table__pct">
                    <input
                      type="number"
                      className="input input--number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={getDraft(
                        percentInputId(line.key),
                        previewPercentDisplay(line, previewLine),
                      )}
                      onChange={(e) => setDraft(percentInputId(line.key), e.target.value)}
                      onBlur={(e) => commitPercentInput(line.key, e.target.value)}
                      aria-label="Oil percent"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn btn--icon"
                      onClick={() => removeLine(line.key)}
                      aria-label="Remove oil"
                      disabled={lines.length <= 1}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="sidebar">
          <section className="panel">
            <h2 className="panel__title">Settings</h2>
            <div className="settings-grid">
              <label className="field">
                <span>Superfat %</span>
                <input
                  type="number"
                  className="input"
                  min={0}
                  max={50}
                  step={0.5}
                  value={settings.superfatPercent}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, superfatPercent: e.target.value }))
                  }
                />
              </label>

              <label className="field">
                <span>Lye type</span>
                <select
                  className="input"
                  value={settings.lyeType}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      lyeType: e.target.value as 'naoh' | 'koh',
                    }))
                  }
                >
                  <option value="naoh">NaOH (bar soap)</option>
                  <option value="koh">KOH (liquid soap)</option>
                </select>
              </label>

              <label className="field">
                <span>Water method</span>
                <select
                  className="input"
                  value={settings.waterMode}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      waterMode: e.target.value as typeof settings.waterMode,
                    }))
                  }
                >
                  <option value="percent_of_oils">% of oils</option>
                  <option value="lye_concentration">Lye concentration %</option>
                  <option value="lye_water_ratio">Water : lye ratio</option>
                </select>
              </label>

              {settings.waterMode === 'percent_of_oils' && (
                <label className="field">
                  <span>Water % of oils</span>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    step={1}
                    value={settings.waterPercentOfOils}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, waterPercentOfOils: e.target.value }))
                    }
                  />
                </label>
              )}

              {settings.waterMode === 'lye_concentration' && (
                <label className="field">
                  <span>Lye concentration %</span>
                  <input
                    type="number"
                    className="input"
                    min={0.1}
                    max={99.9}
                    step={0.1}
                    value={settings.lyeConcentrationPercent}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        lyeConcentrationPercent: e.target.value,
                      }))
                    }
                  />
                </label>
              )}

              {settings.waterMode === 'lye_water_ratio' && (
                <label className="field">
                  <span>Water : lye ratio</span>
                  <input
                    type="number"
                    className="input"
                    min={0.1}
                    step={0.1}
                    value={settings.lyeWaterRatio}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, lyeWaterRatio: e.target.value }))
                    }
                  />
                </label>
              )}

              {settings.lyeType === 'naoh' ? (
                <label className="field">
                  <span>NaOH purity %</span>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={100}
                    step={0.1}
                    value={settings.naohPurityPercent}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, naohPurityPercent: e.target.value }))
                    }
                  />
                </label>
              ) : (
                <label className="field">
                  <span>KOH purity %</span>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={100}
                    step={0.1}
                    value={settings.kohPurityPercent}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, kohPurityPercent: e.target.value }))
                    }
                  />
                </label>
              )}
            </div>
          </section>

          <ResultsPanel
            result={result}
            inputErrors={inputErrors}
            lyeLabel={lyeLabel}
            displayTotals={displayTotals}
            weightUnit={weightUnit}
          />

          <PropertiesPanel result={properties} indexes={indexes} />
          <FattyAcidPanel result={fattyAcids} />
          <FormulationInsightsPanel insights={insights} />
        </aside>
      </main>

      <footer className="footer">
        <p>
          SAP from public FNWL chart with ISO 3657 conversion. Always verify with batch testing.
        </p>
      </footer>
    </div>
  );
}
