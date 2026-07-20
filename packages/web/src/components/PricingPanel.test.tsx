// @vitest-environment jsdom
// packages/web/src/components/PricingPanel.test.tsx
// NOTE: the jsdom pragma above MUST be line 1 — web vitest defaults to environment:'node'.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PRICING_PROFILE } from '../lib/pricingProfile';
import type { RecipePricingContext } from '../lib/recipePricing';
import { PricingPanel } from './PricingPanel';

afterEach(cleanup);

const context: RecipePricingContext = {
  oilLines: [{ key: 'a', oilId: 'olive-oil', grams: 1000, name: 'Olive Oil' }],
  additives: [],
  lyeGrams: 140,
  totalBatchGrams: 1610,
};

describe('PricingPanel', () => {
  it('lists recipe oils and shows the incomplete-price hint', () => {
    render(<PricingPanel context={context} profile={DEFAULT_PRICING_PROFILE} onProfileChange={() => {}} />);
    expect(screen.getByText('Olive Oil')).toBeTruthy();
    expect(screen.getByTestId('price-incomplete')).toBeTruthy();
  });

  it('emits a profile update when an oil price is entered', () => {
    const onProfileChange = vi.fn();
    render(<PricingPanel context={context} profile={DEFAULT_PRICING_PROFILE} onProfileChange={onProfileChange} />);
    fireEvent.change(screen.getByLabelText('Price for Olive Oil'), { target: { value: '4.50' } });
    expect(onProfileChange).toHaveBeenCalledTimes(1);
    const next = onProfileChange.mock.calls[0][0];
    expect(next.oilPrices['olive-oil'].price).toBe('4.50');
  });

  it('renders ingredient weights in the active weight unit', () => {
    render(
      <PricingPanel context={context} profile={DEFAULT_PRICING_PROFILE} onProfileChange={() => {}} weightUnit="kg" />,
    );
    // 1000 g of olive oil shown as 1 kg (not "1,000 g") when the app unit is kg.
    expect(screen.getByText(/^1 kg$/)).toBeTruthy();
  });

  it('shows outputs once oils are priced', () => {
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
    };
    render(<PricingPanel context={context} profile={profile} onProfileChange={() => {}} />);
    expect(screen.queryByTestId('price-incomplete')).toBeNull();
    expect(screen.getByTestId('cost-per-unit').textContent).toMatch(/\$/);
  });

  it('shows a dash (not $0.00) for cost-per-unit while prices are incomplete', () => {
    render(<PricingPanel context={context} profile={DEFAULT_PRICING_PROFILE} onProfileChange={() => {}} />);
    expect(screen.getByTestId('cost-per-unit').textContent).toBe('—');
    expect(screen.getByTestId('cost-per-unit').textContent).not.toMatch(/\$/);
  });

  it('renders two same-oil rows (shared oilId, distinct keys) without a duplicate-key warning', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dupContext: RecipePricingContext = {
      oilLines: [
        { key: 'a', oilId: 'olive-oil', grams: 500, name: 'Olive Oil' },
        { key: 'b', oilId: 'olive-oil', grams: 500, name: 'Olive Oil' },
      ],
      additives: [],
      lyeGrams: 140,
      totalBatchGrams: 1610,
    };
    render(<PricingPanel context={dupContext} profile={DEFAULT_PRICING_PROFILE} onProfileChange={() => {}} />);
    expect(screen.getAllByLabelText('Price for Olive Oil')).toHaveLength(2);
    const hadKeyWarning = errorSpy.mock.calls.some((args) =>
      String(args[0]).toLowerCase().includes('same key'),
    );
    expect(hadKeyWarning).toBe(false);
    errorSpy.mockRestore();
  });

  it('uses the shared panel title convention for its heading', () => {
    render(<PricingPanel context={context} profile={DEFAULT_PRICING_PROFILE} onProfileChange={() => {}} />);
    const heading = screen.getByRole('heading', { name: 'Pricing & profit' });
    expect(heading.className).toContain('panel__title');
  });

  it('shows a cost breakdown line once prices are complete', () => {
    // olive 1 kg @ $4.50 → materials $4.50; default overhead 20% → $0.90; labour/packaging 0.
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
    };
    render(<PricingPanel context={context} profile={profile} onProfileChange={() => {}} />);
    expect(screen.getByTestId('pricing-breakdown').textContent).toBe(
      'materials $4.50 · overhead $0.90',
    );
  });

  it('hides the cost breakdown while prices are incomplete', () => {
    render(<PricingPanel context={context} profile={DEFAULT_PRICING_PROFILE} onProfileChange={() => {}} />);
    expect(screen.queryByTestId('pricing-breakdown')).toBeNull();
  });
});
