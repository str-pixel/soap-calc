# Slice 4 — Definition Reads + Façade Retirement (Arc Closer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The view model and panels gate on the process definition's declared capabilities instead of raw `process === 'x'` literals; the `processProfile.ts` façade is retired (retirement IS the enforcement — the repo has no lint infra); and the six deferrables accumulated in #150/#151 ledgers are cleared.

**Architecture:** Spec Slice 4, the arc's final slice. `PanelKey` grows to describe what each process ACTUALLY mounts today (verified against App.tsx: cp additionally mounts `CpExtrasPanel`, ls additionally mounts `NeutralizePanel`, hp gates a vessel input in SettingsPanel) — the declarations are corrected to the truth FIRST, pinned by test, then readers convert. The slice-2 golden (`processVariants.golden.test.ts`) stays the behaviour referee; its import is repointed in Task 4 as that task's ONE permitted golden edit (its façade-proving role completed when Slice 2 merged).

**Tech Stack:** TypeScript, vitest, Playwright. All commands from repo root unless stated; build MUST run from repo root.

## Global Constraints

- Comments state constraints code can't show; no book/brand names; message strings byte-identical (the Slice 3 insights golden — `insights.golden.test.ts` + fixture — must pass UNTOUCHED through every task).
- New tests must fail when their guard is reverted (mutation check), except goldens.
- Verify-then-write applies to the implementers too: every identifier in this plan was grepped on 2026-07-31; if the file has drifted, trust the file and say so in the report.
- Full gate before the PR: `npm test`; `npm run build --workspace packages/web` FROM REPO ROOT; `cd packages/web && npx playwright test`.

---

### Task 1: Clear the core test debt (#151 deferrables)

**Files:**
- Modify: `packages/core/src/insights.ts` (helper rename + share; no behaviour change)
- Modify: `packages/core/src/insights.test.ts` (registry suite fixes)
- Modify: `packages/core/src/index.ts:8` (barrel surgery)

**Interfaces:**
- Produces: `isCoconutHeavy(input)` (renamed from `isCoconutHeavyLS`); barrel exports for insights become the named public trio. Nothing else changes shape.

- [ ] **Step 1: Route the registry probes through `analyzeFormulation`** — in `insights.test.ts` (~:1059-1073, the per-rule probe `it`), replace the direct `rule.check(input, params)` call with the reviewer-validated form (mutation-proven to catch a wrong `processes:` gate):

```ts
expect(
  analyzeFormulation(input).some((i) => i.code === rule.code),
  `rule "${rule.code}" did not fire on its probe`,
).toBe(true);
```

