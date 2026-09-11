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
  fragrances: [{ name: 'Vanilla dream', percent: '3', vanillinPercent: '12' }],
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
    // An oil the maker names themselves keeps the field, in its own labelled ledger row.
    const input = screen.getByLabelText('Essential oil name');
    expect(input.closest('label')!.querySelector('.micro-label')!.textContent).toBe('Name');
    // and the picker above it says what the row is
    expect(screen.getByLabelText(/Essential oil for/).closest('.additive-list__choice')!
      .querySelector('.micro-label')!.textContent).toBe('Essential oil');
  });

  it('every visible label is part of the control\'s accessible name', () => {
    renderPanel(vanilla, 'cp');
    const named = (visible: string, control: HTMLElement) =>
      (control.getAttribute('aria-label') ?? '').toLowerCase().includes(visible.toLowerCase());
    expect(named('Dose', screen.getByLabelText(/Vanilla dream dose/))).toBe(true);
    expect(named('Vanillin', screen.getByLabelText(/Vanilla dream vanillin/))).toBe(true);
    expect(named('Essential oil', screen.getByLabelText('Essential oil name'))).toBe(true);
  });

  it('lays a row out like an additive row, with its units inside the figure slabs', () => {
    renderPanel(vanilla, 'cp');
    const row = document.querySelector('.additive-list__row')!;
    expect([...row.querySelectorAll('.micro-label')].map((n) => n.textContent))
      .toEqual(['Essential oil', 'Name', 'Dose', 'Vanillin', 'Add at', 'Adds']);
    expect([...row.querySelectorAll('.ledger__unit')].map((n) => n.textContent))
      .toEqual(['% of oil weight', '%']);
    // and the dose unit follows the process
    cleanup();
    renderPanel(vanilla, 'ls');
    expect(document.querySelector('.ledger__unit')!.textContent).toBe('% of solution');
  });

  it('labels the dose per process: % of oil weight for bars, % of solution for liquid soap', () => {
    renderPanel(vanilla, 'cp');
    expect(screen.getByLabelText(/Vanilla dream.*% of oil weight/i)).toBeTruthy();
    cleanup();
    renderPanel(vanilla, 'ls');
    expect(screen.getByLabelText(/Vanilla dream.*% of solution/i)).toBeTruthy();
  });

  it('shows the fixed stage, the dose in both bases, browning, stabilizer grams and the label allergens', () => {
    renderPanel(vanilla, 'cp');
    expect(screen.getByText('At trace')).toBeTruthy();
    // The same 30 g, each basis named — the bar is heavier than its oils, so the share is smaller.
    expect(screen.getByText('3% of oil weight = 2.3% of the finished bar.')).toBeTruthy();
    expect(screen.queryByText(/supplier max/)).toBeNull();
    expect(screen.queryByLabelText(/max in product/i)).toBeNull();
    expect(screen.getByText(/browning: deep/i)).toBeTruthy();
    expect(screen.getByText(/30 g vanilla stabilizer/i)).toBeTruthy();
    // A fragrance the maker named carries nothing the app can vouch for: no label line.
    expect(screen.queryByText(/name on the label/i)).toBeNull();
  });

  it('adds a scent row through its own button', () => {
    const onChange = renderPanel(createEmptyScentColor(), 'cp');
    fireEvent.click(screen.getByRole('button', { name: /add essential oil/i }));
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.fragrances).toHaveLength(1);
    expect(next.fragrances[0].name).toBe('');
  });


  it('names the browning without a stabilizer figure until there is a dose to size it', () => {
    const noDose = normalizeScentColor({
      fragrances: [{ name: 'V', percent: '', vanillinPercent: '12', allergens: [] }],
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
      fragrances: Array.from({ length: 20 }, (_, i) => ({ name: `F${i}`, percent: '', vanillinPercent: '', allergens: [] })),
      colorants: [], portions: [],
    });
    renderPanel(full, 'cp');
    expect((screen.getByRole('button', { name: /add essential oil/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('picking an essential oil', () => {
  const blank = normalizeScentColor({ fragrances: [{ name: '', percent: '' }], colorants: [], portions: [] });

  it('offers the catalog, with Custom first, and a pick settles the name only', () => {
    const onChange = renderPanel(blank, 'cp');
    const picker = screen.getByLabelText(/Essential oil for/) as HTMLSelectElement;
    expect([...picker.options][0].text).toBe('Custom…');
    fireEvent.change(picker, { target: { value: 'lemongrass' } });
    const row = (onChange.mock.calls[0][0] as ScentColor).fragrances[0];
    expect(row).toMatchObject({ catalogId: 'lemongrass', name: 'Lemongrass' });
    // nothing is copied into the row: what it carries comes off the catalog at compute time
    expect('allergens' in row).toBe(false);
  });

  it('Custom… hands the name back', () => {
    const picked = normalizeScentColor({ fragrances: [{ catalogId: 'clove', name: '', percent: '1' }], colorants: [], portions: [] });
    const onChange = renderPanel(picked, 'cp');
    fireEvent.change(screen.getByLabelText(/Essential oil for/), { target: { value: '' } });
    expect((onChange.mock.calls[0][0] as ScentColor).fragrances[0]).toMatchObject({ catalogId: '', name: 'Clove' });
  });
});

describe('the warning and the safe-use line', () => {
  const picked = (id: string, percent = '3') =>
    normalizeScentColor({ fragrances: [{ catalogId: id, name: '', percent }], colorants: [], portions: [] });

  it('names what the oil carries and says to expect it on the label', () => {
    renderPanel(picked('grapefruit'), 'cp');
    const w = screen.getByLabelText('Grapefruit allergens').textContent!;
    expect(w).toMatch(/This oil carries Limonene, Citral, Geraniol/);
    expect(w).toMatch(/expect to name them on the label/);
    expect(w).toMatch(/supplier's allergen declaration/);
    // and the section foot lists them, by name, no share
    expect(screen.getByText(/Expect to name on the label:/).parentElement!.textContent).toMatch(/Limonene, Citral, Geraniol/);
  });

  it('says nothing about allergens for an oil that carries none, or one the maker named', () => {
    renderPanel(picked('tea-tree'), 'cp');
    expect(screen.queryByLabelText('Tea tree allergens')).toBeNull();
    cleanup();
    renderPanel(normalizeScentColor({ fragrances: [{ name: 'Mine', percent: '3' }], colorants: [], portions: [] }), 'cp');
    expect(screen.queryByLabelText(/allergens$/)).toBeNull();
    // An oil the app does not list has no ceiling on record: the line says where one comes from.
    const safe = screen.getByLabelText('Mine safe use').textContent!;
    expect(safe).toMatch(/No ceiling is known for an oil the app does not list/);
    expect(safe).toMatch(/supplier's IFRA certificate/);
    expect(safe).toMatch(/bars usually carry 2–6% of oil weight/);
  });

  it('gives the catalog ceiling, in both bases, with the sentence behind it — and marks a dose over it', () => {
    // Clove: EU law's 0.001% methyl eugenol ÷ 0.1% of the oil → 1.0% of the bar. At 1% of
    // 1000 g oils that is 10 g of a 1300 g bar, 0.8%; the ceiling solved back to the oils is
    // 1% × 1290 ÷ 0.99 = 13.0 g → 1.3% of oil weight.
    renderPanel(picked('clove', '1'), 'cp');
    let safe = screen.getByLabelText('Clove safe use').textContent!;
    expect(safe).toMatch(/Up to 1% of the finished bar \(about 1\.3% of oil weight in this recipe\)/);
    expect(safe).toMatch(/EU law \(Annex III\) caps methyl eugenol/);
    expect(safe).toMatch(/This dose is 0\.8%\./);
    expect(safe).not.toMatch(/over it/);
    cleanup();
    // 3% of the oils is 2.3% of the bar — past it.
    renderPanel(picked('clove', '3'), 'cp');
    safe = screen.getByLabelText('Clove safe use').textContent!;
    expect(safe).toMatch(/This dose is 2\.3% — over it\./);
    cleanup();
    // Ylang ylang: IFRA's own standard for the oil.
    renderPanel(picked('ylang-ylang', '2'), 'cp');
    safe = screen.getByLabelText('Ylang ylang safe use').textContent!;
    expect(safe).toMatch(/Up to 1\.4% of the finished bar/);
    expect(safe).toMatch(/IFRA's own standard for ylang ylang extracts/);
    expect(safe).toMatch(/This dose is 1\.5% — over it\./); // 20 g of the fixture's 1300 g bar
  });

  it('says plainly when the catalog has no ceiling for the oil, and falls back to the usual range', () => {
    renderPanel(picked('lavender'), 'cp');
    const safe = screen.getByLabelText('Lavender safe use').textContent!;
    expect(safe).toMatch(/IFRA sets no ceiling for this oil in soap and EU law names no limit on it/);
    expect(safe).toMatch(/bars usually carry 2–6% of oil weight/);
    expect(safe).toMatch(/This dose is 2\.3% of the finished bar\./);
    expect(safe).not.toMatch(/Up to/);
    expect(safe).not.toMatch(/Max in product/);
  });

  it('a ceiling above anything a bar carries is not printed as "safe use"', () => {
    // Geranium: geraniol 2.8% ÷ 17.7% → 15.8% of the bar, far past the usual 2–6% of oils.
    renderPanel(picked('geranium', '3'), 'cp');
    const safe = screen.getByLabelText('Geranium safe use').textContent!;
    expect(safe).toMatch(/No ceiling bites below the usual range: this oil's works out at 15\.8% of the finished bar/);
    expect(safe).toMatch(/IFRA caps geraniol at 2\.8%/);
    expect(safe).toMatch(/bars usually carry 2–6% of oil weight/);
    expect(safe).not.toMatch(/Up to/);
  });

  it('warns past the usual range, in the dose basis, whatever the oil', () => {
    renderPanel(picked('lavender', '8'), 'cp');
    expect(screen.getByText('8% of oil weight is past the 2–6% of oil weight bars usually carry — no book or standard stands behind more.').className).toBe('additive-list__hazard');
    cleanup();
    renderPanel(picked('lavender', '6'), 'cp');
    expect(screen.queryByText(/is past the 2–6%/)).toBeNull();
    cleanup();
    renderPanel(picked('lavender', '4'), 'ls', 'g', 3000);
    expect(screen.getByText(/4% of solution is past the 3% of the finished solution liquid soap carries at most/)).toBeTruthy();
  });
});
