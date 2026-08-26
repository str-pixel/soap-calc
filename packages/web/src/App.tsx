import { useRef, useState, useEffect, useMemo, type KeyboardEvent } from 'react';
import { ActionsMenu } from './components/ActionsMenu';
import { AdditivesPanel } from './components/AdditivesPanel';
import { BatchSheet } from './components/BatchSheet';
import { CpExtrasPanel } from './components/CpExtrasPanel';
import { DilutionPanel, type DilutionScope } from './components/DilutionPanel';
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
import { computeBottledSolutionGrams, preservativeDosingBasisGramsFor } from './lib/calculateAdditives';
import { convertBarWeightBetweenUnits } from './lib/moldSizer';
import { loadMoldSizerInput, saveMoldSizerInput } from './lib/moldSizerStorage';
import { correctedDilutionWaterGrams } from './lib/measuredPaste';
import type { PricingProfile } from './lib/pricingProfile';
import { loadPricingProfile, savePricingProfile } from './lib/pricingStorage';
import { processOffers } from './lib/process';
import { buildRecipePricingContext } from './lib/recipePricing';
import { resolveDilution } from './lib/resolveDilution';

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
  // Gradual dilution of a single jar: the paste the maker weighed out of the stored batch,
  // and the water they have poured into it so far. Session-local like portionTargetMl and
  // measuredPasteGrams beside it — bench figures describing one jar on one day, which must
  // not dirty a saved or exported recipe. Deliberately NOT the same as settings'
  // gradualWaterGrams: that one records the WHOLE BATCH's dilution and is recipe state,
  // because the batch is the recipe. A jar diluted thinner has not redefined it.
  const [portionPasteGrams, setPortionPasteGrams] = useState('');
  const [portionWaterGrams, setPortionWaterGrams] = useState('');
  // Always the whole batch's paste.
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
  // reloads the OTHER process's own draft via loadWorkspace → loadDraftSlot → JSON.parse,
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
  // THERE IS NO DILUTION MODE ANY MORE, and this is where two pieces of session state and a
  // sixty-line restore effect used to live (spec §5, and the deletion Phase 2a exists to
  // make). `dilutionMode` and `waterPasteRatio` were session-local choices about HOW to
  // arrive at settings.soapConcentrationPercent, and the effect below them restored Gradual
  // whenever a recipe carrying a water record arrived — because that record had nowhere to
  // appear otherwise, the field being off screen in the other two modes.
  //
  // All three are answered structurally now: the panel holds one plan field and one record
  // field, both always on screen in whole-batch scope, and which of them GOVERNS is
  // resolveDilution's answer to the recipe's own data (spec §1). A record arriving with a
  // recipe therefore appears the moment the recipe does, with no session state to restore it
  // into and nothing to fight a maker who chose otherwise — the tab-switch round trips
  // `gradualModeChoiceRef` existed to arbitrate cannot happen, because there is no mode for
  // an arrival to impose. `settings.gradualWaterGrams` remains recipe state, as it always
  // was.
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
  //
  // A RECORDED JAR IS ITS OWN JAR, and dosing it through portionDilutionFor was the worst
  // version of this bug rather than a variant of it. That resolution sizes a jar from
  // "Amount to make (ml)", which is the input a recorded jar replaces. So a maker who
  // recorded a 1,300 g jar was told to weigh in 21 g of preservative: 1.6% of what they
  // actually made, past the EU ceiling for several listed products, in the one place built to
  // keep the dose on the mass that really exists. And with the amount blank — the normal
  // state for a maker who is recording rather than sizing — there was no dose at all, under a
  // hint asking for a control that is not on screen. `resolveDilution`'s `scope: 'portion'`
  // arm is the panel's OWN resolution of the jar (spec §1's scope parameter absorbed what used
  // to be DilutionPanel.tsx's `portionGradualFor`), called here with the identical arguments
  // the panel itself passes, for the same reason `portionDilutionFor` below is imported rather
  // than re-derived: the dose and the figures beside it cannot then disagree about whether a
  // jar exists or what it weighs.
  //
  // THE GATE IS THE JAR'S OWN RECORD, not a mode (spec §4's conversion rule) — and it is
  // `resolved.governs === 'record'`, the same verdict the panel's `portionJarGoverns` reads
  // (both are literally `resolveDilution`'s own `governs`, read off the identical call — see
  // that module's doc: "governs" IS "hasBothFigures" in portion scope, not a second predicate
  // beside it). The two are NOT the same test as `resolved.record` truthiness: `record` is
  // also null when both figures are present but the paste weighed out is heavier than the
  // whole batch's own paste (`resolved.jar.pasteExceedsBatch`), and there the panel does not
  // fall through to plan sizing either — it stands the grid down (`portionJarGoverns` is
  // `governs === 'record'`, not `record !== null`) and shows no jar figure, because the paste
  // reading it would size from is refused. Keying this branch on `record` alone used to fall
  // through to `portionDilutionFor` in exactly that state: a paste heavier than the batch with
  // a stale "Amount to make (ml)" still on screen dosed a plan-sized portion while the panel
  // rendered neither the plan grid nor a jar — a mass nowhere on screen. Reading `governs`
  // here too means the dose, the figures and the suppression move together because all three
  // are read off the SAME verdict, resolveDilution's own, rather than this branch re-deriving
  // its own test from `record` truthiness. Falling through to plan sizing is portion scope's
  // own precedence only when the jar does not govern (spec §2: jar record with both figures →
  // jar; else plan sizing), and it is what the mode gate could not express: choosing Gradual
  // with the two fields empty used to mean "no dose at all".
  // Returns the mass AND the scope that mass is actually in — never the scope the toggle
  // is set to. A Custom amount larger than the batch CLAMPS to the whole batch, and the
  // panel says so twice ("more than the batch holds", "100% of the batch"); labelling the
  // dose basis "(custom amount)" one line below contradicted both. The figure was right and
  // the name was not, which is the same failure the basisScope prop was added to prevent,
  // wearing the opposite face: `finishedGrams` and `basisScope` must move together.
  const preservativeBasis = useMemo((): { grams: number | null; scope: DilutionScope } => {
    if (dilutionScope !== 'portion') return { grams: vm.preservativeDosingBasisGrams, scope: 'batch' };
    if (!vm.dilution) return { grams: null, scope: 'portion' };
    const resolved = resolveDilution({
      dilution: vm.dilution,
      gradualWaterGrams: '',
      anhydrousGrams: vm.dilution.anhydrousGrams,
      wholeBatchPasteGrams: vm.wholeBatchPasteGrams,
      cookWaterGrams: vm.cookWaterGrams,
      // The jar is a share of the pot the maker WEIGHED when there is a reading for it,
      // exactly as the panel's own readout is — the same argument as passing it to
      // portionDilutionFor below. Omitted, this dosed a jar sized from the recipe's
      // prediction while the figure beside it on screen came off the scale.
      measuredPasteGrams,
      scope: 'portion',
      jar: { pasteGrams: portionPasteGrams, waterGrams: portionWaterGrams },
    });
    if (resolved.governs === 'record') {
      // `record` is null exactly when the jar governs but nothing can be shown for it — the
      // paste-exceeds-batch refusal (or its sibling, no batch paste to be a share of) — the
      // panel's OWN suppression predicate (`portionJarGoverns`) fires here too, standing the
      // plan grid down and printing no jar figure. Falling through to `portionDilutionFor` in
      // that state dosed the PLAN's sizing portion off a stale "Amount to make (ml)" while the
      // screen showed neither the grid nor a jar — see this function's own comment above for
      // the reading that exposed it.
      return { grams: resolved.record?.finishedGrams ?? null, scope: 'portion' };
    }
    const { portion } = portionDilutionFor({
      dilution: vm.dilution,
      targetMl: portionTargetMl,
      measuredPasteGrams,
      wholeBatchPasteGrams: vm.wholeBatchPasteGrams,
      cookWaterGrams: vm.cookWaterGrams,
    });
    return {
      grams: portion?.solutionGrams ?? null,
      // core sets `clamped` when more was asked for than the batch holds and then hands back
      // the batch's own figures — so this IS the whole batch, and the label says so.
      scope: portion?.clamped ? 'batch' : 'portion',
    };
  }, [
    dilutionScope,
    measuredPasteGrams,
    portionPasteGrams,
    portionTargetMl,
    portionWaterGrams,
    vm.cookWaterGrams,
    vm.dilution,
    vm.preservativeDosingBasisGrams,
    vm.wholeBatchPasteGrams,
  ]);

  // THE MID-POUR COMPANION DOSE (spec §3, phase 2b task 1) — the safety item this phase
  // exists to deliver first. While a record governs and its water is still below the
  // plan's own dilution water, the preservative snippet shows a SECOND, plan-labelled
  // figure beside the governing dose, so a maker who weighs the preservative against the
  // batch that exists today (a partial pour, or none at all) is not left unaware that the
  // same batch needs more once diluted on to the plan (26.3 g at 0 g poured vs 40.4 g at a
  // 30% plan on the reference batch — spec §3's own illustration of the invisible
  // under-dose this line exists to prevent).
  //
  // BOTH FIGURES BELOW ARE THE PLAN ARM AS THE SCREEN ITSELF SHOWS IT — the controller
  // ruling (a Phase 2b review finding): "the plan's dilution water" means the figure the
  // panel's own "(plan)" row prints, not the bare, unmeasured `dilution.dilutionWaterGrams`.
  // A weighed pot lighter than the recipe's own computed one (evaporation) corrects that
  // row's water UPWARD — probe-confirmed: 1,400 g weighed pot against a 1,667 g computed
  // one moves the plan row from 2,407 g to 2,674 g — and a record between those two
  // boundaries (2,500 g) is still short of the row the maker is looking at, even though it
  // already clears the raw figure this memo used to compare against. Comparing against the
  // raw figure stranded the companion for exactly that evaporation window.
  //
  // `correctedPlanWaterGrams` below is `correctedDilutionWaterGrams` called with the IDENTICAL
  // arguments DilutionPanel's own plan row uses (DilutionPanel.tsx's `batchDilutionWaterGrams`,
  // "Dilution water to add (plan)") — shared derivation, never re-derived with different
  // args, which is the exact drift shape this project kills.
  //
  // The dosing basis is the plan-arm figure `preservativeDosingBasisGramsFor` would hand the
  // snippet if the plan governed — bottled, extras-net — not the bare `dilution.solutionGrams`
  // this memo used to return: a solution-dosed additive or a split liquid moves the bottled
  // figure away from the bare solution, and the companion's basis has to be the one the
  // plan-governed snippet would actually dose against. `computeBottledSolutionGrams` is
  // called with `record: null` to force the plan arm regardless of which arm actually
  // governs today — the same "plan arm, unconditionally" contract `vm.dilution` itself
  // carries per the paragraph above.
  //
  // Non-null exactly when App decides the companion belongs on screen (batch scope only —
  // Custom amount's own dose is the snippet's problem, same precedent as `preservativeBasis`
  // above): a record governs, that record actually resolved to figures (not the `null`
  // "nothing to show yet" state 2a's own contract reserves), and the record's own water is
  // STRICTLY below the plan row's own (corrected) water (the controller ruling: at or past
  // it the two doses coincide within rounding and the companion is noise, not signal).
  const planDosingBasisGrams = useMemo((): number | null => {
    if (dilutionScope !== 'batch') return null;
    if (vm.dilutionGoverns !== 'record') return null;
    if (vm.dilutionRecord === null || vm.dilution === null) return null;
    const correctedPlanWaterGrams = correctedDilutionWaterGrams(
      vm.dilution,
      measuredPasteGrams,
      vm.wholeBatchPasteGrams,
      vm.cookWaterGrams,
    );
    if (!(vm.dilutionRecord.waterGrams < correctedPlanWaterGrams)) return null;
    const planBottledSolutionGrams = computeBottledSolutionGrams({
      dilution: vm.dilution,
      cookWaterGrams: vm.cookWaterGrams,
      extrasGrams: vm.extrasGrams,
      splitLiquidPasteWaterGrams: vm.splitLiquidPasteWater,
      measuredPasteGrams,
      wholeBatchPasteGrams: vm.wholeBatchPasteGrams,
      record: null,
    });
    return preservativeDosingBasisGramsFor(planBottledSolutionGrams, vm.dilution);
  }, [
    dilutionScope,
    vm.dilution,
    vm.dilutionGoverns,
    vm.dilutionRecord,
    measuredPasteGrams,
    vm.wholeBatchPasteGrams,
    vm.cookWaterGrams,
    vm.extrasGrams,
    vm.splitLiquidPasteWater,
  ]);

  // The dose alone, in grams — App threads this to the panel and the sheet so the MASS they
  // add to what bottles, prints and prices matches what the vm resolved for the whole batch
  // (batch scope; Custom amount's own dose stays the snippet's problem, not this prop's —
  // see preservativeBasis above for why the two scopes cannot share a mass). Derived by
  // differencing the vm's two batch-scope fields rather than re-testing the snippet's tier
  // predicate here: vm.finishedProductGrams is exactly
  // preservativeDosingBasisGrams + max(0, dose), so the subtraction recovers the dose OR
  // zero (when the tier refuses one) without a second copy of that gate (see
  // useRecipeViewModel's own comment on it). In batch scope this EQUALS the snippet's own
  // "Preservative to add" figure exactly: both start from preservativeDosingBasisGrams and
  // both refuse a dose on the same two tiers ('none', 'impossible') — one basis, one
  // predicate, so the screen and the mass cannot disagree about whether a dose exists. It
  // is deliberately NOT gated on preservativeSetByUser: the seeded default is the app's
  // recommendation for a water-based product and weighs what the snippet says it does,
  // chosen or not. Gating it once produced two finished masses under one name. Both vm
  // fields are null together outside LS / before a dilution exists, hence 0.
  const preservativeDoseGramsValue =
    vm.finishedProductGrams !== null && vm.preservativeDosingBasisGrams !== null
      ? vm.finishedProductGrams - vm.preservativeDosingBasisGrams
      : 0;

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

        {/* THE RECIPE NAME, out of the masthead's right-hand stack. It was Archivo 700 at
            1.25rem, right-aligned directly beneath the right-aligned tagline — two similar
            Archivo lines stacking into one ambiguous block, at a size that is not a step in
            the type scale. Left-aligned under its own micro-label now, at a size that is.

            aria-label keeps the spoken name "Recipe name" while the visible antecedent
            reads "Recipe": Label-in-Name (WCAG 2.5.3) wants the accessible name to CONTAIN
            the visible text, which it does. Same pattern as PricingPanel's "Price per". */}
        <label className="recipe-name">
          <span className="micro-label">Recipe</span>
          <input
            type="text"
            className="input recipe-toolbar__name-input"
            aria-label="Recipe name"
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            placeholder="Recipe name"
          />
        </label>
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
                gradualWaterGrams={settings.gradualWaterGrams}
                onGradualWaterChange={(value) =>
                  setSettings({ ...settings, gradualWaterGrams: value })
                }
                measuredPasteGrams={measuredPasteGrams}
                dilutionScope={dilutionScope}
                onDilutionScopeChange={setDilutionScope}
                targetMl={portionTargetMl}
                onTargetMlChange={setPortionTargetMl}
                portionPasteGrams={portionPasteGrams}
                onPortionPasteChange={setPortionPasteGrams}
                portionWaterGrams={portionWaterGrams}
                onPortionWaterChange={setPortionWaterGrams}
                /* The preservative dose lives INSIDE this panel now, not beside it. Passed as
                   a node so DilutionPanel places it without learning what a preservative is;
                   the wiring stays here, where the settings it writes already live. The
                   adjacency matters because the dose is a % of the finished mass the panel
                   computes — it was a layout convention until this, and it was lost once
                   already when the snippet was moved to sit with Additives. */
                preservativeSlot={
                  processOffers(process, 'preserve') ? (
                    <PreservativeSnippet
                      finishedGrams={preservativeBasis.grams}
                      planDosingBasisGrams={planDosingBasisGrams}
                      basisScope={preservativeBasis.scope}
                      /* Moves with preservativeBasis' own jar branch above: the two answer
                         one question (which jar, and how the maker described it), so the
                         empty state asks for the fields that actually resolve it. The mode
                         that used to answer it is gone, and both jar fields are on the Custom
                         amount screen — so what says "this maker is RECORDING a jar" is that
                         they have started one. With both fields untouched the maker is
                         sizing, and the ask names "Amount to make" as it always did. */
                      portionIsRecorded={
                        portionPasteGrams.trim() !== '' || portionWaterGrams.trim() !== ''
                      }
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
                  ) : null
                }
                onMeasuredPasteGramsChange={setMeasuredPasteGrams}
                wholeBatchPasteGrams={vm.wholeBatchPasteGrams}
                preservativeDoseGrams={preservativeDoseGramsValue}
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
