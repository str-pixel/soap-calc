// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FragrancePanel } from './FragrancePanel';
import { createEmptyScentColor, normalizeScentColor, type ScentColor } from '../lib/scentColor';
import { computedScent } from '../testing/scentFixtures';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function renderPanel(scent: ScentColor, process: ProcessId, unit: 'g' | 'lb' = 'g', productGrams: number | null = 1300) {
  const computed = computedScent(scent, { process, totalOilGrams: 1000, solutionGrams: 3000, productGrams });
  const onChange = vi.fn();
  render(<FragrancePanel scent={scent} computed={computed} process={process} weightUnit={unit} onChange={onChange} />);
  return onChange;
}

const vanilla = normalizeScentColor({
  fragrances: [{ name: 'Vanilla dream', percent: '3', supplierMaxPercent: '2', vanillinPercent: '12',
    allergens: [{ name: 'Linalool', percentOfFragrance: '12' }] }],
  colorants: [],
  portions: [],
});

describe('FragrancePanel', () => {
  it('is its own numbered section, holding essential oils only', () => {
    renderPanel(createEmptyScentColor(), 'cp');
    expect(screen.getByRole('heading', { name: /Essential oils/ }).textContent).toBe('06Essential oils');
    expect(screen.queryByRole('button', { name: /add colorant/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /split the batter/i })).toBeNull();
    // No kind control: a fragrance oil is a supplier's blend and has no place here.
    expect(screen.queryByRole('radiogroup', { name: /^Kind of/ })).toBeNull();
    expect(screen.getByText(/a fragrance oil is a supplier's own blend/i)).toBeTruthy();
  });

  it('the name field carries a VISIBLE label, not just a placeholder', () => {
    renderPanel(vanilla, 'cp');
    const input = screen.getByLabelText('Essential oil name');
    expect(input).toBeTruthy();
    // Rendered text above the row, so a reader sees what the box is for.
    expect(input.closest('.additive-list__choice')!.querySelector('.micro-label')!.textContent)
      .toBe('Essential oil');
  });

  it('lays a row out like an additive row, with its units inside the figure slabs', () => {
    renderPanel(vanilla, 'cp');
    const row = document.querySelector('.additive-list__row')!;
    expect([...row.querySelectorAll('.micro-label')].map((n) => n.textContent))
      .toEqual(['Essential oil', 'Dose', 'Max in product', 'Vanillin', 'Add at', 'Adds']);
    expect([...row.querySelectorAll('.ledger__unit')].map((n) => n.textContent))
      .toEqual(['% of oils', '%', '%']);
    // and the dose unit follows the process
    cleanup();
    renderPanel(vanilla, 'ls');
    expect(document.querySelector('.ledger__unit')!.textContent).toBe('% of solution');
  });

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

  it('adds a scent row through its own button', () => {
    const onChange = renderPanel(createEmptyScentColor(), 'cp');
    fireEvent.click(screen.getByRole('button', { name: /add essential oil/i }));
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.fragrances).toHaveLength(1);
    expect(next.fragrances[0].name).toBe('');
  });

  it('the allergen disclosure adds declaration rows', () => {
    const onChange = renderPanel(vanilla, 'cp');
    fireEvent.click(screen.getByRole('button', { name: /add allergen/i }));
    expect((onChange.mock.calls[0][0] as ScentColor).fragrances[0].allergens).toHaveLength(2);
  });

  it('names the browning without a stabilizer figure until there is a dose to size it', () => {
    const noDose = normalizeScentColor({
      fragrances: [{ name: 'V', percent: '', supplierMaxPercent: '', vanillinPercent: '12', allergens: [] }],
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

  it('stops adding at the cap the loader applies, so nothing entered is lost on reload', () => {
    const full = normalizeScentColor({
      fragrances: Array.from({ length: 20 }, (_, i) => ({ name: `F${i}`, percent: '', supplierMaxPercent: '', vanillinPercent: '', allergens: [] })),
      colorants: [], portions: [],
    });
    renderPanel(full, 'cp');
    expect((screen.getByRole('button', { name: /add essential oil/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
