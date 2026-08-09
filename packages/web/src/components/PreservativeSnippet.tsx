import {
  LS_PRESERVATIVES,
  lsPreservativeById,
  lsPreservativeDoseTier,
  preservativeDoseGrams,
} from '@soap-calc/core';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type PreservativeSnippetProps = {
  /** The finished, ready-for-use mass the dose is a % of — THE MASS OF WHAT THE MAKER IS
   * ACTUALLY MAKING, which is whatever the Dilution panel's scope toggle says it is. In
   * Whole batch that is the batch's finished product (lib/calculateAdditives'
   * finishedProductGramsFor, the same figure the panel's own row quotes); in Custom amount
   * it is the PORTION's own finished solution. It is emphatically NOT always the batch:
   * this prop used to be handed the batch's mass in both scopes, so a 250 ml draw off a
   * 4 kg batch was told to weigh in the batch's 40 g of Suttocide — about 16% w/w in that
   * bottle, sixteen times the EU ceiling. App resolves it; `basisScope` says which of the
   * two it resolved, and the two must move together.
   *
   * Null whenever there is no such mass — no oils/outside LS, or a Custom amount with no
   * usable portion (nothing asked for yet, a refused paste reading, a paste already
   * thinner than the target). Null renders the hint for that state; it must never quietly
   * fall back to the batch, which is the bug above wearing a different hat. */
  finishedGrams: number | null;
  /** Which scope `finishedGrams` was resolved in, so the base row can NAME the mass it
   * quotes and the empty-state hint can ask for the right thing. Passed independently of
   * `finishedGrams` because it is still the answer when that is null. Defaults to 'batch',
   * matching DilutionPanel's own scope default. */
  basisScope?: 'batch' | 'portion';
  /** The app-wide unit (BatchBasics' selector) — used as-is, like every bench readout. */
  weightUnit: WeightUnit;
  /** Which preservative is being sized. `''` is the CUSTOM sentinel — the same idiom as
   * an additive line's `catalogId: ''` — and means the app has no product data at all:
   * no rated pH, no ceiling, no formaldehyde status. Session state for now, held in App
   * beside the other bench decisions; a later task moves it into the recipe. */
  preservativeId: string;
  onPreservativeIdChange: (id: string) => void;
  /** Free-text product name, used only while `preservativeId` is `''`. Retained across a
   * switch to a known product so switching back restores it. */
  preservativeCustomName: string;
  onPreservativeCustomNameChange: (name: string) => void;
  /** The dose as typed, % of finished product. Reseeded to a product's own default on
   * every pick, and CLEARED when Custom… is chosen — there is no default to reseed from,
   * and carrying the last product's dose onto an unknown one is the hazard the reseed
   * rule exists to prevent. */
  dosePct: string;
  onDosePctChange: (value: string) => void;
};

/**
 * The Preservative snippet — a collapsed <details> below the Dilution panel, LS only.
 *
 * A dose calculator, not a recipe field: it answers "how many grams of preservative go
 * into the bottle this batch fills" from the finished diluted mass, and writes nothing
 * back into the recipe. All product data, ceilings and the dose math live in core's
 * ls-preservatives.ts, where each constant carries its verification citation; the copy
 * here paraphrases the book's need logic (LS:3176–3181 water activity 0.984 diluted vs
 * 0.866 paste; LS:1638 the pH myth; LS:3051/LS:2975 milk, beer and botanicals; LS:3230
 * selling; LS:3228 the personal-batch choice) and the stage rule (after dilution, cooled
 * — LS:2520) without quoting it.
 */
