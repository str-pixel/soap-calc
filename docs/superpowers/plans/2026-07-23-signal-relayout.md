# Signal Re-layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-arrange the Recipe view to the "Soap Calc.dc.html" comp — inputs left, The Bar tinted middle, The Numbers right — with a Superfat & water panel, a Radar/Bars toggle, an Actions menu, and cleaned-up panel numbering, without regressing any existing feature.

**Architecture:** Extract the Superfat/Water knobs out of `ResultsPanel` into a new left-column `SuperfatWaterPanel`; add a view toggle inside `PropertiesPanel`; replace the four toolbar buttons with a new `ActionsMenu`; then re-order/re-tint the three layout columns in `App.tsx` + `index.css`. DOM column order stays `formula → numbers → bar`; a `min-width` media query swaps The Bar ahead of The Numbers only when 3 columns fit, so small screens keep the lye/water figures directly under the inputs.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library (unit), Playwright (e2e). Styling is hand-written CSS in `packages/web/src/index.css` (the Signal design system — no CSS framework, no CSS-in-JS).

## Global Constraints

- **Preserve every existing feature.** The comp omits, but this work must NOT delete: HP CP-extras, LS dilution / neutralize / preserve, troubleshooting, mold sizer, split liquid, dual-lye, post-cook superfat.
- **No new colors or tokens.** The palette is already shared; use existing `--*` vars only.
- **Sentence case** in prose and field labels. UPPERCASE is a CSS typographic treatment (`text-transform`), never baked into copy strings.
- **No emoji. No exclamation marks.** Middle dots (`·`) chain figures.
- **Radius/shadow stay zero** except the already-rounded exceptions (pill chips, InfoTip trigger, slider thumbs/meter dots).
- **TDD, frequent commits.** One deliverable per task; write the failing test first.
- **Commands** (run from `packages/web/`):
  - Typecheck: `npm run typecheck`
  - One unit file: `npx vitest run src/components/<File>.test.tsx`
  - All unit tests: `npm test`
  - e2e: `npm run test:e2e`
  - Production build: `npm run build`
- Work on branch `feat/signal-relayout` (already checked out; spec committed at `ee9cfe4`).

---

### Task 1: Extract `SuperfatWaterPanel`

Move the editable Superfat slider + Water-method select + Water slider out of `ResultsPanel` into a new left-column panel. Renumber Results `03`→`04`. Update the SettingsPanel subtitle.

**Files:**
- Create: `packages/web/src/components/SuperfatWaterPanel.tsx`
- Test: `packages/web/src/components/SuperfatWaterPanel.test.tsx`
- Modify: `packages/web/src/components/ResultsPanel.tsx`
- Modify: `packages/web/src/components/ResultsPanel.test.tsx`
- Modify: `packages/web/src/components/SettingsPanel.tsx:88-91`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Produces: `SuperfatWaterPanel({ settings: RecipeSettings, setSettings: Dispatch<SetStateAction<RecipeSettings>>, process: ProcessId })` — a `<section className="panel">` titled "Superfat & water" containing the superfat slider, water-method `<select aria-label="Water method">`, and the mode-dependent water slider.
- Produces: `ResultsPanel` no longer accepts `settings`/`setSettings` props.

