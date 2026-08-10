import { useRef, useState, useEffect, useMemo, type KeyboardEvent } from 'react';
import { ActionsMenu } from './components/ActionsMenu';
import { AdditivesPanel } from './components/AdditivesPanel';
import { BatchSheet } from './components/BatchSheet';
import { CpExtrasPanel } from './components/CpExtrasPanel';
import { DilutionPanel, type DilutionMode, type DilutionScope } from './components/DilutionPanel';
import { FattyAcidPanel } from './components/FattyAcidPanel';
import { FormulationInsightsPanel } from './components/FormulationInsightsPanel';
import { NeutralizePanel } from './components/NeutralizePanel';
import { portionDilutionFor } from './components/PortionDilutionResults';
import { PreservativeSnippet } from './components/PreservativeSnippet';
import { PricingPanel } from './components/PricingPanel';
import { ProcessGuidePanel } from './components/ProcessGuidePanel';
import { TroubleshootingPanel } from './components/TroubleshootingPanel';
import { ProcessTabs } from './components/ProcessTabs';
import { PropertiesPanel } from './components/PropertiesPanel';
import { RecipeOilsPanel } from './components/RecipeOilsPanel';
import { SoapingTemperaturePanel } from './components/SoapingTemperaturePanel';
import { ResultsPanel } from './components/ResultsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { SuperfatWaterPanel } from './components/SuperfatWaterPanel';
import { useDraftInputs } from './hooks/useDraftInputs';
import { useRecipeAutosave } from './hooks/useRecipeAutosave';
import { useRecipeEditor } from './hooks/useRecipeEditor';
import { useRecipeInputs } from './hooks/useRecipeInputs';
import { useRecipeStorage } from './hooks/useRecipeStorage';
import { useRecipeViewModel } from './hooks/useRecipeViewModel';
import { useUndoShortcut } from './hooks/useUndoShortcut';
import { convertBarWeightBetweenUnits } from './lib/moldSizer';
import { loadMoldSizerInput, saveMoldSizerInput } from './lib/moldSizerStorage';
import type { PricingProfile } from './lib/pricingProfile';
import { loadPricingProfile, savePricingProfile } from './lib/pricingStorage';
import { processOffers } from './lib/process';
import { buildRecipePricingContext } from './lib/recipePricing';

const VIEW_STORAGE_KEY = 'soap-calc:view';

const VIEWS = [
  { key: 'recipe', label: 'Recipe' },
  { key: 'pricing', label: 'Pricing & profit' },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];