export function PreservativeSnippet({
  finishedGrams,
  basisScope = 'batch',
  weightUnit,
  preservativeId,
  onPreservativeIdChange,
  preservativeCustomName,
  onPreservativeCustomNameChange,
  dosePct,
  onDosePctChange,
}: PreservativeSnippetProps) {
  // undefined === the custom entry. Everything product-specific below is gated on it.
  const preservative = lsPreservativeById(preservativeId);
  const displayName =
    preservative?.label ?? (preservativeCustomName.trim() || 'Custom preservative');
  const doseNum = Number(dosePct);
  // NO CLAMP. The grams are always the typed dose against the finished mass; the ladder
  // below explains where that dose sits. A figure computed from a number the maker did
  // not type is the thing this replaced.
  const tier = lsPreservativeDoseTier(doseNum, preservative);
  // Canonical echo: '2.500' and '2.5e0' both print as 2.5, the same rule parseAdditiveLine
  // uses on import.
  const typedPct = String(doseNum);
  const grams =
    finishedGrams !== null && tier !== 'none' && tier !== 'impossible'
      ? preservativeDoseGrams(finishedGrams, doseNum)
      : null;
  const [typicalLow, typicalHigh] = preservative?.typicalPctRange ?? [0, 0];
  return (
    <details className="panel panel--nested preservative">
      {/* An h2 inside the summary keeps this titled like its sibling panels (same
          heading level and .panel__title look) while the whole line stays the
          disclosure control. */}
      <summary className="preservative__summary">
        <h2 className="panel__title">Preservative</h2>
      </summary>
      <p className="panel__subtitle">
        Grams to weigh into the finished, diluted soap — a bench figure, never added into
        the recipe
      </p>
      {/* THE NEED PARAGRAPH — why this snippet exists, in the book's logic and this
          app's words. Diluted vs paste is a WATER story, not a pH story: dilution lifts
          water activity from ~0.87 into the ~0.98 growth range (LS:3176–3181), and "the
          pH protects it" is a named myth (LS:1638). The paste claim carries the book's
          own hedge: 0.866 is reported as NEAR the level that no longer supports growth,
          not safely past it, so the copy says "near the dryness that stops growth" and
          never calls the paste too dry outright. The three obligation tiers are the
          book's own: additives make one necessary (LS:3051, LS:2975), selling makes one
          responsible practice (LS:3230), a small personal batch is the maker's informed
          choice (LS:3228). */}
      <p className="results-hint">
        Diluted soap supports mold and bacteria whatever its pH — the paste sits near
        the dryness that stops growth, and dilution moves it well inside the growth
        range. With milk, beer or botanicals in the recipe a preservative is necessary;
        if you sell, using one is responsible practice; for a small personal batch used
        up quickly, it is your informed call.
      </p>
      <label className="field">
        {/* The span IS the accessible name (wrapping label, no aria-label) — the same
            one-string discipline as the dose field, and the visible caption the
            radiogroup's legend used to carry. */}
        <span>Which preservative</span>
        <select
          className="input"
          value={preservativeId}
          onChange={(e) => {
            const id = e.target.value;
            onPreservativeIdChange(id);
            const picked = lsPreservativeById(id);
            // Reseed, don't carry: each product's default IS product data (its own
            // verified typical dose), so a dose typed for one must not silently become
            // another's — 1% of Suttocide is legal, 1% of Germall is double the
            // supplier's maximum. Custom has no default, so it clears instead.
            onDosePctChange(picked ? String(picked.defaultPct) : '');
          }}
        >
          <option value="">Custom…</option>
          {LS_PRESERVATIVES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {preservative ? (
        /* The selected product's own facts — composition, rated pH, typical dose — so the
           default in the field below arrives explained, not asserted. */
        <p className="results-hint">
          {preservative.composition} — {preservative.phNote}. Typical {typicalLow}–
          {typicalHigh}% of the finished product.
        </p>
      ) : (
        <>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              className="input"
              placeholder="Name"
              maxLength={200}
              value={preservativeCustomName}
              onChange={(e) => onPreservativeCustomNameChange(e.target.value)}
            />
          </label>
          {/* The research this table is built on, at the one moment it is useful: a maker
              reaching for Custom… is most likely holding an organic-acid system, which is
              inert at soap pH. The app has no data for their bottle and says so rather
              than implying a rating it cannot cite. */}
          <p className="results-hint">
            Few preservatives hold at soap&apos;s pH 9–10. Organic-acid systems (sodium
            benzoate, potassium sorbate, Geogard, Optiphen) are inert here. Check your
            supplier&apos;s rated pH range and use level before dosing.
          </p>
        </>
      )}
      <label className="field">
        {/* This span IS the input's accessible name (wrapping label, no aria-label) —
            same one-string discipline as the measured-paste field. */}
        <span>Dose (% of finished product)</span>
        <input
          type="number"
          className="input input--number"
          min={0}
          max={100}
          step={0.1}
          value={dosePct}
          onChange={(e) => onDosePctChange(e.target.value)}
        />
      </label>
      {tier === 'impossible' && (
        <p className="results-hint" role="alert">
          A dose must be 100% or less of the finished product.
        </p>
      )}
      {preservative && tier === 'above-max' && (
        <p className="results-hint" role="alert">
          {typedPct}% is above{' '}
          {preservative.ceiling === 'eu'
            ? `the EU legal maximum of ${preservative.maxPct}% for ${displayName} in a finished product`
            : `${displayName}'s supplier maximum of ${preservative.maxPct}%`}
          . The figures below use the {typedPct}% you entered.
        </p>
      )}
      {preservative && tier === 'below-typical' && (
        <p className="results-hint">
          Below the typical {typicalLow}–{typicalHigh}% for {displayName} — an
          under-dose may not protect the batch.
        </p>
      )}
      {finishedGrams !== null ? (
        <>
          {grams !== null && (
            <dl className="results-grid">
              <div className="results-grid__item results-grid__item--primary">
                <dt>Preservative to add</dt>
                <dd>{formatWeight(grams, weightUnit)}</dd>
              </div>
              {/* The mass the % is a percentage OF, beside the dose it explains — and
                  NAMED for which of the two masses it is, in the scope toggle's own words
                  ("Whole batch" / "Custom amount"), because they are different numbers and
                  the dose follows whichever is in play. */}
              <div className="results-grid__item">
                <dt>≈ Finished product ({basisScope === 'portion' ? 'custom amount' : 'whole batch'})</dt>
                <dd>{formatWeight(finishedGrams, weightUnit)}</dd>
              </div>
            </dl>
          )}
          {/* STAGE + BASIS, one paragraph: when to add it (after dilution, cooled —
              LS:2520; the supplier's own °C where one is published), and what the % is
              of (EU Annex V maxima are % w/w of the finished, ready-for-use product —
              for liquid soap, the diluted solution above). */}
          <p className="results-hint">
            Add after dilution, once the soap has cooled
            {preservative?.addBelowC != null
              ? ` — below ${preservative.addBelowC} °C for ${preservative.label}`
              : ''}
            . Doses and legal maxima are % of the finished, ready-to-use product, which
            for liquid soap is the diluted solution — the mass this figure is computed
            from.
          </p>
        </>
      ) : basisScope === 'portion' ? (
        /* Custom amount with no portion to dose. The state-specific ask, not the batch's:
           the maker is on a screen with no batch figures on it, and the one thing that
           sizes a dose here is the amount they are making. */
        <p className="results-hint">
          Enter an Amount to make above — with Custom amount chosen, the dose is a % of the
          portion you are making now, not of the whole batch.
        </p>
      ) : (
        <p className="results-hint">
          Enter oils and a dilution target to size a preservative dose — the % is of the
          finished, diluted soap.
        </p>
      )}
      {/* Reg. (EU) 2022/1181: 0.001% (10 ppm) total released formaldehyde obliges the
          label warning. EVERY releaser gets a note — silence is reserved for the one
          product with no formaldehyde chemistry — in the two strengths core's
          formaldehydeLabel doc explains: the label duty stated outright where an
          effective dose generally crosses the threshold, and a check-the-threshold note
          for Germall, whose diazolidinyl urea is a listed releaser but has no verified
          released-formaldehyde figure at its dose. Naming DU here is deliberate: the
          composition line above lists three ingredients, and the note must say which
          one carries the duty. */}
      {preservative && preservative.formaldehydeLabel !== 'not-a-releaser' && (
        <p className="results-hint">
          {preservative.formaldehydeLabel === 'generally-required' ? (
            <>
              {displayName} is a formaldehyde releaser: at an effective dose an
              EU-market label will generally need the warning &ldquo;releases
              formaldehyde&rdquo;.
            </>
          ) : (
            <>
              {displayName} contains a formaldehyde releaser (diazolidinyl urea)
              — for an EU-market label, check released formaldehyde against the 0.001%
              &ldquo;releases formaldehyde&rdquo; threshold.
            </>
          )}
        </p>
      )}
    </details>
  );
}