- [ ] **Step 1: Write the failing test** — `packages/web/src/components/SuperfatWaterPanel.test.tsx`

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { SuperfatWaterPanel } from './SuperfatWaterPanel';
import { DEFAULT_SETTINGS, type RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function Harness({ process = 'cp' as ProcessId }: { process?: ProcessId } = {}) {
  const [settings, setSettings] = useState<RecipeSettings>(DEFAULT_SETTINGS);
  return <SuperfatWaterPanel settings={settings} setSettings={setSettings} process={process} />;
}

test('renders the Superfat & water panel heading', () => {
  render(<Harness />);
  expect(screen.getByRole('heading', { name: 'Superfat & water' })).toBeTruthy();
});

test('editing the Superfat field updates settings state', () => {
  render(<Harness />);
  const input = screen.getByLabelText('Superfat %') as HTMLInputElement;
  expect(input.value).toBe('5');
  fireEvent.change(input, { target: { value: '8' } });
  expect((screen.getByLabelText('Superfat %') as HTMLInputElement).value).toBe('8');
});

test('Superfat allows a negative min only for LS', () => {
  const { rerender } = render(<Harness process="cp" />);
  expect(screen.getByLabelText('Superfat %').getAttribute('min')).toBe('0');
  rerender(<Harness process="ls" />);
  expect(screen.getByLabelText('Superfat %').getAttribute('min')).toBe('-5');
});

test('changing the water method swaps the editable water-ratio field', () => {
  render(<Harness />);
  expect(screen.getByLabelText('Water % of oils')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Water method'), { target: { value: 'lye_concentration' } });
  expect(screen.getByLabelText('Lye concentration %')).toBeTruthy();
  expect(screen.queryByLabelText('Water % of oils')).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/SuperfatWaterPanel.test.tsx`
Expected: FAIL — "Failed to resolve import './SuperfatWaterPanel'".

- [ ] **Step 3: Create the component** — `packages/web/src/components/SuperfatWaterPanel.tsx`

```tsx
import type { Dispatch, SetStateAction } from 'react';
import type { WaterMode } from '@soap-calc/core';
import type { RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';
import { NEG_SUPERFAT_FLOOR } from '../lib/parseRecipeSettings';
import { WATER_FIELDS, WATER_MODE_LABELS, waterModeChoicesFor } from '../lib/settingsFields';
import { InfoTip } from './InfoTip';

// Upper bound for each water mode's drag slider — the typical working range, not the hard
// input cap. The editable value readout keeps the field's real min/max, so out-of-range
// values (and their validation) are still reachable by typing.
const WATER_SLIDER_MAX: Record<WaterMode, number> = {
  percent_of_oils: 100,
  lye_concentration: 50,
  lye_water_ratio: 5,
};

/**
 * A Signal-styled range slider with an editable value readout on the right. The readout is
 * the source of truth for precise/out-of-range entry (and carries the field's aria-label so
 * existing tests and validation keep working); the slider is the quick-adjust affordance and
 * is bound to the same value. The filled portion of the track is painted via an inline
 * gradient so the accent "fill-to-thumb" look works cross-browser without JS.
 */
function SliderField({
  label,
  valueLabel,
  unit,
  min,
  max,
  step,
  sliderMax,
  value,
  onChange,
  help,
  term,
}: {
  label: string;
  valueLabel: string;
  unit: string;
  min: number;
  max?: number;
  step: number;
  sliderMax: number;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  term?: string;
}) {
  const num = Number(value);
  const finite = value.trim() !== '' && Number.isFinite(num);
  const lo = finite ? Math.min(min, num) : min;
  const hi = finite ? Math.max(sliderMax, num) : sliderMax;
  const pos = finite ? num : min;
  const fillPct = hi > lo ? Math.max(0, Math.min(100, ((pos - lo) / (hi - lo)) * 100)) : 0;
  return (
    <div className="slider-field">
      <div className="slider-field__head">
        <span className="slider-field__label">
          {label}
          {help && <InfoTip term={term ?? label}>{help}</InfoTip>}
        </span>
        <span className="slider-field__value-wrap">
          <input
            className="slider-field__value"
            type="number"
            aria-label={valueLabel}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {unit && <span className="slider-field__unit">{unit}</span>}
        </span>
      </div>
      <input
        className="slider-field__range"
        type="range"
        aria-hidden="true"
        tabIndex={-1}
        min={lo}
        max={hi}
        step={step}
        value={pos}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: `linear-gradient(to right, var(--accent) ${fillPct}%, var(--hairline) ${fillPct}%)`,
        }}
      />
    </div>
  );
}

type SuperfatWaterPanelProps = {
  settings: RecipeSettings;
  setSettings: Dispatch<SetStateAction<RecipeSettings>>;
  process: ProcessId;
};

/**
 * The two knobs makers touch most — Superfat and the water ratio — as their own left-column
 * panel (moved here from The Numbers to match the comp's arrangement).
 */
export function SuperfatWaterPanel({ settings, setSettings, process }: SuperfatWaterPanelProps) {
  const waterField = WATER_FIELDS[settings.waterMode];
  return (
    <section className="panel">
      <h2 className="panel__title">Superfat &amp; water</h2>
      <div className="numbers-inputs numbers-inputs--panel">
        <SliderField
          label="Superfat"
          valueLabel="Superfat %"
          unit="%"
          term="Superfat"
          help="The share of oils left unsaponified for a gentler, more moisturizing bar. Around 5% is common."
          min={process === 'ls' ? NEG_SUPERFAT_FLOOR : 0}
          max={50}
          step={0.5}
          sliderMax={20}
          value={settings.superfatPercent}
          onChange={(v) => setSettings((s) => ({ ...s, superfatPercent: v }))}
        />
        <label className="field field--compact numbers-inputs__method">
          <span>Water method</span>
          <select
            className="input"
            aria-label="Water method"
            value={settings.waterMode}
            onChange={(e) =>
              setSettings((s) => ({ ...s, waterMode: e.target.value as RecipeSettings['waterMode'] }))
            }
          >
            {waterModeChoicesFor(process).map((mode) => (
              <option key={mode} value={mode}>
                {WATER_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <SliderField
          label={waterField.label}
          valueLabel={waterField.label}
          unit={waterField.label.trim().endsWith('%') ? '%' : ''}
          term={waterField.label.replace(/\s*%$/, '')}
          help={waterField.help}
          min={waterField.min}
          max={'max' in waterField ? waterField.max : undefined}
          step={waterField.step}
          sliderMax={WATER_SLIDER_MAX[settings.waterMode]}
          value={settings[waterField.key]}
          onChange={(v) => {
            const key = waterField.key;
            setSettings((s) => ({ ...s, [key]: v }));
          }}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/SuperfatWaterPanel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Strip the moved block out of `ResultsPanel.tsx`**

Make these exact edits in `packages/web/src/components/ResultsPanel.tsx`:

1. Imports — replace the four import lines so the removed helpers are gone:
   - `import { memo, type Dispatch, type SetStateAction } from 'react';` → `import { memo } from 'react';`
   - `import type { LyeCalculationResult, WaterMode } from '@soap-calc/core';` → keep unchanged (`WaterMode` still used by `waterMode` prop / `waterFootnote`).
   - `import type { RecipeSettings, SplitLiquidSettings, WeightUnit } from '../lib/recipe';` → `import type { SplitLiquidSettings, WeightUnit } from '../lib/recipe';`
   - Delete `import { NEG_SUPERFAT_FLOOR } from '../lib/parseRecipeSettings';`
   - Delete `import { WATER_FIELDS, WATER_MODE_LABELS, waterModeChoicesFor } from '../lib/settingsFields';`
2. Delete the `WATER_SLIDER_MAX` const (the `const WATER_SLIDER_MAX: Record<WaterMode, number> = { … };` block) and the entire local `SliderField` function.
3. In `ResultsPanelProps`, delete the `settings?` and `setSettings?` members and their preceding doc comment (the block starting `/** Raw recipe settings + setter …`).
4. In the destructure, delete `settings,` and `setSettings,`.
5. Delete the `const waterField = …` line and the entire `const editableNumbers = … ;` assignment.
6. Delete all three `{editableNumbers}` render sites.
7. Change the panel number in all three render paths from `>03</span>Results` to `>04</span>Results`.
8. Simplify the `!result` branch (it no longer guards on `editableNumbers`) to:

```tsx
  if (!result) {
    return (
      <section className="panel panel--results" aria-live="polite">
        <h2 className="panel__title">
          <span className="panel__num" aria-hidden="true">04</span>Results
        </h2>
        <p className="results-hint">Enter oil weights to calculate lye and water.</p>
      </section>
    );
  }
```

- [ ] **Step 6: Update `ResultsPanel.test.tsx`** — remove the moved-block coverage

In `packages/web/src/components/ResultsPanel.test.tsx`:
1. Replace the import block at the top with (drops `useState`, `fireEvent`, `RecipeSettings`, `ProcessId`):

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ResultsPanel } from './ResultsPanel';
import { calculateRecipe } from '../lib/calculateRecipe';
import { createStarterLines, DEFAULT_SETTINGS } from '../lib/recipe';
import { formatWeight } from '../lib/weightUnits';
```

2. Delete the `EditableHarness` function and these four tests (now living in `SuperfatWaterPanel.test.tsx`):
   - `editing the Superfat field in The Numbers updates settings state`
   - `Superfat allows a negative min only for LS`
   - `changing the water method swaps the editable water-ratio field`
   - `the editable Superfat/Water block stays reachable when the recipe is empty`

- [ ] **Step 7: Update the SettingsPanel subtitle** — `packages/web/src/components/SettingsPanel.tsx:89-91`

Replace:

```tsx
      <p className="panel__subtitle">
        Superfat and the water ratio now live in The&nbsp;Numbers, beside the figures they drive.
      </p>
```

with:

```tsx
      <p className="panel__subtitle">
        Superfat and the water ratio sit in the Superfat&nbsp;&amp;&nbsp;water panel above.
      </p>
```

- [ ] **Step 8: Wire `SuperfatWaterPanel` into `App.tsx` and drop the Results knobs props**

1. Add the import near the other component imports: `import { SuperfatWaterPanel } from './components/SuperfatWaterPanel';`
2. In the `resultsPanel` element, delete the `settings={settings}` and `setSettings={setSettings}` props.
3. In the Recipe view's `col--formula` div, render `SuperfatWaterPanel` as the **first** child (final ordering is set in Task 4):

```tsx
          <div className="col col--formula">
            <SuperfatWaterPanel settings={settings} setSettings={setSettings} process={process} />
            <RecipeOilsPanel
```

- [ ] **Step 9: Add the standalone-panel spacing for `.numbers-inputs--panel`** — `packages/web/src/index.css`

Immediately after the `.numbers-inputs { … }` rule, add:

```css
/* Standalone panel context (Superfat & water) — no header-divider border/padding, since
   it's its own section now rather than a block stacked atop the Results figures. */
.numbers-inputs--panel {
  margin: 0;
  padding: 0;
  border-bottom: 0;
}
```

- [ ] **Step 10: Typecheck, run affected tests, verify pass**

Run: `npm run typecheck && npx vitest run src/components/SuperfatWaterPanel.test.tsx src/components/ResultsPanel.test.tsx src/components/SettingsPanel.test.tsx src/App.test.tsx`
Expected: typecheck clean; all listed suites PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/web/src/components/SuperfatWaterPanel.tsx packages/web/src/components/SuperfatWaterPanel.test.tsx packages/web/src/components/ResultsPanel.tsx packages/web/src/components/ResultsPanel.test.tsx packages/web/src/components/SettingsPanel.tsx packages/web/src/App.tsx packages/web/src/index.css
git commit -m "feat(web): extract Superfat & water into its own left-column panel"
```

---

### Task 2: Radar/Bars toggle in `PropertiesPanel`

Add a `Radar` / `Bars` toggle that shows one visualization at a time (default **Bars**). Keep the property readings available to assistive tech in Radar mode. Renumber the panel `04`→`03`.

**Files:**
- Modify: `packages/web/src/components/PropertiesPanel.tsx`
- Modify: `packages/web/src/components/PropertiesPanel.test.tsx`
- Modify: `packages/web/src/index.css`

**Interfaces:**
- Consumes: nothing new (same props).
- Produces: within the "Bar properties" section, a `role="tablist"` with two `role="tab"` buttons named `Radar` and `Bars`; `.property-radar` renders only in Radar view, `.property-bars` only in Bars view; six `role="meter"` readings are present in both views.

- [ ] **Step 1: Write the failing tests** — append to `packages/web/src/components/PropertiesPanel.test.tsx`

First, add `fireEvent` to the testing-library import at the top:
`import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';`

Then append:

```tsx
test('defaults to the Bars view — meters visible, radar hidden', () => {
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />,
  );
  expect(container.querySelector('.property-bars')).not.toBeNull();
  expect(container.querySelector('.property-radar')).toBeNull();
  expect(screen.getByRole('meter', { name: /Hardness/i })).toBeTruthy();
});

test('switching to Radar shows the chart and keeps the property readings for AT', () => {
  const { container } = render(
    <PropertiesPanel result={FULL.properties} indexes={FULL.indexes} modeledOilIds={[]} />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
  expect(container.querySelector('.property-radar')).not.toBeNull();
  expect(container.querySelector('.property-bars')).toBeNull();
  // Readings remain reachable via role=meter even though the visual bars are hidden.
  expect(screen.getByRole('meter', { name: /Hardness/i })).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/PropertiesPanel.test.tsx`
Expected: FAIL — no `tab` named "Radar"; both `.property-radar` and `.property-bars` currently render together.

- [ ] **Step 3: Implement the toggle** — `packages/web/src/components/PropertiesPanel.tsx`

1. Change the React import to add `useState`: `import { memo, useState } from 'react';`
2. Change the panel number `>04</span>` to `>03</span>` in the heading.
3. Inside the component body (top of the function), add: `const [view, setView] = useState<'bars' | 'radar'>('bars');`
4. Replace the block that renders `<PropertyRadar … />` followed by the `<ul className="property-bars" …>…</ul>` with the toggle + conditional views below. The toggle and both views live inside the existing `result.properties` truthy branch, after `<ModeledOilsNote oilIds={modeled} />`. Keep the `<p className="property-legend">…</p>` after them, but only show it in Radar view (the shaded band is a radar/meter cue that reads oddly under the Bars meters' own captions — keep it with the chart).

```tsx
          <ModeledOilsNote oilIds={modeled} />

          <div className="property-view-toggle" role="tablist" aria-label="Property display">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'radar'}
              className={`property-view-toggle__tab${view === 'radar' ? ' property-view-toggle__tab--active' : ''}`}
              onClick={() => setView('radar')}
            >
              Radar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'bars'}
              className={`property-view-toggle__tab${view === 'bars' ? ' property-view-toggle__tab--active' : ''}`}
              onClick={() => setView('bars')}
            >
              Bars
            </button>
          </div>

          {view === 'radar' ? (
            <>
              <PropertyRadar
                properties={result.properties}
                order={PROPERTY_ORDER}
                lowCoverage={lowCoverage}
              />
              {/* The chart is aria-hidden; keep the six readings reachable to AT so the
                  toggle never hides the actual numbers from a screen reader. */}
              <ul className="sr-only" aria-label="Soap bar property readings">
                {PROPERTY_ORDER.map((key) => {
                  const value = result.properties![key];
                  return (
                    <li
                      key={key}
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={SCALE_MAX}
                      aria-valuenow={Math.round(value)}
                      aria-label={`${SOAP_PROPERTY_LABELS[key]}: ${lowCoverage ? 'estimated ' : ''}${formatPropertyScore(value)}`}
                    >
                      {SOAP_PROPERTY_LABELS[key]}: {lowCoverage ? '~' : ''}
                      {formatPropertyScore(value)}
                    </li>
                  );
                })}
              </ul>
              <p className="property-legend">
                <span className="property-legend__swatch property-legend__swatch--suggested" />
                Shaded band on the chart = suggested range
              </p>
            </>
          ) : (
            <ul className="property-bars" aria-label="Soap bar properties">
              {PROPERTY_ORDER.map((key) => {
                const value = result.properties![key];
                const guide = SOAP_PROPERTY_GUIDE[key];
                const preference = FORMULATION_PREFERENCE_GUIDE[key];
                const inSuggested = value >= guide.low && value <= guide.high;
                const guidance =
                  key === 'cleansing' && isLiquidSoap
                    ? `${PROPERTY_GUIDANCE[key]} In liquid soap this tracks solubility/how well it dilutes, not harshness.`
                    : PROPERTY_GUIDANCE[key];
                return (
                  <li key={key} className="property-bars__row">
                    <div className="property-bars__label">
                      <span>
                        {SOAP_PROPERTY_LABELS[key]}
                        <InfoTip term={SOAP_PROPERTY_LABELS[key]}>{guidance}</InfoTip>
                      </span>
                      <span className="property-bars__reading">
                        {!inSuggested && !lowCoverage && (
                          <span className="property-bars__status">
                            {value < guide.low ? 'Too low' : 'Too high'}
                          </span>
                        )}
                        <span
                          className={`property-bars__value${inSuggested || lowCoverage ? '' : ' property-bars__value--outside'}`}
                          role="meter"
                          aria-valuemin={0}
                          aria-valuemax={SCALE_MAX}
                          aria-valuenow={Math.round(value)}
                          aria-label={`${SOAP_PROPERTY_LABELS[key]}: ${lowCoverage ? 'estimated ' : ''}${formatPropertyScore(value)}`}
                        >
                          {lowCoverage ? '~' : ''}
                          {formatPropertyScore(value)}
                        </span>
                      </span>
                    </div>
                    <div className="property-meter" aria-hidden="true">
                      <span
                        className="property-meter__band property-meter__band--suggested"
                        style={{
                          left: `${pct(guide.low)}%`,
                          width: `${pct(guide.high) - pct(guide.low)}%`,
                        }}
                      />
                      {preference && (
                        <span
                          className="property-meter__band property-meter__band--target"
                          style={{
                            left: `${pct(preference.low)}%`,
                            width: `${pct(preference.high) - pct(preference.low)}%`,
                          }}
                        />
                      )}
                      <span
                        className={`property-meter__marker${inSuggested || lowCoverage ? '' : ' property-meter__marker--outside'}`}
                        style={{ left: `${pct(value)}%` }}
                      />
                    </div>
                    <div className="property-meter__scale" aria-hidden="true">
                      <span className="property-meter__extreme">Low</span>
                      <span className="property-meter__tick" style={{ left: `${pct(guide.low)}%` }}>
                        {formatPropertyScore(guide.low)}
                      </span>
                      <span className="property-meter__tick" style={{ left: `${pct(guide.high)}%` }}>
                        {formatPropertyScore(guide.high)}
                      </span>
                      <span className="property-meter__extreme property-meter__extreme--high">
                        High
                      </span>
                    </div>
                    <p className="sr-only">
                      Suggested {formatPropertyScoreRange(guide.low, guide.high)}
                      {preference && (
                        <>
                          {' · '}
                          Target {formatPropertyScoreRange(preference.low, preference.high)}
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
```

Note: the old standalone `<p className="property-legend">…</p>` that used to sit after the `</ul>` is now inside the Radar branch — remove the old trailing copy so it isn't rendered twice.

- [ ] **Step 4: Add toggle styles** — `packages/web/src/index.css`

After the `.property-radar` rules block (before `/* ── Messages / insights ── */`), add:

```css
/* ── Property view toggle (Radar / Bars) ──────────────────────────────── */
.property-view-toggle {
  display: flex;
  margin: 0 0 1.4rem;
}

.property-view-toggle__tab {
  appearance: none;
  border: 1px solid var(--text);
  background: transparent;
  color: var(--text-strong);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0.42rem 1rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.property-view-toggle__tab + .property-view-toggle__tab {
  margin-left: -1px;
}

.property-view-toggle__tab--active {
  background: var(--text);
  color: var(--bg);
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npx vitest run src/components/PropertiesPanel.test.tsx`
Expected: typecheck clean; all PropertiesPanel tests PASS (the pre-existing `41` / out-of-range / meter tests still pass because Bars is the default view).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/PropertiesPanel.tsx packages/web/src/components/PropertiesPanel.test.tsx packages/web/src/index.css
git commit -m "feat(web): add a Radar/Bars toggle to the Bar properties panel"
```

---

### Task 3: `ActionsMenu` dropdown

Replace the four toolbar buttons (New / Export / Print / Import) with a single Actions dropdown. Keep the hidden import file input. Update the one e2e test that clicked Export/New directly.

**Files:**
- Create: `packages/web/src/components/ActionsMenu.tsx`
- Test: `packages/web/src/components/ActionsMenu.test.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/index.css`
- Modify: `packages/web/e2e/exploratory.spec.ts:658-673`

**Interfaces:**
- Produces: `ActionsMenu({ onNew, onExport, onPrint, onImport, canPrint }: { onNew: () => void; onExport: () => void; onPrint: () => void; onImport: () => void; canPrint: boolean })`. Renders a `button` named `Actions` that toggles a `role="menu"` with four `role="menuitem"` buttons: `New recipe`, `Export`, `Print batch sheet` (disabled when `canPrint` is false), `Import`. Selecting an item closes the menu and calls its handler.

- [ ] **Step 1: Write the failing test** — `packages/web/src/components/ActionsMenu.test.tsx`

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActionsMenu } from './ActionsMenu';

afterEach(cleanup);

function setup(overrides: Partial<Parameters<typeof ActionsMenu>[0]> = {}) {
  const props = {
    onNew: vi.fn(),
    onExport: vi.fn(),
    onPrint: vi.fn(),
    onImport: vi.fn(),
    canPrint: true,
    ...overrides,
  };
  render(<ActionsMenu {...props} />);
  return props;
}

test('opens the menu and lists the four actions', () => {
  setup();
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  expect(screen.getByRole('menu')).toBeTruthy();
  for (const name of ['New recipe', 'Export', 'Print batch sheet', 'Import']) {
    expect(screen.getByRole('menuitem', { name })).toBeTruthy();
  }
});

test('each item fires its handler and closes the menu', () => {
  const props = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
  expect(props.onExport).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).toBeNull();
});

test('disables Print batch sheet when canPrint is false', () => {
  const props = setup({ canPrint: false });
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  const print = screen.getByRole('menuitem', { name: 'Print batch sheet' }) as HTMLButtonElement;
  expect(print.disabled).toBe(true);
  fireEvent.click(print);
  expect(props.onPrint).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/ActionsMenu.test.tsx`
Expected: FAIL — "Failed to resolve import './ActionsMenu'".

- [ ] **Step 3: Create the component** — `packages/web/src/components/ActionsMenu.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';

type ActionsMenuProps = {
  onNew: () => void;
  onExport: () => void;
  onPrint: () => void;
  onImport: () => void;
  canPrint: boolean;
};

/**
 * Consolidated New / Export / Print / Import actions as a Signal disclosure menu — ink-fill
 * trigger, hairline dropdown, click-outside + Escape to close. Selecting an item closes the
 * menu and runs its handler.
 */
export function ActionsMenu({ onNew, onExport, onPrint, onImport, canPrint }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items: { label: string; onSelect: () => void; disabled?: boolean }[] = [
    { label: 'New recipe', onSelect: onNew },
    { label: 'Export', onSelect: onExport },
    { label: 'Print batch sheet', onSelect: onPrint, disabled: !canPrint },
    { label: 'Import', onSelect: onImport },
  ];

  return (
    <div className="actions-menu" ref={ref}>
      <button
        type="button"
        className={`actions-menu__trigger${open ? ' actions-menu__trigger--open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Actions
        <span className="actions-menu__chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="actions-menu__list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="actions-menu__item"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ActionsMenu.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Add menu styles** — `packages/web/src/index.css`

After the `.recipe-toolbar__status { … }` rule, add:

```css
/* ── Actions menu ─────────────────────────────────────────────────────── */
.actions-menu {
  position: relative;
}

.actions-menu__trigger {
  appearance: none;
  border: 1px solid var(--text);
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  transition: background 0.15s ease, color 0.15s ease;
}

.actions-menu__trigger:hover,
.actions-menu__trigger--open {
  background: var(--text);
  color: var(--bg);
}

.actions-menu__chevron {
  width: 6px;
  height: 6px;
  border-right: 1.4px solid currentColor;
  border-bottom: 1.4px solid currentColor;
  transform: rotate(45deg) translate(-1px, -1px);
  transition: transform 0.15s ease;
}

.actions-menu__trigger--open .actions-menu__chevron {
  transform: rotate(-135deg) translate(-1px, -1px);
}

.actions-menu__list {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  min-width: 11rem;
  background: var(--bg);
  border: 1px solid var(--text);
  z-index: 40;
  display: flex;
  flex-direction: column;
}

.actions-menu__item {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-strong);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  padding: 0.6rem 0.9rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.actions-menu__item + .actions-menu__item {
  border-top: 1px solid var(--border);
}

.actions-menu__item:hover:not(:disabled) {
  background: var(--accent-soft);
}

.actions-menu__item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 6: Wire it into `App.tsx`**

1. Add the import: `import { ActionsMenu } from './components/ActionsMenu';`
2. Replace the `.recipe-toolbar__actions` block — the four `<button className="btn btn--ghost">…</button>` (New, Export, Print, Import) — but KEEP the hidden `<input ref={importInputRef} …>`. The result:

```tsx
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
                inputs.discardDrafts();
                handleImportFile(file);
              }
              e.target.value = '';
            }}
          />
```

- [ ] **Step 7: Update the e2e round-trip test** — `packages/web/e2e/exploratory.spec.ts:664` and `:668`

The Export/New controls now live behind the Actions menu. Replace line 664:

```ts
    await page.getByRole('button', { name: 'Export' }).click();
```

with:

```ts
    await page.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'Export' }).click();
```

and replace line 668:

```ts
    await page.getByRole('button', { name: 'New' }).click();
```

with:

```ts
    await page.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'New recipe' }).click();
```

(The `input[type="file"]` import at `:670` is unchanged — the hidden input still exists.)

- [ ] **Step 8: Typecheck + unit tests**

Run: `npm run typecheck && npx vitest run src/components/ActionsMenu.test.tsx src/App.test.tsx`
Expected: typecheck clean; both PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/components/ActionsMenu.tsx packages/web/src/components/ActionsMenu.test.tsx packages/web/src/App.tsx packages/web/src/index.css packages/web/e2e/exploratory.spec.ts
git commit -m "feat(web): consolidate toolbar actions into an Actions menu"
```

---

### Task 4: Column re-order, tint, and gutter mechanics

Finalize the left-column order, move the tint to The Bar (recipe) / batch-cost column (pricing), and add the desktop `order` swap so the visual reading order matches the comp while small screens keep The Numbers high.

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Reorder the Recipe view's `col--formula` and tint `col--bar`** — `packages/web/src/App.tsx`

1. In the Recipe view `col--formula`, set the child order to: `SuperfatWaterPanel` and the others move so the column reads **Settings → Superfat & water → Recipe oils → Additives → CP extras**. Move `<SettingsPanel … />` to the top of the column and place `<SuperfatWaterPanel … />` second:

```tsx
          {/* Column 1 — Formula: settings, then the recipe inputs. */}
          <div className="col col--formula">
            <SettingsPanel
              process={process}
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
              vesselVolumeLiters={vesselVolumeLiters}
              onVesselVolumeLitersChange={setVesselVolumeLiters}
              hpVesselMultiple={vm.hpVesselMultiple}
            />

            <SuperfatWaterPanel settings={settings} setSettings={setSettings} process={process} />

            <RecipeOilsPanel
              lines={lines} weightUnit={weightUnit}
              previewState={vm.previewState} previewLineByKey={vm.previewLineByKey}
              lineTotals={vm.lineTotals} showRecipeTotals={vm.showRecipeTotals}
              percentTotalOff={vm.percentTotalOff} weightTotalOff={vm.weightTotalOff}
              getDraft={getDraft} setDraft={setDraft}
              inputs={inputs}
            />

            <AdditivesPanel
              additives={additives}
              computed={vm.computedAdditives}
              weightUnit={weightUnit}
              process={process}
              onChange={setAdditives}
            />

            {process === 'cp' && <CpExtrasPanel totalOilGrams={vm.totalOilGrams} />}
          </div>
```

2. Change the Recipe view's third column class from `className="col col--bar"` to `className="col col--bar col--tinted"`. Leave the second column as `className="col col--numbers"` (no tint class).

3. In the **Pricing** view, tint the results column: change `<div className="col col--numbers">{resultsPanel}</div>` to `<div className="col col--numbers col--tinted">{resultsPanel}</div>`. Leave `<div className="col">{pricingPanel}</div>` untouched.

- [ ] **Step 2: Retarget the tint and add the desktop order swap** — `packages/web/src/index.css`

Replace the existing block:

```css
/* The Numbers is the tinted ground. */
.col--numbers {
  background: var(--surface-2);
}
```

with:

```css
/* Tinted ground — carried by whichever column is the visual middle: The Bar in the Recipe
   view, the batch-cost/results column in the Pricing view. Tint a whole column, not cards. */
.col--tinted {
  background: var(--surface-2);
}

/* Desktop (≥3 columns): show the comp's reading order — inputs · The Bar · The Numbers — by
   promoting The Bar ahead of The Numbers visually. DOM order stays formula → numbers → bar,
   so at ≤2 columns The Numbers (the safety-critical lye/water figures) still sits directly
   below the inputs instead of beneath the whole properties column. */
@media (min-width: 63rem) {
  .layout .col--bar {
    order: 2;
    /* DOM-last, but now the visual middle: hand its 3rem right-edge gutter to The Numbers
       below and fall back to the standard column padding. */
    padding-right: 2.4rem;
  }

  .layout .col--numbers {
    order: 3;
    padding-right: 3rem;
  }
}
```

- [ ] **Step 3: Typecheck + full unit suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all unit suites PASS.

- [ ] **Step 4: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS. Watch specifically:
- `smoke & layout › all always-visible panels render on CP default` — every heading still resolves (Recipe oils, Additives, Results, Process guide, Troubleshooting, Settings, Bar properties, Fatty acid profile).
- `smoke & layout › mobile viewport: no horizontal overflow` — no overflow at 390px.
- `export → new → import round-trips the recipe` — the updated Actions-menu steps drive Export/New.
- `beeswax-heavy recipe degrades gracefully in properties` — the Bar properties hint still shows.

If any e2e screenshot baselines are flagged as changed (layout moved on purpose), refresh them: `npm run test:e2e -- --update-snapshots`, then re-run to confirm green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/index.css packages/web/e2e
git commit -m "feat(web): re-order and re-tint the layout columns to the Signal comp"
```

---

### Task 5: Full verification & visual QA

Confirm the whole build is green and the result visually matches the comp.

**Files:** none (verification only).

- [ ] **Step 1: Clean full run**

Run (from repo root): `npm test`
Expected: typecheck + oils validation + all workspace unit tests PASS.

- [ ] **Step 2: Production build**

Run (from `packages/web/`): `npm run build`
Expected: `tsc --noEmit` clean and `vite build` succeeds.

- [ ] **Step 3: Visual check against the comp**

Use the `run` skill (or `npm run dev` in `packages/web/`) to open the app, then verify against the reference:
- Recipe view desktop reads **inputs · Bar properties (tinted) · Results** left→right.
- Left column order: Settings, Superfat & water, Recipe oils `01`, Additives `02` (+ CP extras on CP).
- Bar properties is `03` with a working Radar/Bars toggle (Bars default); Results is `04`.
- The Actions dropdown opens/closes and its items work (New recipe, Export, Print batch sheet, Import).
- Narrow the window below ~1000px: The Numbers (Results) sits directly under the inputs, above Bar properties.
- LS process still shows Dilution / Neutralize / Preserve; HP still shows CP-extras-equivalent + post-cook superfat fields; Troubleshooting still present.

- [ ] **Step 4: Finalize** — use the `superpowers:finishing-a-development-branch` skill to choose merge / PR / cleanup.

---

## Self-Review

**Spec coverage:**
- A. Column re-order & tint → Task 4 (DOM order kept; `col--tinted`; `order` swap).
- A. Mobile-order fix → Task 4 Step 2 media query + Task 4 Step 4 e2e mobile check.
- B. Extract Superfat & water → Task 1.
- B. SettingsPanel subtitle → Task 1 Step 7.
- Shared error gate stays in Results → Task 1 keeps `inputErrors` rendering in `ResultsPanel` (Steps 5/8 leave the `inputErrors` branch in place, only renumbered).
- C. Radar/Bars toggle (+ Bars default, sr-only readings) → Task 2.
- D. Actions menu → Task 3.
- E. Panel numbering (Properties 04→03, Results 03→04) → Task 2 Step 3 / Task 1 Step 5.
- Pricing view tint → Task 4 Step 1.3 + Step 2.
- Out-of-scope features preserved → no task deletes them; Task 5 Step 3 explicitly re-verifies LS/HP/Troubleshooting.

**Placeholder scan:** none — every code step carries full code; every run step carries an exact command + expected result.

**Type consistency:** `SuperfatWaterPanel` props `{ settings, setSettings, process }` match its call site (Task 1 Step 8, Task 4 Step 1). `ActionsMenu` props `{ onNew, onExport, onPrint, onImport, canPrint }` match its call site (Task 3 Step 6). `ResultsPanel` losing `settings`/`setSettings` is reflected at the call site (Task 1 Step 8). Class names introduced in TSX (`property-view-toggle`, `property-view-toggle__tab(--active)`, `actions-menu`, `actions-menu__trigger(--open)`, `actions-menu__chevron`, `actions-menu__list`, `actions-menu__item`, `col--tinted`, `numbers-inputs--panel`) each have a matching CSS rule in the same or a prior task.
