// packages/web/src/components/PricingPanel.tsx
import { memo } from 'react';
import { computeRecipePricing, hasMissingMaterialPrice, additivePriceKey } from '../lib/recipePricing';
import type { RecipePricingContext } from '../lib/recipePricing';
import { bookEntry, type PricedEntry, type PricingProfile } from '../lib/pricingProfile';
import { formatCostBreakdown, formatMoney, type PriceUnit } from '../lib/money';
import { formatWeight, type WeightUnit } from '../lib/weightUnits';

interface PricingPanelProps {
  context: RecipePricingContext;
  profile: PricingProfile;
  onProfileChange: (next: PricingProfile) => void;
  /** Active app weight unit for read-only ingredient weights; defaults to grams. */
  weightUnit?: WeightUnit;
}

const UNIT_OPTIONS: PriceUnit[] = ['kg', 'lb'];

// memo: like the other sidebar panels, props are stable view-model outputs — without
// this every keystroke anywhere (recipe name, notes) re-runs computeRecipePricing.
export const PricingPanel = memo(function PricingPanel({ context, profile, onProfileChange, weightUnit = 'g' }: PricingPanelProps) {
  const result = computeRecipePricing(context, profile);
  const incomplete = hasMissingMaterialPrice(context, profile);
  const symbol = profile.currencySymbol;
  const money = (v: number | null) => (v == null || incomplete ? '—' : formatMoney(v, symbol));
  const pct = (v: number | null) => (v == null || incomplete ? '—' : `${v.toFixed(1)}%`);

  const setEntry = (
    book: 'oilPrices' | 'additivePrices',
    key: string,
    patch: Partial<PricedEntry>,
  ) => {
    const prev = bookEntry(profile[book], key) ?? { price: '', unit: profile.outputUnit };
    onProfileChange({ ...profile, [book]: { ...profile[book], [key]: { ...prev, ...patch } } });
  };

  const priceRow = (
    label: string,
    grams: number,
    entry: PricedEntry | undefined,
    onPatch: (patch: Partial<PricedEntry>) => void,
  ) => (
    <div className="pricing-row">
      <span className="pricing-row__name">{label}</span>
      <span className="pricing-row__grams">{formatWeight(grams, weightUnit)}</span>
      <input
        className="input pricing-row__price"
        aria-label={`Price for ${label}`}
        inputMode="decimal"
        value={entry?.price ?? ''}
        onChange={(e) => onPatch({ price: e.target.value })}
      />
      <select
        className="input pricing-row__unit"
        aria-label={`Unit for ${label}`}
        value={entry?.unit ?? profile.outputUnit}
        onChange={(e) => onPatch({ unit: e.target.value as PriceUnit })}
      >
        {UNIT_OPTIONS.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
    </div>
  );

  const setField = (patch: Partial<PricingProfile>) => onProfileChange({ ...profile, ...patch });

  const breakdown = incomplete
    ? null
    : formatCostBreakdown(
        {
          materials: result.materialsOils + result.materialsAdditives + result.lyeCost,
          labour: result.labor,
          overhead: result.overhead,
          packaging: result.packaging,
        },
        symbol,
      );

  return (
    <section className="panel">
      <h2 className="panel__title">Pricing &amp; profit</h2>
      <p className="panel__subtitle">Batch cost and a suggested price from materials, labour, and overhead</p>

      <details className="pricing-details" open>
        <summary>Materials</summary>
        {context.oilLines.map((o) =>
          <div key={o.key}>
            {priceRow(o.name, o.grams, bookEntry(profile.oilPrices, o.oilId), (patch) => setEntry('oilPrices', o.oilId, patch))}
          </div>,
        )}
        {context.additives.map((a) => {
          const key = additivePriceKey(a);
          return (
            <div key={a.key}>
              {priceRow(a.name, a.grams, bookEntry(profile.additivePrices, key), (patch) => setEntry('additivePrices', key, patch))}
            </div>
          );
        })}
        {priceRow('Lye', context.lyeGrams, profile.lyePrice, (patch) =>
          setField({ lyePrice: { ...profile.lyePrice, ...patch } }),
        )}
        <label className="field pricing-details__field">
          Packaging cost (per {profile.outputUnit})
          <input
            className="input"
            aria-label="Packaging cost"
            inputMode="decimal"
            value={profile.packagingPerUnit}
            onChange={(e) => setField({ packagingPerUnit: e.target.value })}
          />
        </label>
        {incomplete && (
          <p className="pricing-hint" data-testid="price-incomplete">
            Enter a price for every material — oils, additives, and the lye — for an accurate cost.
          </p>
        )}
      </details>

      <details className="pricing-details">
        <summary>Labour &amp; overhead</summary>
        <div className="settings-grid">
          <label className="field">
            Labour (minutes per batch)
            <input className="input" aria-label="Labour minutes" inputMode="decimal" value={profile.laborMinutes}
              onChange={(e) => setField({ laborMinutes: e.target.value })} />
          </label>
          <label className="field">
            Rate per hour
            <input className="input" aria-label="Labour rate per hour" inputMode="decimal" value={profile.laborRatePerHour}
              onChange={(e) => setField({ laborRatePerHour: e.target.value })} />
          </label>
          <label className="field">
            Labour burden %
            <input className="input" aria-label="Labour burden percent" inputMode="decimal" value={profile.laborBurdenPercent}
              onChange={(e) => setField({ laborBurdenPercent: e.target.value })} />
          </label>
          <label className="field">
            Overhead
            <select className="input" aria-label="Overhead mode" value={profile.overheadMode}
              onChange={(e) => setField({ overheadMode: e.target.value === 'flat' ? 'flat' : 'percent' })}>
              <option value="percent">% of cost</option>
              <option value="flat">flat per batch</option>
            </select>
          </label>
          {profile.overheadMode === 'percent' ? (
            <label className="field">
              Overhead %
              <input className="input" aria-label="Overhead percent" inputMode="decimal" value={profile.overheadPercent}
                onChange={(e) => setField({ overheadPercent: e.target.value })} />
            </label>
          ) : (
            <label className="field">
              Overhead per batch
              <input className="input" aria-label="Overhead flat" inputMode="decimal" value={profile.overheadFlat}
                onChange={(e) => setField({ overheadFlat: e.target.value })} />
            </label>
          )}
        </div>
      </details>

      <div className="pricing-outputs">
        <div className="settings-grid">
          <label className="field">
            Currency symbol
            <input className="input" aria-label="Currency symbol" value={profile.currencySymbol}
              onChange={(e) => setField({ currencySymbol: e.target.value })} />
          </label>
          <label className="field">
            Price per
            <select className="input" aria-label="Output unit" value={profile.outputUnit}
              onChange={(e) => setField({ outputUnit: e.target.value as PriceUnit })}>
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="field">
            Price from
            <select className="input" aria-label="Pricing lever" value={profile.priceLever}
              onChange={(e) => setField({ priceLever: e.target.value === 'markup' ? 'markup' : 'margin' })}>
              <option value="margin">target margin %</option>
              <option value="markup">markup %</option>
            </select>
          </label>
          {profile.priceLever === 'margin' ? (
            <label className="field">
              Target margin %
              <input className="input" aria-label="Target margin percent" inputMode="decimal" value={profile.targetMarginPercent}
                onChange={(e) => setField({ targetMarginPercent: e.target.value })} />
            </label>
          ) : (
            <label className="field">
              Markup %
              <input className="input" aria-label="Markup percent" inputMode="decimal" value={profile.markupPercent}
                onChange={(e) => setField({ markupPercent: e.target.value })} />
            </label>
          )}
        </div>

        <dl className="pricing-results">
          <dt>Cost per {profile.outputUnit}</dt><dd data-testid="cost-per-unit">{money(result.costPerUnit)}</dd>
          <dt>Cost per batch</dt><dd>{money(result.cogsBatch)}</dd>
          <dt>Suggested price per {profile.outputUnit}</dt><dd>{money(result.suggestedPricePerUnit)}</dd>
          <dt>Profit per {profile.outputUnit}</dt><dd>{money(result.profitPerUnit)}</dd>
          <dt>Margin</dt><dd>{pct(result.marginPercent)}</dd>
          <dt>Markup</dt><dd>{pct(result.markupPercent)}</dd>
        </dl>
        {breakdown && (
          <p className="pricing-breakdown" data-testid="pricing-breakdown">{breakdown}</p>
        )}
      </div>
    </section>
  );
});
