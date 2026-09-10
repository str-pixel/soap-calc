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
    expect(named('Max in product', screen.getByLabelText(/Vanilla dream max in product/))).toBe(true);
    expect(named('Vanillin', screen.getByLabelText(/Vanilla dream vanillin/))).toBe(true);
    expect(named('Essential oil', screen.getByLabelText('Essential oil name'))).toBe(true);
  });

  it('lays a row out like an additive row, with its units inside the figure slabs', () => {
    renderPanel(vanilla, 'cp');
    const row = document.querySelector('.additive-list__row')!;
    expect([...row.querySelectorAll('.micro-label')].map((n) => n.textContent))
      .toEqual(['Essential oil', 'Name', 'Dose', 'Max in product', 'Vanillin', 'Add at', 'Adds']);
    expect([...row.querySelectorAll('.ledger__unit')].map((n) => n.textContent))
      .toEqual(['% of oil weight', '%', '%']);
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

describe('picking an essential oil', () => {
  const empty = createEmptyScentColor();

  it('offers the catalog, with Custom first', () => {
    const onChange = renderPanel(normalizeScentColor({ fragrances: [{ name: '', percent: '' }], colorants: [], portions: [] }), 'cp');
    const picker = screen.getByLabelText(/Essential oil for/) as HTMLSelectElement;
    expect([...picker.options][0].text).toBe('Custom…');
    expect([...picker.options].map((o) => o.value)).toContain('lavender');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fills the name and the allergens it typically carries, percentages left blank', () => {
    const onChange = renderPanel(normalizeScentColor({ fragrances: [{ name: '', percent: '' }], colorants: [], portions: [] }), 'cp');
    fireEvent.change(screen.getByLabelText(/Essential oil for/), { target: { value: 'lemongrass' } });
    const row = (onChange.mock.calls[0][0] as ScentColor).fragrances[0];
    expect(row).toMatchObject({ catalogId: 'lemongrass', name: 'Lemongrass' });
    expect(row.allergens.map((a) => a.name)).toEqual(['Citral', 'Linalool', 'Geraniol', 'Citronellol', 'Farnesol']);
    // The percentages are the maker's to take off their own declaration.
    expect(row.allergens.every((a) => a.percentOfFragrance === '')).toBe(true);
  });

  it('adds what is missing without overwriting a percentage already typed', () => {
    const typed = normalizeScentColor({
      fragrances: [{ name: 'My lavender', percent: '3', allergens: [{ name: 'Linalool', percentOfFragrance: '28' }] }],
      colorants: [], portions: [],
    });
    const onChange = renderPanel(typed, 'cp');
    fireEvent.change(screen.getByLabelText(/Essential oil for/), { target: { value: 'geranium' } });
    const row = (onChange.mock.calls[0][0] as ScentColor).fragrances[0];
    // The row the maker filled in stays, and only the ones it lacked are added.
    expect(row.allergens[0]).toMatchObject({ name: 'Linalool', percentOfFragrance: '28' });
    expect(row.allergens.map((a) => a.name)).toEqual(['Linalool', 'Citronellol', 'Geraniol', 'Citral', 'Limonene']);
  });

  it('says what a pre-filled list is, and says it only where there is one', () => {
    renderPanel(normalizeScentColor({
      fragrances: [{ catalogId: 'lavender', name: 'Lavender', percent: '3', allergens: [{ name: 'Linalool', percentOfFragrance: '' }] }],
      colorants: [], portions: [],
    }), 'cp');
    expect(screen.getByText(/not a declaration/)).toBeTruthy();
    cleanup();
    renderPanel(normalizeScentColor({ fragrances: [{ name: 'Mine', percent: '3' }], colorants: [], portions: [] }), 'cp');
    expect(screen.queryByText(/not a declaration/)).toBeNull();
  });

  it('Custom… hands the name back and keeps the allergens the maker has', () => {
    const picked = normalizeScentColor({
      fragrances: [{ catalogId: 'clove', name: 'Clove', percent: '1', allergens: [{ name: 'Eugenol', percentOfFragrance: '80' }] }],
      colorants: [], portions: [],
    });
    const onChange = renderPanel(picked, 'cp');
    fireEvent.change(screen.getByLabelText(/Essential oil for/), { target: { value: '' } });
    const row = (onChange.mock.calls[0][0] as ScentColor).fragrances[0];
    expect(row.catalogId).toBe('');
    expect(row.name).toBe('Clove');
    expect(row.allergens[0]).toMatchObject({ name: 'Eugenol', percentOfFragrance: '80' });
  });
  void empty;
});

describe('the line an allergen has to clear', () => {
  const at = (percent: string) =>
    normalizeScentColor({
      fragrances: [{ catalogId: 'patchouli', name: 'Patchouli', percent, allergens: [{ name: 'Limonene', percentOfFragrance: '' }] }],
      colorants: [], portions: [],
    });

  it('states it at this dose, so a trace constituent can be seen not to need naming', () => {
    // 3% of the oils on a 1,300 g bar is about 2.3% of the product → ~0.43% of the oil.
    renderPanel(at('3'), 'cp');
    fireEvent.click(screen.getByText(/Allergens \(1\)/));
    const text = screen.getByText(/At this dose, an allergen has to be more than/).textContent!;
    expect(text).toMatch(/At this dose, an allergen has to be more than/);
    const figure = Number(text.match(/more than ([\d.]+)% of the oil/)![1]);
    expect(figure).toBeGreaterThan(0.4);
    expect(figure).toBeLessThan(0.5);
    // Patchouli's limonene is 0.01–0.3% of the oil — under that line, which is the point.
  });

  it('moves with the dose: more oil, a lower bar', () => {
    const figureAt = (percent: string) => {
      renderPanel(at(percent), 'cp');
      const t = screen.getByText(/At this dose, an allergen has to be more than/).textContent!;
      const n = Number(t.match(/more than ([\d.]+)% of the oil/)![1]);
      cleanup();
      return n;
    };
    expect(figureAt('6')).toBeLessThan(figureAt('3'));
  });

  it('says nothing when there is no dose to work from', () => {
    renderPanel(at(''), 'cp');
    expect(screen.queryByText(/At this dose, an allergen has to be more than/)).toBeNull();
  });
});

describe('what the row says about its allergens without opening anything', () => {
  const picked = (id: string, extra: Record<string, unknown> = {}) => normalizeScentColor({
    fragrances: [{ catalogId: id, name: '', percent: '3', allergens: [], ...extra }],
    colorants: [], portions: [],
  });
  const withRows = (id: string, names: string[]) => normalizeScentColor({
    fragrances: [{ catalogId: id, name: '', percent: '3', allergens: names.map((name) => ({ name, percentOfFragrance: '' })) }],
    colorants: [], portions: [],
  });

  it('the list is open, and the summary itself warns, when the oil carries allergens', () => {
    renderPanel(withRows('bergamot', ['Limonene', 'Linalool', 'Geraniol']), 'cp');
    const details = document.querySelector('details.scent-list__allergens') as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(details.querySelector('summary')!.textContent).toMatch(/this oil carries labelling allergens/);
    cleanup();
    // an oil with none stays closed and says nothing of the sort
    renderPanel(picked('tea-tree'), 'cp');
    const quiet = document.querySelector('details.scent-list__allergens') as HTMLDetailsElement;
    expect(quiet.open).toBe(false);
    expect(quiet.querySelector('summary')!.textContent).not.toMatch(/carries labelling allergens/);
  });

  it('each allergen carries its IFRA soap ceiling where one exists, and none where none does', () => {
    renderPanel(withRows('lemongrass', ['Citral', 'Linalool', 'Geraniol']), 'cp');
    expect(screen.getByLabelText('Citral IFRA ceiling').textContent).toMatch(/1\.2% of the finished soap/);
    expect(screen.getByLabelText('Geraniol IFRA ceiling').textContent).toMatch(/2\.8% of the finished soap/);
    // Linalool has no Category 9 concentration limit; the app says nothing rather than invent one.
    expect(screen.queryByLabelText('Linalool IFRA ceiling')).toBeNull();
  });

  it('the vanillin field is for an oil the maker named, or a row that already has a figure', () => {
    renderPanel(picked('lavender'), 'cp');
    expect(screen.queryByLabelText(/vanillin$/)).toBeNull();
    cleanup();
    renderPanel(picked('lavender', { vanillinPercent: '2' }), 'cp');
    expect(screen.getByLabelText(/vanillin$/)).toBeTruthy();
    cleanup();
    renderPanel(normalizeScentColor({ fragrances: [{ name: 'Vanilla absolute', percent: '2' }], colorants: [], portions: [] }), 'cp');
    expect(screen.getByLabelText(/vanillin$/)).toBeTruthy();
  });
});

describe("the ceiling in the field's own basis", () => {
  const lemongrass = (citral: string) => normalizeScentColor({
    fragrances: [{ catalogId: 'lemongrass', name: '', percent: '3', allergens: [{ name: 'Citral', percentOfFragrance: citral }] }],
    colorants: [], portions: [],
  });

  it('says what the ceiling comes to in this oil at this dose, beside the figure it states', () => {
    renderPanel(lemongrass(''), 'cp');
    const note = screen.getByLabelText('Citral IFRA ceiling').textContent!;
    expect(note).toMatch(/1\.2% of the finished soap/);
    // 30 g in a 1,300 g bar is 2.3% of it; 1.2 ÷ 2.3 → ~52% of the oil
    expect(note).toMatch(/at this dose, 5[12]% of this oil/);
    expect(note).not.toMatch(/over/);
  });

  it('marks a typed figure that is over it', () => {
    renderPanel(lemongrass('80'), 'cp');
    expect(screen.getByLabelText('Citral IFRA ceiling').textContent).toMatch(/over, at the figure typed/);
  });

  it('says a ceiling out of reach at this dose is out of reach, rather than printing 1,023%', () => {
    renderPanel(normalizeScentColor({
      fragrances: [{ catalogId: 'lemongrass', name: '', percent: '3', allergens: [{ name: 'Citronellol', percentOfFragrance: '' }] }],
      colorants: [], portions: [],
    }), 'cp');
    // Citronellol's ceiling is 24% of the soap: on a 2.3% dose that is over 1,000% of the
    // oil, which no share of it can reach.
    const note = screen.getByLabelText('Citronellol IFRA ceiling').textContent!;
    expect(note).toMatch(/out of reach at this dose/);
    expect(note).not.toMatch(/\d{3,}% of this oil/);
  });
});
