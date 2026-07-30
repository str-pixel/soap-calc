import { describe, expect, it } from 'vitest';
import { DEFAULT_MOLD_SIZER_INPUT, suggestOilGramsFromMoldSizer } from './moldSizer';
import { labelWeightGrams } from './cureEstimate';

describe('moldSizer', () => {
  it('suggests oil grams from rectangular mold in cm', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      length: '20',
      width: '10',
      height: '5',
    });
    expect(grams).toBeCloseTo(598, 0);
  });

  it('suggests oil grams from bar count with zero waste factor', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      mode: 'bars',
      barCount: '10',
      barWeight: '100',
    });
    expect(grams).toBe(650);
  });

  it('applies waste factor when set', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      mode: 'bars',
      barCount: '10',
      barWeight: '100',
      wasteFactorPercent: '5',
    });
    expect(grams).toBeCloseTo(682.5, 1);
  });

  it('suggests base oil grams when waste factor is explicitly zero', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      mode: 'bars',
      barCount: '10',
      barWeight: '100',
      wasteFactorPercent: '0',
    });
    expect(grams).toBe(650);
  });

  it('suggests oil grams from a cylinder mold in cm', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      moldShape: 'cylinder',
      radius: '4',
      height: '10',
    });
    const expectedVolume = Math.PI * 16 * 10;
    expect(grams).toBeCloseTo(expectedVolume * 0.92 * 0.65, 5);
  });

  it('returns null for a cylinder mold missing a dimension', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      moldShape: 'cylinder',
      radius: '4',
      height: '',
    });
    expect(grams).toBeNull();
  });
});

describe('bars mode sizes the WET batch that cures to the requested weight', () => {
  const barsInput = (barCount: string, barWeight: string) =>
    ({ mode: 'bars' as const, barCount, barWeight, wasteFactorPercent: '0' }) as any;

  it('grosses the target up by the process cure loss', () => {
    // 12 x 100 g at a 0.65 oil share: without the gross-up the WET batch weighs 1,200 g and
    // cures ~15% lighter, so every bar lands at ~85 g — the field asks for the weight AFTER
    // cure and delivered the weight before it.
    const flat = suggestOilGramsFromMoldSizer(barsInput('12', '100'), 0.65, 'g', 0);
    const cp = suggestOilGramsFromMoldSizer(barsInput('12', '100'), 0.65, 'g', 0.15);
    expect(flat).toBeCloseTo(780, 3);
    expect(cp).toBeCloseTo(780 / 0.85, 3);
    expect(cp! / flat!).toBeCloseTo(1 / 0.85, 6);
  });

  it('scales with each process — HP loses less, LS nothing', () => {
    const at = (loss: number) => suggestOilGramsFromMoldSizer(barsInput('12', '100'), 0.65, 'g', loss)!;
    expect(at(0.09)).toBeGreaterThan(at(0.06)); // LTHP grosses up more than HTHP
    expect(at(0)).toBeCloseTo(780, 3); // LS: no cure loss, no gross-up
  });

  it('round-trips through the cure model for a recipe with no after-cook extras', () => {
    // Scope, stated honestly: this reconstructs the batch from the sizer's own output, so it
    // pins the gross-up and the fraction's USE, not the fraction's MEANING. If
    // oilBatchFraction ever changed from oil/batch-with-extras to oil/base-batch this would
    // still pass — the sibling test above holds the independent expectation (780 / 0.85).
    // Extras are excluded deliberately: they do not evaporate, so a real recipe carrying
    // them lands extras*loss/barCount high (0.375 g at 30 g extras, 12 bars).
    const loss = 0.15;
    const oil = suggestOilGramsFromMoldSizer(barsInput('12', '100'), 0.65, 'g', loss)!;
    const wetBatch = oil / 0.65;
    const cured = labelWeightGrams(wetBatch, wetBatch, loss);
    expect(cured / 12).toBeCloseTo(100, 6);
  });

  it('ignores a nonsensical loss instead of inverting the sizing', () => {
    for (const bad of [1, 1.5, -0.2, Number.NaN]) {
      expect(suggestOilGramsFromMoldSizer(barsInput('12', '100'), 0.65, 'g', bad)).toBeCloseTo(780, 3);
    }
  });

  it('leaves mold-volume mode untouched — it already measures a wet pour', () => {
    const mold = { mode: 'mold' as const, moldShape: 'rectangular' as const, length: '20', width: '10', height: '8', wasteFactorPercent: '0' } as any;
    expect(suggestOilGramsFromMoldSizer(mold, 0.65, 'g', 0.15)).toEqual(
      suggestOilGramsFromMoldSizer(mold, 0.65, 'g', 0),
    );
  });
});
