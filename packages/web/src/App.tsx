import { useRef } from 'react';
import { OilPicker } from './components/OilPicker';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { useRecipeCalculation } from './hooks/useRecipeCalculation';
import { useRecipeProperties } from './hooks/useRecipeProperties';
import { useRecipeStorage } from './hooks/useRecipeStorage';
import { convertEntryMode } from './lib/entryMode';
import { formatGrams } from './lib/format';
import { isTarOil, oilById } from './lib/oils';
import { newLineKey, type EntryMode, type RecipeLine } from './lib/recipe';
import { resolveLineWeights } from './lib/resolveLineWeights';

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

  const { result, inputErrors, linePercents, displayTotals } = useRecipeCalculation(
    lines,
    settings,
  );
  const { properties, indexes } = useRecipeProperties(lines, settings);
  const resolved = resolveLineWeights(lines, settings);
  const lyeLabel = settings.lyeType === 'naoh' ? 'NaOH' : 'KOH';
  const isPercentMode = settings.entryMode === 'percent';

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

  function setEntryMode(entryMode: EntryMode) {
    const converted = convertEntryMode(lines, settings, entryMode);
    setLines(converted.lines);
    setSettings(converted.settings);
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: newLineKey(), oilId: 'olive-oil', weightGrams: '', weightPercent: '' },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
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
            <button type="button" className="btn btn--ghost" onClick={handleNew}>
              New
            </button>
            <button type="button" className="btn" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="btn btn--ghost" onClick={handleExport}>
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
                if (file) handleImportFile(file);
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
              onClick={() => handleLoad(selectedSavedId)}
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
              <span>Entry</span>
              <select
                className="input"
                value={settings.entryMode}
                onChange={(e) => setEntryMode(e.target.value as EntryMode)}
              >
                <option value="grams">Grams</option>
                <option value="percent">Percent</option>
              </select>
            </label>

            {isPercentMode && (
              <label className="field field--inline">
                <span>Total oil (g)</span>
                <input
                  type="number"
                  className="input input--number"
                  min={1}
                  step={1}
                  value={settings.batchOilGrams}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, batchOilGrams: e.target.value }))
                  }
                />
              </label>
            )}
          </div>

          <div className="recipe-table" aria-label="Recipe oils">
            <div className="recipe-table__head">
              <span>Oil</span>
              <span>{isPercentMode ? '%' : 'Weight (g)'}</span>
              <span>{isPercentMode ? 'Weight (g)' : '%'}</span>
              <span className="sr-only">Actions</span>
            </div>

            {lines.map((line) => {
              const oil = oilById(line.oilId);
              const showTar = isTarOil(oil);
              const row = resolved.lines.find((r) => r.line.key === line.key);

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
                    {isPercentMode ? (
                      <input
                        type="number"
                        className="input input--number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={line.weightPercent ?? ''}
                        onChange={(e) =>
                          updateLine(line.key, { weightPercent: e.target.value })
                        }
                        aria-label="Oil percent"
                      />
                    ) : (
                      <input
                        type="number"
                        className="input input--number"
                        min={0}
                        step={1}
                        value={line.weightGrams}
                        onChange={(e) =>
                          updateLine(line.key, { weightGrams: e.target.value })
                        }
                        aria-label="Weight in grams"
                      />
                    )}
                  </div>
                  <div className="recipe-table__pct">
                    {isPercentMode
                      ? `${formatGrams(row?.weightGrams ?? 0, 0)} g`
                      : `${formatGrams(linePercents.get(line.key) ?? 0, 1)}%`}
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
          />

          <PropertiesPanel result={properties} indexes={indexes} />
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