(The probe inputs already carry the right `process` for each rule — they were built per-rule. If any probe fails after the swap, the probe's `process` is wrong for its rule's gate; fix the probe's process, never the gate.)

- [ ] **Step 2: Tighten the count test** (~:918-923): rename the first `it` to `'declares 36 unique codes'`, delete its stale driving-comment, and add `expect(declared).toHaveLength(36);` above the Set-size assertion (catches a 37th rule reusing an existing code).

- [ ] **Step 3: Mutation checks** — (a) temporarily set one rule's `processes:` wrong (e.g. `superfat_out_of_band` → `['ls']`): the routed probe suite MUST fail; restore. (b) Temporarily duplicate one rule entry: `toHaveLength(36)` MUST fail; restore.

- [ ] **Step 4: Rename + share the coconut helper** — `insights.ts:154` `isCoconutHeavyLS` → `isCoconutHeavy`; delete its "does not re-check process" caveat sentence and replace with: `// Process-invariant: callers gate by their own processes: declaration.` Then replace `hp_vessel_too_small`'s inline duplicate (the `sumFattyAcids(..., lauricMyristic)` computation around :925) with a call to `isCoconutHeavy(input)` — read the inline version first; if its threshold or coverage guard differs in ANY way from the helper, STOP and report (they were reviewed as exact duplicates; drift means the premise broke).

- [ ] **Step 5: Barrel surgery** — `packages/core/src/index.ts:8`: replace `export * from './insights.js';` with:

```ts
// Named, not `export *`: INSIGHT_RULES / resolveInsightParams are exported by the module
// for its consistency test only (see their doc comments) and are not package API.
export { analyzeFormulation } from './insights.js';
export type {
  FormulationAnalysisInput,
  FormulationInsight,
  FormulationInsightLevel,
} from './insights.js';
```

Verified blast radius: web imports only `analyzeFormulation` (useFormulationInsights.ts:2-13 block) and `type FormulationInsight` (FormulationInsightsPanel.tsx:2) from the barrel; core's own tests import './insights.js' directly. `npm test` (typecheck) is the proof.

- [ ] **Step 6: Gates + commit** — insights golden UNTOUCHED (`git diff --stat` empty on the pair); `npx vitest run packages/core/src/insights.test.ts packages/core/src/insights.golden.test.ts` green; `npm test` green. Commit: `test(core): registry probes go through analyzeFormulation; shared coconut helper; named insight exports`

### Task 2: Canary persistence-reload coverage (#150 deferred blind spot)

**Files:**
- Modify: `packages/web/e2e/process-isolation.spec.ts` (cycle test only)

- [ ] **Step 1: Add a reload between write and assert** — after the first (write) loop and its final blur, insert:

```ts
// A leak in the PERSISTENCE layer (workspace saved under the wrong storage key) survives
// in-memory checks — only a reload forces every workspace back through storage.
await page.reload();
```

The assertion loop after it is unchanged — every per-tab value (name, weight, additive name+amount, counts, superfat default) must now survive a full storage round-trip. NOTE the autosave debounce: the write loop's last edit must be flushed before reload — switch to any other tab once BEFORE reloading (tab switches flush synchronously; the existing loop already ends having switched through all tabs, but confirm the LAST edit was followed by a tab switch or add one explicit `processTab(page, /Cold process/).click()` before the reload).

- [ ] **Step 2: Run (2/2), strength-check** (temporarily assert a wrong post-reload name → must fail → restore), full e2e green. Commit: `test(e2e): canary survives a storage round-trip — persistence-key leaks now covered`

### Task 3: Panels and view model read the definition's capabilities

**Files:**
- Modify: `packages/web/src/lib/process.ts` (PanelKey + panels corrections + one helper)
- Modify: `packages/web/src/lib/process.test.ts` (pin the corrected declarations)
- Modify: `packages/web/src/App.tsx:425,434,450,454` (4 mounting literals)
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts:182,281,321,448,564` (5 gate literals)
- Modify: `packages/web/src/components/SettingsPanel.tsx:159` (vessel input gate)

**Interfaces:**
- Produces: `PanelKey = 'moldCure' | 'postCook' | 'dilution' | 'neutralize' | 'preserve' | 'cpExtras' | 'hpVessel'`; `export function processOffersPanel(process: ProcessId, panel: PanelKey): boolean`. Task 4 does not depend on these; they are the slice's spec deliverable.

- [ ] **Step 1: Correct the declarations to today's truth, test-first.** The `panels` lists are INCOMPLETE against what App.tsx actually mounts (verified: cp also mounts CpExtrasPanel at :425; ls also mounts NeutralizePanel at :450; hp gates a vessel input at SettingsPanel:159). Append to `process.test.ts`:

```ts
describe('panel capability declarations (slice 4)', () => {
  it('declares exactly what each process mounts', () => {
    expect(PROCESS_DEFINITIONS.cp.panels).toEqual(['moldCure', 'cpExtras']);
    expect(PROCESS_DEFINITIONS.hp.panels).toEqual(['moldCure', 'postCook', 'hpVessel']);
    expect(PROCESS_DEFINITIONS.ls.panels).toEqual(['dilution', 'neutralize', 'preserve']);
  });
});
```

Run → FAIL. Extend `PanelKey` and the three `panels:` arrays to match. Run → PASS.

- [ ] **Step 2: Add the reader** in `process.ts` beside the other lookups:

```ts
/** The single gate for process-conditional mounting/computation of a declared panel
 * capability. Readers use this instead of `process === 'x'` so the offer (the definition)
 * and the behaviour (mount/memo) cannot diverge — the arc's founding invariant. */
export function processOffersPanel(process: ProcessId, panel: PanelKey): boolean {
  return PROCESS_DEFINITIONS[process].panels.includes(panel);
}
```

- [ ] **Step 3: Convert the readers.** Exact swaps (keep surrounding logic identical):
  - App.tsx:425 `process === 'cp' &&` → `processOffersPanel(process, 'cpExtras') &&`
  - App.tsx:434 (DilutionPanel) → `processOffersPanel(process, 'dilution') &&`
  - App.tsx:450 (NeutralizePanel) → `processOffersPanel(process, 'neutralize') && vm.neutralization &&`
  - App.tsx:454 (PreservePanel) → `processOffersPanel(process, 'preserve') &&`
  - useRecipeViewModel.ts:281 and :321 `process === 'ls' && result` → `processOffersPanel(process, 'dilution') && result` / `processOffersPanel(process, 'neutralize') && result`
  - useRecipeViewModel.ts:182 `process !== 'cp' &&` → `processOffersPanel(process, 'postCook') &&`
  - useRecipeViewModel.ts:448 `process === 'cp' ? null : …` → `processOffersPanel(process, 'postCook') ? … : null` (NOTE the inversion — preserve exact semantics: today cp yields null, hp/ls compute; the new form must compute exactly for hp/ls)
  - useRecipeViewModel.ts:564 `if (process !== 'hp') return undefined;` → `if (!processOffersPanel(process, 'hpVessel')) return undefined;`
  - SettingsPanel.tsx:159 `process === 'hp' &&` → `processOffersPanel(process, 'hpVessel') &&`
  (Import `processOffersPanel` from `../lib/process` / `./lib/process` as each file's existing import path style dictates. Literals NOT in this list — copy/steps/labels in recipeSummary, AdditivesPanel PROCESS_LABELS, etc. — are process-shaped CONTENT, not offer/behaviour gates; they stay. Say this in your report if a reviewer asks.)

- [ ] **Step 4: Gates.** BOTH goldens untouched-and-green (slice-2 variants golden + slice-3 insights golden); `npm test` green; e2e green INCLUDING the strengthened canary. Mutation check: temporarily remove `'neutralize'` from ls panels → the LS neutralization memo must stop computing and a unit or e2e assertion must fail (if nothing fails, STOP: find the covering test — `useRecipeViewModel.test.tsx` has neutralization assertions — and report which caught it); restore.

- [ ] **Step 5: Commit** — `refactor(web): panels and view model gate on declared capabilities (slice 4)`

### Task 4: Retire the façade

**Files:**
- Delete: `packages/web/src/lib/processProfile.ts`
- Rename: `packages/web/src/lib/processProfile.test.ts` → `packages/web/src/lib/processDefinitions.test.ts` (content survives; only its imports repoint)
- Modify (import path swap ONLY, `'./processProfile'`/`'../lib/processProfile'` → `'./process'`/`'../lib/process'` — the façade re-exported everything from process.ts by name, so this is name-preserving by construction): `packages/web/src/components/SoapingTemperaturePanel.tsx`, `ProcessTabs.tsx`, `ProcessGuidePanel.tsx`, `packages/web/src/hooks/useFormulationInsights.ts`, `useRecipeViewModel.ts`, `useRecipeViewModel.test.tsx`, `packages/web/src/lib/cureEstimate.ts`, `cureEstimate.test.ts`, `recipe.ts`, `recipe.test.ts`, `processVariants.golden.test.ts`

**The golden edit, justified:** `processVariants.golden.test.ts` imports from `'./processProfile'` because in Slice 2 that PROVED the façade. The façade's job is done; the retirement makes the import repoint the file's ONLY change — `git diff` on it must show exactly the one import line. Its assertions and data are untouched and must stay green.

- [ ] **Step 1: Repoint all 11 files** (mechanical path swap; merge into existing `'./process'` imports where one already exists in the file — e.g. useFormulationInsights.ts:15-16 currently imports from both).
- [ ] **Step 2: Delete `processProfile.ts`; rename its test file.**
- [ ] **Step 3: Prove retirement** — `grep -rn "processProfile" packages/web/src --include="*.ts" --include="*.tsx"` → the ONLY acceptable hits are inside comments that narrate history (rewrite any that now mislead; a comment saying "see processProfile.ts" must die with the file).
- [ ] **Step 4: Gates** — both goldens green (variants golden: only the import line changed); `npm test`; build FROM ROOT; full e2e. Commit: `refactor(web): retire the processProfile facade — definitions are the only home (slice 4, arc complete)`

---

## After Task 4

Full gate, push `feat/slice4-definition-reads`, PR marking the SPEC COMPLETE, adversarial whole-branch review (most capable model) with explicit instruction to run the CLAIMS-AUDIT over the PR body against the merge head before approving. Merge closes the arc; update the arc memory to COMPLETE.
