// packages/web/src/components/FragranceColorantsPanel.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FragranceColorantsPanel } from './FragranceColorantsPanel';
import { createEmptyScentColor, normalizeScentColor, type ScentColor } from '../lib/scentColor';
import { applyScentColorCompliance, computeScentColorGrams } from '../lib/computeScentColor';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function renderPanel(scent: ScentColor, process: ProcessId, unit: 'g' | 'lb' = 'g', productGrams: number | null = 1300) {
  const grams = computeScentColorGrams(scent, { process, totalOilGrams: 1000, solutionGrams: 3000, deliveredSuperfatPercent: 5 });
  const computed = applyScentColorCompliance(grams, productGrams, process === 'ls' ? 'solution' : 'label');
  const onChange = vi.fn();
  render(<FragranceColorantsPanel scent={scent} computed={computed} process={process} weightUnit={unit} onChange={onChange} />);
  return onChange;
}

const vanilla = normalizeScentColor({
  fragrances: [{ name: 'Vanilla dream', kind: 'fragrance-oil', percent: '3', supplierMaxPercent: '2', vanillinPercent: '12',
    allergens: [{ name: 'Linalool', percentOfFragrance: '12' }] }],
  colorants: [{ name: 'Blue mica', kind: 'mica', percent: '', portionKey: '' }],
  portions: [],
});

describe('FragranceColorantsPanel', () => {
  it('labels the dose per process: % of oils for bars, % of solution for liquid soap', () => {
    renderPanel(vanilla, 'cp');
    expect(screen.getByLabelText(/Vanilla dream.*% of oils/i)).toBeTruthy();
    cleanup();
    renderPanel(vanilla, 'ls');
    expect(screen.getByLabelText(/Vanilla dream.*% of solution/i)).toBeTruthy();
  });

  it('shows the fixed stage, the over-max warning with both readings, browning, stabilizer grams and the label allergens', () => {
    renderPanel(vanilla, 'cp');
    expect(screen.getByText('At trace')).toBeTruthy();
    expect(screen.getByText(/2\.3% of the finished bar/)).toBeTruthy();
    expect(screen.getByText(/supplier max 2%/)).toBeTruthy();
    expect(screen.getByText(/browning: deep/i)).toBeTruthy();
    expect(screen.getByText(/30 g vanilla stabilizer/i)).toBeTruthy();
    expect(screen.getByText(/name on the label/i).closest('li')!.textContent).toMatch(/Linalool/);
  });

  it('adds rows through the buttons: a fragrance, a colorant (Dye in LS, empty dose), a portion (not in LS)', () => {
    const onChange = renderPanel(createEmptyScentColor(), 'ls');
    fireEvent.click(screen.getByRole('button', { name: /add colorant/i }));
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.colorants[0]).toMatchObject({ kind: 'dye', percent: '' });
    expect(screen.queryByRole('button', { name: /split the batter/i })).toBeNull();
    cleanup();
    const onChangeCp = renderPanel(createEmptyScentColor(), 'cp');
    fireEvent.click(screen.getByRole('button', { name: /split the batter/i }));
    expect((onChangeCp.mock.calls[0][0] as ScentColor).portions).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /add fragrance/i }));
    expect((onChangeCp.mock.calls[1][0] as ScentColor).fragrances[0].kind).toBe('fragrance-oil');
  });

  it('a colorant row shows the guidance in the active unit, the dispersal line, and "to shade" without a dose', () => {
    renderPanel(vanilla, 'cp', 'lb');
    expect(screen.getByText(/½–1 tsp per lb of oils/)).toBeTruthy();
    expect(screen.getByText(/to shade/i)).toBeTruthy();
    expect(screen.getByText(/1:1 with a light carrier oil/i)).toBeTruthy();
    cleanup();
    renderPanel(vanilla, 'cp', 'g');
    expect(screen.getByText(/1–2 tsp per kg of oils/)).toBeTruthy();
  });

  it('deleting a portion returns its colorants to the whole batter', () => {
    const scent = normalizeScentColor({
      fragrances: [], colorants: [{ name: 'Mica', kind: 'mica', percent: '1', portionKey: '#0' }],
      portions: [{ name: 'Swirl', percent: '40' }],
    });
    const onChange = renderPanel(scent, 'cp');
    fireEvent.click(screen.getByRole('button', { name: /remove portion swirl/i }));
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.portions).toEqual([]);
    expect(next.colorants[0].portionKey).toBe('');
  });

  it('the allergen disclosure adds and removes declaration rows', () => {
    const onChange = renderPanel(vanilla, 'cp');
    fireEvent.click(screen.getByRole('button', { name: /add allergen/i }));
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.fragrances[0].allergens).toHaveLength(2);
  });

  it('names the browning without a stabilizer figure until there is a dose to size it', () => {
    const noDose = normalizeScentColor({
      fragrances: [{ name: 'V', kind: 'fragrance-oil', percent: '', supplierMaxPercent: '', vanillinPercent: '12', allergens: [] }],
      colorants: [], portions: [],
    });
    renderPanel(noDose, 'cp');
    expect(screen.getByText(/browning: deep/i).textContent).not.toMatch(/0 g/);
  });

  it('carries the regulatory line with its checked date and the process copy', () => {
    renderPanel(vanilla, 'hp');
    expect(screen.getByText(/0\.01%/)).toBeTruthy();
    expect(screen.getByText(/31 July 2026/)).toBeTruthy();
    expect(screen.getByText(/room temperature/i)).toBeTruthy();
  });
});

describe('row caps and HP whole-batter dispersal', () => {
  it('the add buttons stop at the cap the loader applies, so nothing entered is lost on reload', () => {
    const full = normalizeScentColor({
      fragrances: Array.from({ length: 20 }, (_, i) => ({ name: `F${i}`, kind: 'fragrance-oil', percent: '', supplierMaxPercent: '', vanillinPercent: '', allergens: [] })),
      colorants: [], portions: [],
    });
    renderPanel(full, 'cp');
    expect((screen.getByRole('button', { name: /add fragrance/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /add colorant/i }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('an HP whole-batter colour is told to go straight into the oils', () => {
    const scentHp = normalizeScentColor({ fragrances: [], colorants: [{ name: 'Red oxide', kind: 'oxide', percent: '1', portionKey: '' }], portions: [] });
    renderPanel(scentHp, 'hp');
    expect(screen.getByText(/straight into the warmed oils/i)).toBeTruthy();
    expect(screen.getByText('With oils')).toBeTruthy();
  });
});
