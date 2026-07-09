import { useRef, useState, useEffect } from 'react';
import { AdditivesPanel } from './components/AdditivesPanel';
import { BatchSheet } from './components/BatchSheet';
import { OilPicker } from './components/OilPicker';
import { FattyAcidPanel } from './components/FattyAcidPanel';
import { FormulationInsightsPanel } from './components/FormulationInsightsPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useDebouncedCommit } from './hooks/useDebouncedCommit';
import { useDraftInputs } from './hooks/useDraftInputs';
import { useRecipeAutosave } from './hooks/useRecipeAutosave';
import { useRecipeEditor } from './hooks/useRecipeEditor';
import { useRecipeInputs } from './hooks/useRecipeInputs';
import { useRecipeStorage } from './hooks/useRecipeStorage';
import { useRecipeViewModel } from './hooks/useRecipeViewModel';
import { loadMoldSizerInput, saveMoldSizerInput } from './lib/moldSizerStorage';
import { isTarOil, oilById } from './lib/oils';
import type { WeightUnit } from './lib/recipe';
import {
  formatRecipePercentTotal,
  previewPercentDisplay,
  previewWeightDisplay,
} from './lib/recipePreview';
import {
  formatWeight,
  gramsStringToInputDisplay,
  WEIGHT_UNITS,
  WEIGHT_UNIT_OPTIONS,
} from './lib/weightUnits';

