import { describe, expect, it } from 'vitest';
import { resolveSplitLiquidGrams, splitLiquidCalcOverride } from './splitLiquidSizing';
import type { SplitLiquidSettings } from './recipe';
import { DEFAULT_SETTINGS } from './recipe';

const SPLIT = (over: Partial<SplitLiquidSettings>): SplitLiquidSettings => ({
  enabled: true,
  presetKey: '',
  name: 'goat milk',
  customWaterPercent: '',
  sizeMode: 'percent_of_oils',
  amount: '20',
  addAt: 'trace',
  ...over,
});

describe('resolveSplitLiquidGrams', () => {
  const ctx = { totalOilGrams: 1000, targetLiquidGrams: 330, lyeGrams: 138 };

  it('sizes % of oil weight against the oils', () => {
    expect(resolveSplitLiquidGrams(SPLIT({ sizeMode: 'percent_of_oils', amount: '20' }), ctx)).toBe(200);
  });

  it('sizes grams directly', () => {
    expect(resolveSplitLiquidGrams(SPLIT({ sizeMode: 'grams', amount: '454' }), ctx)).toBe(454);
  });

  it('sizes % of total liquid against the liquid budget', () => {
    expect(resolveSplitLiquidGrams(SPLIT({ sizeMode: 'percent_of_liquid', amount: '50' }), ctx)).toBe(165);
  });

  it('sizes rest as everything above the 1:1 lye minimum', () => {
    expect(resolveSplitLiquidGrams(SPLIT({ sizeMode: 'rest', amount: '' }), ctx)).toBe(192);
  });

  it('rest never goes negative when the budget sits at or below the floor', () => {
    expect(
      resolveSplitLiquidGrams(SPLIT({ sizeMode: 'rest', amount: '' }), { ...ctx, targetLiquidGrams: 120 }),
    ).toBe(0);
  });

  it('returns null for blank or invalid amounts in amount-bearing modes', () => {
    expect(resolveSplitLiquidGrams(SPLIT({ sizeMode: 'grams', amount: '' }), ctx)).toBeNull();
    expect(resolveSplitLiquidGrams(SPLIT({ sizeMode: 'percent_of_liquid', amount: '-5' }), ctx)).toBeNull();
  });
});

describe('splitLiquidCalcOverride', () => {
  it('pins the lye water at 1:1 for budget modes under percent-of-oils water', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      waterPercentOfOils: '33',
      splitLiquid: SPLIT({ sizeMode: 'rest' }),
    };
    const o = splitLiquidCalcOverride(settings, 1000);
    expect(o).not.toBeNull();
    expect(o!.settingsForCalc.waterMode).toBe('lye_water_ratio');
    expect(o!.settingsForCalc.lyeWaterRatio).toBe('1');
    expect(o!.targetLiquidGrams).toBe(330);
  });

  it('allocates percent_of_liquid out of the budget (water = budget minus the liquid)', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      waterPercentOfOils: '33',
      splitLiquid: SPLIT({ sizeMode: 'percent_of_liquid', amount: '50' }),
    };
    const o = splitLiquidCalcOverride(settings, 1000);
    // 330 budget − 165 milk = 165 water → 16.5% of oils
    expect(o!.settingsForCalc.waterMode).toBe('percent_of_oils');
    expect(Number(o!.settingsForCalc.waterPercentOfOils)).toBeCloseTo(16.5, 1);
    expect(o!.targetLiquidGrams).toBe(330);
  });

  it('leaves legacy sizing modes and non-percent water modes untouched', () => {
    const legacy = { ...DEFAULT_SETTINGS, splitLiquid: SPLIT({ sizeMode: 'percent_of_oils' }) };
    expect(splitLiquidCalcOverride(legacy, 1000)).toBeNull();
    const conc = {
      ...DEFAULT_SETTINGS,
      waterMode: 'lye_concentration' as const,
      splitLiquid: SPLIT({ sizeMode: 'rest' }),
    };
    expect(splitLiquidCalcOverride(conc, 1000)).toBeNull();
    const disabled = { ...DEFAULT_SETTINGS, splitLiquid: SPLIT({ sizeMode: 'rest', enabled: false }) };
    expect(splitLiquidCalcOverride(disabled, 1000)).toBeNull();
  });
});

describe('budget-mode interaction guards (self-review)', () => {
  it('percent_of_liquid can allocate water below the 1:1 floor — override must report it', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      waterPercentOfOils: '33',
      splitLiquid: SPLIT({ sizeMode: 'percent_of_liquid', amount: '90' }),
    };
    const o = splitLiquidCalcOverride(settings, 1000);
    // 330 budget − 297 milk = 33 g water for ~138 g lye: far under 1:1.
    expect(Number(o!.settingsForCalc.waterPercentOfOils)).toBeCloseTo(3.3, 1);
    // The override itself can't know the lye; the view model must surface the shortfall.
  });
});
