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
  oilLines: [{ oilId: 'olive-oil', grams: 1000, name: 'Olive Oil' }],
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

  it('shows outputs once oils are priced', () => {
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
    };
    render(<PricingPanel context={context} profile={profile} onProfileChange={() => {}} />);
    expect(screen.queryByTestId('price-incomplete')).toBeNull();
    expect(screen.getByTestId('cost-per-unit').textContent).toMatch(/\$/);
  });
});