export default function App() {
  const {
    recipeName,
    setRecipeName,
    lines,
    setLines,
    additives,
    setAdditives,
    settings,
    setSettings,
    saveMessage,
    handleNew,
    handleExport,
    handleImportFile,
  } = useRecipeStorage();

  const importInputRef = useRef<HTMLInputElement>(null);
  const [moldSizerInput, setMoldSizerInput] = useState(loadMoldSizerInput);
  useEffect(() => {
    saveMoldSizerInput(moldSizerInput);
  }, [moldSizerInput]);
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
  const inputs = useRecipeInputs({
    lines, settings, additives, weightUnit,
    drafts, getDraft, setDraft, clearDraft, clearAllDrafts,
    debouncer, editor: { applySynced, applySyncedUpdate, linesRef, batchRef },
    setLines, setSettings, handleExport, handleNew, handleImportFile,
  });

  const vm = useRecipeViewModel({ recipeName, lines, settings, additives, drafts, weightUnit });
  useRecipeAutosave(recipeName, lines, settings, additives);

  function handlePrintBatchSheet() {
    if (!vm.batchSheetData) return;
    window.print();
  }

  return (
    <div className="app">
      <header className="header no-print">
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
            <button type="button" className="btn btn--ghost" onClick={inputs.handleNewRecipe}>
              New
            </button>
            <button type="button" className="btn btn--ghost" onClick={inputs.handleExportCommitted}>
              Export
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handlePrintBatchSheet}
              disabled={!vm.batchSheetData}
            >
              Print
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
                  inputs.discardDrafts();
                  handleImportFile(file);
                }
                e.target.value = '';
              }}
            />
          </div>

          {saveMessage && (
            <p className="recipe-toolbar__status" role="status">
              {saveMessage}
            </p>
          )}
        </div>
      </header>

      <main className="layout no-print">
        <div className="layout__primary">
          <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Recipe oils</h2>
            <button type="button" className="btn btn--ghost" onClick={inputs.addLine}>
              + Add oil
            </button>
          </div>

          <div className="recipe-entry-bar">
            <label className="field field--inline">
              <span>Weight unit</span>
              <select
                className="input"
                value={weightUnit}
                onChange={(e) => inputs.setWeightUnit(e.target.value as WeightUnit)}
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
                  inputs.batchInputId,
                  gramsStringToInputDisplay(vm.previewState.batchOilGrams, weightUnit),
                )}
                onChange={(e) => inputs.handleBatchChange(e.target.value)}
                onBlur={(e) =>
                  debouncer.flush(inputs.batchInputId, () => inputs.commitBatchInput(e.target.value))
                }
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
              const previewLine = vm.previewLineByKey[line.key];

              return (
                <div key={line.key} className="recipe-table__row">
                  <div className="recipe-table__oil">
                    <OilPicker
                      value={line.oilId}
                      onChange={(oilId) => inputs.updateLine(line.key, { oilId })}
                    />
                    {showTar && (
                      <label className="tar-treatment">
                        <span>Tar lye</span>
                        <select
                          value={line.tarLyeTreatment ?? 'include'}
                          onChange={(e) =>
                            inputs.updateLine(line.key, {
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
                        inputs.weightInputId(line.key),
                        previewWeightDisplay(line, previewLine, weightUnit),
                      )}
                      onChange={(e) => inputs.handleWeightChange(line.key, e.target.value)}
                      onBlur={(e) =>
                        debouncer.flush(inputs.weightInputId(line.key), () =>
                          inputs.commitWeightInput(line.key, e.target.value),
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
                        inputs.percentInputId(line.key),
                        previewPercentDisplay(line, previewLine),
                      )}
                      onChange={(e) => setDraft(inputs.percentInputId(line.key), e.target.value)}
                      onBlur={(e) => inputs.commitPercentInput(line.key, e.target.value)}
                      aria-label="Oil percent"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn btn--icon"
                      onClick={() => inputs.removeLine(line.key)}
                      aria-label="Remove oil"
                      disabled={lines.length <= 1}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
            <div
              className={`recipe-table__foot${vm.percentTotalOff || vm.weightTotalOff ? ' recipe-table__foot--warn' : ''}`}
              aria-live="polite"
            >
              <span>Total</span>
              <span className="recipe-table__total-weight">
                {vm.showRecipeTotals && vm.lineTotals.totalWeightGrams > 0
                  ? formatWeight(vm.lineTotals.totalWeightGrams, weightUnit)
                  : '—'}
              </span>
              <span className="recipe-table__total-pct">
                {vm.showRecipeTotals
                  ? formatRecipePercentTotal(vm.lineTotals.totalPercent)
                  : '—'}
              </span>
              <span className="sr-only">Actions</span>
            </div>
          </div>
        </section>

        <AdditivesPanel
          additives={additives}
          totalOilGrams={vm.totalOilGrams}
          weightUnit={weightUnit}
          onChange={setAdditives}
        />
        </div>

        <aside className="sidebar">
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            weightUnit={weightUnit}
            totalOilGrams={vm.totalOilGrams}
            lyeGrams={vm.result?.lyeWeightGrams ?? 0}
            waterSuggestion={vm.waterSuggestion}
            moldSizerInput={moldSizerInput}
            onMoldSizerChange={setMoldSizerInput}
            liveOilBatchFraction={vm.liveOilBatchFraction}
            onApplySuggestedOilGrams={inputs.handleApplySuggestedOilGrams}
          />

          <ResultsPanel
            result={vm.result}
            inputErrors={vm.inputErrors}
            lyeLabel={vm.lyeLabel}
            lyeType={vm.previewSettings.lyeType}
            kohBlendPercent={vm.previewSettings.kohBlendPercent}
            displayTotals={vm.displayTotals}
            weightUnit={weightUnit}
            waterMode={vm.previewSettings.waterMode}
            splitLiquid={vm.previewSettings.splitLiquid}
            splitLiquidGrams={vm.splitLiquidGrams}
            additives={vm.computedAdditives}
          />

          <PropertiesPanel result={vm.properties} indexes={vm.indexes} />
          <FattyAcidPanel result={vm.fattyAcids} />
          <FormulationInsightsPanel insights={vm.insights} />
        </aside>
      </main>

      <footer className="footer no-print">
        <p>
          SAP from public FNWL chart with ISO 3657 conversion. Always verify with batch testing.
        </p>
      </footer>

      <BatchSheet data={vm.batchSheetData} />
    </div>
  );
}