export default function App() {
  const {
    process,
    setProcess,
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
    workspaceGeneration,
    flashSaveMessage,
  } = useRecipeStorage();

  const importInputRef = useRef<HTMLInputElement>(null);
  // Top-level view: the recipe calculator vs. the pricing & profit calculator (its own tab).
  // Persisted like the rest of the workspace so a reload keeps you on the tab you were using.
  const [view, setView] = useState<ViewKey>(() => {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) === 'pricing' ? 'pricing' : 'recipe';
    } catch {
      return 'recipe';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* storage unavailable (private mode / quota) — view just won't persist */
    }
  }, [view]);
  const [moldSizerInput, setMoldSizerInput] = useState(loadMoldSizerInput);
  // UI-only helper input (not part of the saved recipe), mirroring how moldSizerInput's
  // fields are batch-sizing aids rather than recipe data: the HP cook-vessel guard input.
  const [vesselVolumeLiters, setVesselVolumeLiters] = useState('');
  // Both live here rather than in the recipe: "how much am I making right now" and "what
  // did my paste weigh" are bench decisions, not properties of the formula, so they must
  // not dirty a saved or exported recipe. App state keeps them across process switches
  // within a session.
  const [portionTargetMl, setPortionTargetMl] = useState('');
  // Always the whole batch's paste: the declaration that used to sit beside the field is
  // gone — see lib/measuredPaste's MEASURED_PASTE_IS_REMAINING.
  const [measuredPasteGrams, setMeasuredPasteGrams] = useState('');
  // A measurement describes one specific batch's paste; it must not survive an edit to the
  // recipe that batch was measured from, or the dilution figures keep using a paste weight
  // that no longer belongs to the oils being diluted. There is no single handler that
  // mutates `lines` — the recipe editor's apply functions, import, new-recipe, and
  // undo/redo all do, independently — so a single-handler reset isn't available here. A
  // useEffect is the prescription (not a fallback): it is the one place that necessarily
  // sees every path that changes the recipe.
  //
  // Keyed on the oils' CONTENT, not `lines`' array identity: switching process tabs
  // reloads the OTHER process's own draft via loadWorkspace → loadDraft → JSON.parse,
  // and JSON.parse allocates a fresh array every time even when the bytes are identical.
  // A round trip back to an unchanged Liquid soap recipe would then present a new `lines`
  // reference for byte-identical oils and wipe the measurement for no real edit — silently
  // contradicting "App state keeps them across ... process switches" above. The signature
  // below is stable across that reload and only changes when an oil, its weight, or its
  // tar-lye treatment actually changes.
  const oilsSignature = lines
    .map((l) => `${l.oilId}:${l.weightGrams}:${l.tarLyeTreatment ?? ''}`)
    .join('|');
  // A plain `[oilsSignature]` dependency (the earlier fix) still over-clears: switching
  // process ALSO changes oilsSignature whenever the two processes' oils genuinely differ
  // (not just an identity change), so returning to an untouched Liquid soap recipe found
  // its own measurement gone even though LS's oils never changed — contradicting the
  // comment above. The measurement must only clear when the signature changes WITHIN the
  // same process (a real edit to the oils that batch was measured from), never when a
  // process switch happens to carry a different oils signature along with it. Tracking the
  // previous {process, oilsSignature} pair in a ref (rather than keying a single string) is
  // what lets the effect tell those two cases apart: both fields move together on a process
  // switch, but only oilsSignature moves on an in-process oils edit.
  const prevProcessOilsRef = useRef({ process, oilsSignature });
  useEffect(() => {
    const prev = prevProcessOilsRef.current;
    if (prev.process === process && prev.oilsSignature !== oilsSignature) {
      setMeasuredPasteGrams('');
    }
    prevProcessOilsRef.current = { process, oilsSignature };
  }, [process, oilsSignature]);
  // Which way the maker is choosing the dilution target: a soap concentration (the
  // default — LS:1536, and what the persisted settings.soapConcentrationPercent already
  // is), a water:paste ratio by weight (LS:1534), or Gradual Dilution — recording the water
  // actually poured in and letting the concentration fall out of that (also LS:1531).
  // Session-local like the portion inputs above, not a recipe setting — the persisted
  // concentration is still the one figure every downstream consumer (vm.dilution,
  // DilutionPanel, BatchSheet) reads; ratio and gradual only ever write into it via
  // DilutionPanel's onSoapConcentrationChange. waterPasteRatio below is session-local for
  // the same reason; gradualWaterGrams is the one exception — it is recipe state
  // (settings.gradualWaterGrams, RecipeSettings' own field), because it is also the basis
  // of a preservative dose that is itself recipe state and must survive a reload.
  const [dilutionMode, setDilutionMode] = useState<DilutionMode>('concentration');
  const [waterPasteRatio, setWaterPasteRatio] = useState('2');
  // "Dilute it all" vs "make just this much now" — a decision about the session, not the
  // recipe, so it lives here rather than in settings. Defaults to the whole batch.
  const [dilutionScope, setDilutionScope] = useState<DilutionScope>('batch');
  useEffect(() => {
    saveMoldSizerInput(moldSizerInput);
  }, [moldSizerInput]);
  const [pricingProfile, setPricingProfile] = useState<PricingProfile>(() => loadPricingProfile());
  useEffect(() => {
    savePricingProfile(pricingProfile);
  }, [pricingProfile]);
  const { getDraft, setDraft, clearDraft, clearAllDrafts, drafts } = useDraftInputs();
  const {
    applySynced,
    applyEdit,
    applySyncedUpdate,
    linesRef,
    batchRef,
    batchSetByUserRef,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useRecipeEditor(
    lines,
    settings.batchOilGrams,
    settings.batchSetByUser,
    setLines,
    setSettings,
    workspaceGeneration,
  );
  const weightUnit = settings.weightUnit;
  // The mold sizer stores its bar weight as a raw display string interpreted in the
  // current unit; convert it on unit change (like recipe weights) so "120 g" doesn't
  // silently become "120 oz".
  const prevWeightUnitRef = useRef(weightUnit);
  useEffect(() => {
    const prevUnit = prevWeightUnitRef.current;
    if (prevUnit === weightUnit) return;
    prevWeightUnitRef.current = weightUnit;
    setMoldSizerInput((current) => {
      const converted = convertBarWeightBetweenUnits(current.barWeight, prevUnit, weightUnit);
      return converted === current.barWeight ? current : { ...current, barWeight: converted };
    });
  }, [weightUnit]);
  const inputs = useRecipeInputs({
    lines, settings, additives, weightUnit,
    drafts, setDraft, clearDraft, clearAllDrafts,
    editor: {
      applySynced, applyEdit, applySyncedUpdate, linesRef, batchRef, batchSetByUserRef,
      undo, redo, canUndo, canRedo,
    },
    setLines, setSettings, handleExport, handleNew,
  });
  useUndoShortcut(inputs.undo, inputs.redo);

  const vesselVolumeLitersNumber = Number(vesselVolumeLiters);
  const vesselVolumeCm3 =
    Number.isFinite(vesselVolumeLitersNumber) && vesselVolumeLitersNumber > 0
      ? vesselVolumeLitersNumber * 1000
      : null;
  const vm = useRecipeViewModel({
    recipeName,
    lines,
    settings,
    additives,
    drafts,
    weightUnit,
    process,
    vesselVolumeCm3,
    measuredPasteGrams,
  });
  useRecipeAutosave(process, recipeName, lines, settings, additives, () =>
    flashSaveMessage('Could not auto-save — export your recipe so you don’t lose it.'),
  );

  function handlePrintBatchSheet() {
    if (!vm.batchSheetData) return;
    window.print();
  }

  // Memoized + built by the lib (tested there): includes every material the batch
  // weight includes — append-mode post-cook superfat and split liquid are priceable,
  // so per-unit cost can't be silently understated. Memo keeps PricingPanel's memo()
  // effective across unrelated keystrokes.
  // Scalar, not vm.result: the result OBJECT gets a new identity on every settings
  // keystroke (notes, purity, ...) even when the lye grams are unchanged — depending
  // on it would defeat this memo and PricingPanel's memo() for exactly those edits.
  const lyeGrams = vm.result?.lyeWeightGrams ?? 0;
  const pricingContext = useMemo(
    () =>
      buildRecipePricingContext({
        lines: vm.previewState.lines,
        computedAdditives: vm.computedAdditives,
        lyeGrams,
        batchWeightWithExtras: vm.batchWeightWithExtras,
        splitLiquids: vm.splitLiquidRows
          .filter(({ grams }) => grams != null && grams > 0)
          .map(({ row, grams }) => ({ key: row.key, name: row.name, grams: grams as number })),
        postCookSuperfat: vm.postCookSuperfat
          ? {
              oils: vm.postCookSuperfat.oils.map((o) => ({ oilId: o.oilId, grams: o.grams })),
              isExtra: vm.pcsfIsExtra,
            }
          : null,
      }),
    [
      vm.previewState.lines,
      vm.computedAdditives,
      lyeGrams,
      vm.batchWeightWithExtras,
      vm.splitLiquidRows,
      vm.splitLiquidGrams,
      vm.postCookSuperfat,
      vm.pcsfIsExtra,
    ],
  );

  // WHAT THE PRESERVATIVE DOSE IS A PERCENTAGE OF: the mass of what the maker is actually
  // making right now. Which mass that is has an owner already — the Dilution panel's scope
  // toggle — so this follows it rather than assuming the batch.
  //
  // Whole batch: today's finished-product figure, the same one the panel's own row quotes.
  // Custom amount: the PORTION's own finished solution. That scope prints portion figures
  // and deliberately shows no batch mass at all, so dosing the batch there prescribed a
  // whole batch's grams into a bottle a fraction of its size — a 250 ml draw off a 4 kg
  // batch read 40 g of Suttocide A, about 16% w/w in that bottle against a 1.0% EU ceiling.
  //
  // Null (→ the snippet's hint for that state, never a silent fall back to the batch)
  // whenever no such mass exists: no dilution at all, or a Custom amount whose portion does
  // not resolve — nothing asked for yet, a refused paste reading, a paste already thinner
  // than the target. portionDilutionFor is the panel's OWN resolution of that question,
  // imported rather than re-derived so the dose and the figures on screen can never
  // disagree about whether a portion exists or what it weighs.
  //
  // The portion base is chemistry-only (paste + water), like every other portion figure:
  // extras that ride into the bottle are counted in the batch figure but never apportioned.
  // That understates the portion's finished mass slightly, which understates the dose —
  // toward, never past, the ceiling.
  const preservativeBaseGrams = useMemo(() => {
    if (dilutionScope !== 'portion') return vm.finishedProductGrams;
    if (!vm.dilution) return null;
    return (
      portionDilutionFor({
        dilution: vm.dilution,
        targetMl: portionTargetMl,
        measuredPasteGrams,
        wholeBatchPasteGrams: vm.wholeBatchPasteGrams,
        cookWaterGrams: vm.cookWaterGrams,
      }).portion?.solutionGrams ?? null
    );
  }, [
    dilutionScope,
    measuredPasteGrams,
    portionTargetMl,
    vm.cookWaterGrams,
    vm.dilution,
    vm.finishedProductGrams,
    vm.wholeBatchPasteGrams,
  ]);

  // Extracted so The Numbers reads identically in both the Recipe and Pricing views:
  // the pricing calculator needs the same batch figures it prices, so both share one
  // ResultsPanel element rather than duplicating its (large) prop wiring.
  const resultsPanel = (
    <ResultsPanel
      result={vm.result}
      inputErrors={vm.inputErrors}
      lyeLabel={vm.lyeLabel}
      process={process}
      lyeType={vm.previewSettings.lyeType}
      kohBlendPercent={vm.previewSettings.kohBlendPercent}
      displayTotals={vm.displayTotals}
      weightUnit={weightUnit}
      waterMode={vm.previewSettings.waterMode}
      splitLiquidRows={vm.splitLiquidRows}
      splitLiquidGrams={vm.splitLiquidGrams}
      additives={vm.computedAdditives}
      superfatPercent={vm.previewSettings.superfatPercent}
      postCookSuperfat={vm.postCookSuperfat}
      pcsfIsExtra={vm.pcsfIsExtra}
      extrasGrams={vm.extrasGrams}
      batchWeightWithExtras={vm.batchWeightWithExtras}
      cureEstimate={vm.cureEstimate}
      labelWeight={vm.labelWeight}
      totalOilGrams={vm.totalOilGrams}
    />
  );

  const pricingPanel = (
    <PricingPanel
      context={pricingContext}
      profile={pricingProfile}
      onProfileChange={setPricingProfile}
      weightUnit={weightUnit}
    />
  );

  // WAI-ARIA tabs keyboard pattern for the view switch, matching ProcessTabs: arrow keys
  // move selection + focus among the tabs, Home/End jump to the ends.
  const viewIndex = VIEWS.findIndex((v) => v.key === view);
  function handleViewKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (viewIndex + 1) % VIEWS.length;
        break;
      case 'ArrowLeft':
        nextIndex = (viewIndex - 1 + VIEWS.length) % VIEWS.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = VIEWS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setView(VIEWS[nextIndex].key);
    const tablist = event.currentTarget.closest('[role="tablist"]');
    const tabs = tablist
      ? Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      : [];
    tabs[nextIndex]?.focus();
  }

  return (
    <div className="app">
      <header className="masthead no-print">
        <div className="masthead__brand">
          <h1 className="masthead__logo">Soap&nbsp;Calc</h1>
          <div className="masthead__meta">
            <p className="masthead__tagline">The soap calculator you actually understand.</p>
            <p className="masthead__eyebrow">
              Public SAP data · FNWL cross-check · ISO 3657 units
            </p>
          </div>
        </div>

        <nav className="view-tabs" role="tablist" aria-label="View">
          {VIEWS.map((t) => {
            const active = view === t.key;
            return (
              <button
                key={t.key}
                id={`view-tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="view-panel"
                tabIndex={active ? 0 : -1}
                className={`view-tabs__tab${active ? ' view-tabs__tab--active' : ''}`}
                onClick={() => setView(t.key)}
                onKeyDown={handleViewKeyDown}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="process-bar">
          <ProcessTabs
            process={process}
            onChange={setProcess}
            processVariant={settings.processVariant}
            onVariantChange={(processVariant) => setSettings({ ...settings, processVariant })}
          />

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
            <ActionsMenu
              onNew={inputs.handleNewRecipe}
              onExport={inputs.handleExportCommitted}
              onPrint={handlePrintBatchSheet}
              onImport={() => importInputRef.current?.click()}
              canPrint={!!vm.batchSheetData}
            />
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                // Drafts are discarded only if the file parses — a refused import must
                // not cost in-progress typed edits (verified live at #148's review).
                handleImportFile(file, inputs.discardDrafts);
              }
              e.target.value = '';
            }}
          />

          {saveMessage && (
            <p className="recipe-toolbar__status" role="status">
              {saveMessage}
            </p>
          )}
          </div>
        </div>
      </header>

      {view === 'recipe' ? (
        <main
          className="layout layout--recipe no-print"
          id="view-panel"
          role="tabpanel"
          aria-labelledby={`view-tab-${view}`}
          tabIndex={0}
        >
          {/* Column 1 — Formula: settings, then the recipe inputs. */}
          <div className="col col--formula">
            <SettingsPanel
              process={process}
              moldSizerWaterLossPercent={vm.cureWaterLossPercent}
              settings={settings}
              setSettings={setSettings}
              weightUnit={weightUnit}
              previewState={vm.previewState}
              getDraft={getDraft}
              inputs={inputs}
              batchWeightWithExtras={vm.batchWeightWithExtras}
              recipeOilWeightGrams={vm.displayTotals?.recipeOilWeightGrams ?? 0}
              fixedBatchExtrasGrams={vm.fixedBatchExtrasGrams}
              moldSizerInput={moldSizerInput}
              onMoldSizerChange={setMoldSizerInput}
              liveOilBatchFraction={vm.liveOilBatchFraction}
              onApplySuggestedOilGrams={inputs.handleApplySuggestedOilGrams}
              vesselVolumeLiters={vesselVolumeLiters}
              onVesselVolumeLitersChange={setVesselVolumeLiters}
              hpVesselMultiple={vm.hpVesselMultiple}
            />

            <SuperfatWaterPanel
              settings={settings}
              setSettings={setSettings}
              process={process}
              totalOilGrams={vm.totalOilGrams}
              lyeGrams={vm.result?.lyeWeightGrams ?? 0}
              weightUnit={weightUnit}
              waterSuggestion={vm.waterSuggestion}
              lyeWaterStatus={vm.lyeWaterStatus}
              lyeWaterUnverifiable={vm.lyeWaterUnverifiable}
              lyeWaterShortfallCertain={vm.lyeWaterShortfallCertain}
              splitLiquidRows={vm.splitLiquidRows}
              splitAllocation={vm.splitAllocation}
              acidExtraLye={vm.acidExtraLye}
            />

            <RecipeOilsPanel
              lines={lines} weightUnit={weightUnit}
              previewLineByKey={vm.previewLineByKey}
              lineTotals={vm.lineTotals} showRecipeTotals={vm.showRecipeTotals}
              percentTotalOff={vm.percentTotalOff} weightTotalOff={vm.weightTotalOff}
              getDraft={getDraft} setDraft={setDraft}
              inputs={inputs}
            />

            <SoapingTemperaturePanel
              settings={settings}
              setSettings={setSettings}
              process={process}
              waterLyeRatio={vm.result?.waterLyeRatio ?? null}
              lsMethod={vm.lsMethod}
            />

            <AdditivesPanel
              additives={additives}
              computed={vm.computedAdditives}
              weightUnit={weightUnit}
              process={process}
              onChange={setAdditives}
            />

            {processOffers(process, 'cpExtras') && (
              <CpExtrasPanel totalOilGrams={vm.totalOilGrams} />
            )}
          </div>

          {/* Column 2 — The Numbers: the computed outputs and the knobs that drive them. */}
          <div className="col col--numbers">
            {resultsPanel}

            {processOffers(process, 'dilution') && (
              <DilutionPanel
                dilution={vm.dilution}
                soapConcentrationPercent={settings.soapConcentrationPercent}
                onSoapConcentrationChange={(value) =>
                  setSettings({ ...settings, soapConcentrationPercent: value })
                }
                weightUnit={weightUnit}
                altLiquidWaterGrams={vm.splitLiquidPasteWater}
                unknownLiquidGrams={vm.unknownLiquidGrams}
                overDilutionCertain={vm.overDilutionCertain}
                bottledSolutionGrams={vm.bottledSolutionGrams}
                cookWaterGrams={vm.cookWaterGrams}
                dilutionMode={dilutionMode}
                onDilutionModeChange={setDilutionMode}
                waterPasteRatio={waterPasteRatio}
                onWaterPasteRatioChange={setWaterPasteRatio}
                gradualWaterGrams={settings.gradualWaterGrams}
                onGradualWaterChange={(value) =>
                  setSettings({ ...settings, gradualWaterGrams: value })
                }
                measuredPasteGrams={measuredPasteGrams}
                dilutionScope={dilutionScope}
                onDilutionScopeChange={setDilutionScope}
                targetMl={portionTargetMl}
                onTargetMlChange={setPortionTargetMl}
                onMeasuredPasteGramsChange={setMeasuredPasteGrams}
                wholeBatchPasteGrams={vm.wholeBatchPasteGrams}
              />
            )}
            {/* PLACEMENT IS A LAYOUT DECISION, NOT A CORRECTNESS ONE — and the layout
                reason is the good one, so read it before moving this.

                Directly below Dilution so the snippet's "≈ Finished product (whole batch)"
                row lands immediately under Dilution's own "Finished solution" figure. They
                are the same number, and it is the number the dose is a percentage OF, so a
                maker reads dose against basis in one glance.

                What is NOT the reason: correctness. This was moved beside Additives on
                2026-08-09 and moved back the next day — every test passed and it rendered
                fine two columns away, because `basisScope` makes the base row NAME its own
                scope ("whole batch" / "custom amount") rather than inheriting meaning from
                the toggle it sits under. So do not keep this here believing the arithmetic
                depends on it; keep it here because the two figures line up.

                Replaces the old static Preserve panel: the snippet carries the same need
                logic AND the dose it used to defer to "your supplier". */}
            {processOffers(process, 'preserve') && (
              <PreservativeSnippet
                finishedGrams={preservativeBaseGrams}
                basisScope={dilutionScope}
                weightUnit={weightUnit}
                preservativeId={settings.preservativeId}
                onPreservativeIdChange={(preservativeId) =>
                  setSettings((s) => ({ ...s, preservativeId, preservativeSetByUser: true }))
                }
                preservativeCustomName={settings.preservativeCustomName}
                onPreservativeCustomNameChange={(preservativeCustomName) =>
                  setSettings((s) => ({ ...s, preservativeCustomName, preservativeSetByUser: true }))
                }
                dosePct={settings.preservativeDosePct}
                onDosePctChange={(preservativeDosePct) =>
                  setSettings((s) => ({ ...s, preservativeDosePct, preservativeSetByUser: true }))
                }
              />
            )}
            {processOffers(process, 'neutralize') && vm.neutralization && (
              <NeutralizePanel neutralization={vm.neutralization} weightUnit={weightUnit} />
            )}
          </div>

          {/* Column 3 — The Bar: how the blend behaves, plus guidance. */}
          <div className="col col--bar col--tinted">
            <PropertiesPanel
              result={vm.properties}
              indexes={vm.indexes}
              modeledOilIds={vm.fattyAcids.modeledOilIds}
              process={process}
            />
            <FattyAcidPanel result={vm.fattyAcids} />
            <FormulationInsightsPanel insights={vm.insights} />
            <ProcessGuidePanel
              process={process}
              processVariant={settings.processVariant}
              lsMethod={vm.lsMethod}
              ls30Min={vm.ls30Min}
            />
            <TroubleshootingPanel process={process} />
          </div>
        </main>
      ) : (
        /* Pricing view: the pricing calculator beside the batch figures it prices. */
        <main
          className="layout no-print"
          id="view-panel"
          role="tabpanel"
          aria-labelledby={`view-tab-${view}`}
          tabIndex={0}
        >
          <div className="col col--numbers col--tinted">{resultsPanel}</div>
          <div className="col">{pricingPanel}</div>
        </main>
      )}

      <footer className="footer no-print">
        <p>
          SAP from public FNWL chart with ISO 3657 conversion. Always verify with batch testing.
        </p>
      </footer>

      <BatchSheet data={vm.batchSheetData} />
    </div>
  );
}
