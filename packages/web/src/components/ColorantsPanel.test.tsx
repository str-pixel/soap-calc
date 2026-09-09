// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ColorantsPanel } from './ColorantsPanel';
import { createEmptyScentColor, normalizeScentColor, type ScentColor } from '../lib/scentColor';
import { computedScent } from '../testing/scentFixtures';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function renderPanel(scent: ScentColor, process: ProcessId, unit: 'g' | 'lb' = 'g', productGrams: number | null = 1300) {
  const computed = computedScent(scent, { process, totalOilGrams: 1000, solutionGrams: 3000, productGrams });
  const onChange = vi.fn();
  render(<ColorantsPanel scent={scent} computed={computed} process={process} weightUnit={unit} onChange={onChange} />);
  return onChange;
}

const blueMica = normalizeScentColor({
  fragrances: [],
  colorants: [{ name: 'Blue mica', kind: 'mica', percent: '', portionKey: '' }],
  portions: [],
});

describe('ColorantsPanel', () => {
  it('is its own numbered section, with no fragrance controls in it', () => {
    renderPanel(createEmptyScentColor(), 'cp');
    expect(screen.getByRole('heading', { name: /Colorants/ }).textContent).toBe('07Colorants');
    expect(screen.queryByRole('button', { name: /add fragrance/i })).toBeNull();
    expect(screen.getByText(/No colour yet/i)).toBeTruthy();
  });

  it('the colorant name field carries a VISIBLE label, not just a placeholder', () => {
    renderPanel(blueMica, 'cp');
    const input = screen.getByLabelText('Colorant name');
    expect(input).toBeTruthy();
    // A ledger row: the label sits in the row's own label column, same as an additive's.
    expect(input.closest('label')!.querySelector('.micro-label')!.textContent).toBe('Name');
    expect((input as HTMLInputElement).value).toBe('Blue mica');
  });

  it('lays a row out like an additive row: ledger rows under a shared label column', () => {
    renderPanel(blueMica, 'cp');
    const row = document.querySelector('.additive-list__row')!;
    // the pick and its × share the names grid
    expect(row.querySelector('.additive-list__names select')).toBeTruthy();
    // every row names its own primary control, the way the portion row does
    // dose is a figure slab with its unit inside, not a full-width box
    const dose = row.querySelector('.additive-list__amount .ledger__figure')!;
    expect(dose.querySelector('input.figure-field')).toBeTruthy();
    expect(dose.querySelector('.ledger__unit')!.textContent).toBe('% of oils');
    // every labelled block names itself in the label column
    expect([...row.querySelectorAll('.micro-label')].map((n) => n.textContent))
      .toEqual(['Colorant', 'Name', 'Kind', 'Dose', 'Add at', 'Adds']);
  });

  it('offers no Portion control until the batter has actually been split', () => {
    renderPanel(blueMica, 'cp');
    expect(screen.queryByLabelText(/portion$/i)).toBeNull();
    cleanup();
    const withPortion = normalizeScentColor({
      fragrances: [],
      colorants: [{ name: 'Blue mica', kind: 'mica', percent: '', portionKey: '' }],
      portions: [{ name: 'Swirl', percent: '40' }],
    });
    renderPanel(withPortion, 'cp');
    const picker = screen.getByLabelText(/portion$/i) as HTMLSelectElement;
    expect([...picker.options].map((o) => o.text)).toEqual(['Whole batter', 'Swirl']);
  });

  it('the portion row carries a visible label and a figure slab, like every other row', () => {
    const withPortion = normalizeScentColor({ fragrances: [], colorants: [], portions: [{ name: 'Swirl', percent: '40' }] });
    renderPanel(withPortion, 'cp');
    const input = screen.getByLabelText('Portion name');
    expect(input.closest('.additive-list__choice')!.querySelector('.micro-label')!.textContent).toBe('Portion');
    const share = screen.getByLabelText(/Portion Swirl share/);
    expect(share.closest('label')!.querySelector('.micro-label')!.textContent).toBe('Share');
    expect(share.closest('.ledger__figure')!.querySelector('.ledger__unit')!.textContent).toBe('% of batter');
  });

  it('an over-100 share can still be typed and is still flagged, not clamped away', () => {
    const over = normalizeScentColor({ fragrances: [], colorants: [], portions: [{ name: 'Swirl', percent: '150' }] });
    renderPanel(over, 'cp');
    const share = screen.getByLabelText(/Portion Swirl share/) as HTMLInputElement;
    expect(share.value).toBe('150');
    // No max attribute: clamping would hide the very mistake the footer points out.
    expect(share.getAttribute('max')).toBeNull();
    expect(share.validity.rangeOverflow).toBe(false);
    expect(screen.getByText(/over 100%/)).toBeTruthy();
  });

  it('every visible label is part of the control\'s accessible name', () => {
    const withPortion = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'madder-root', name: 'Madder root', kind: 'natural', percent: '1', portionKey: '' }],
      portions: [{ name: 'Swirl', percent: '40' }],
    });
    renderPanel(withPortion, 'cp');
    const named = (visible: string, control: HTMLElement) =>
      (control.getAttribute('aria-label') ?? '').toLowerCase().includes(visible.toLowerCase());
    expect(named('Share', screen.getByLabelText(/Portion Swirl share/))).toBe(true);
    expect(named('Portion', screen.getByLabelText('Portion name'))).toBe(true);
    expect(named('Dose', screen.getByLabelText(/Madder root dose/))).toBe(true);
    expect(named('Colorant', screen.getByLabelText(/Colorant for/))).toBe(true);
  });

  it('the dose slab carries no placeholder — it would collide with the unit inside it', () => {
    renderPanel(blueMica, 'cp');
    const dose = screen.getByLabelText(/Blue mica dose/) as HTMLInputElement;
    expect(dose.placeholder).toBe('');
    // "to shade" is said where there is room for it
    expect(screen.getByText('to shade')).toBeTruthy();
  });

  it('typing a name reaches the caller', () => {
    const onChange = renderPanel(blueMica, 'cp');
    fireEvent.change(screen.getByLabelText('Colorant name'), { target: { value: 'Ultramarine' } });
    expect((onChange.mock.calls[0][0] as ScentColor).colorants[0].name).toBe('Ultramarine');
  });

  it('adds a colorant (Dye and an empty dose in LS) and offers no batter split there', () => {
    const onChange = renderPanel(createEmptyScentColor(), 'ls');
    fireEvent.click(screen.getByRole('button', { name: /add colorant/i }));
    expect((onChange.mock.calls[0][0] as ScentColor).colorants[0]).toMatchObject({ kind: 'dye', percent: '' });
    expect(screen.queryByRole('button', { name: /split the batter/i })).toBeNull();
    cleanup();
    const onChangeCp = renderPanel(createEmptyScentColor(), 'cp');
    fireEvent.click(screen.getByRole('button', { name: /split the batter/i }));
    expect((onChangeCp.mock.calls[0][0] as ScentColor).portions).toHaveLength(1);
  });

  it('shows the guidance in the active unit, the dispersal line, and "to shade" without a dose', () => {
    renderPanel(blueMica, 'cp', 'lb');
    expect(screen.getByText(/½–1 tsp per lb of oils/)).toBeTruthy();
    expect(screen.getByText(/to shade/i)).toBeTruthy();
    expect(screen.getByText(/1:1 with a light carrier oil/i)).toBeTruthy();
    cleanup();
    renderPanel(blueMica, 'cp', 'g');
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

  it('an HP whole-batter colour is told to go straight into the oils', () => {
    const scentHp = normalizeScentColor({ fragrances: [], colorants: [{ name: 'Red oxide', kind: 'oxide', percent: '1', portionKey: '' }], portions: [] });
    renderPanel(scentHp, 'hp');
    expect(screen.getByText(/Stir straight into the warmed oils/i)).toBeTruthy();
    expect(screen.getByText('With oils')).toBeTruthy();
    // and the intro does not repeat the row's own sentence
    expect(screen.getAllByText(/straight into the warmed oils/i)).toHaveLength(1);
  });

  it('offers the catalog as a grouped picker, with Custom first', () => {
    renderPanel(blueMica, 'cp');
    const picker = screen.getByLabelText(/Colorant for/) as HTMLSelectElement;
    expect(picker.options[0].text).toBe('Custom…');
    const groups = Array.from(picker.querySelectorAll('optgroup')).map((g) => g.getAttribute('label'));
    expect(groups).toContain('Any colour');
    expect(groups).toContain('Red and pink');
    expect(Array.from(picker.querySelectorAll('option')).map((o) => o.textContent)).toContain('Madder root');
  });

  it('picking a catalog colour adopts its name and kind, and drops the controls it settles', () => {
    const onChange = renderPanel(blueMica, 'cp');
    fireEvent.change(screen.getByLabelText(/Colorant for/), { target: { value: 'madder-root' } });
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.colorants[0]).toMatchObject({ catalogId: 'madder-root', name: 'Madder root', kind: 'natural' });
  });

  it('a catalog row states its kind instead of offering the control, and a custom row keeps it', () => {
    const picked = normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ catalogId: 'madder-root', name: 'Madder root', kind: 'natural', percent: '', portionKey: '' }],
    });
    renderPanel(picked, 'cp');
    expect(screen.queryByRole('radiogroup', { name: /^Kind of/ })).toBeNull();
    expect(screen.queryByLabelText('Colorant name')).toBeNull();
    expect(screen.getByText('Natural powder')).toBeTruthy();
    cleanup();
    renderPanel(blueMica, 'cp');
    expect(screen.getByRole('radiogroup', { name: /^Kind of/ })).toBeTruthy();
    expect(screen.getByLabelText('Colorant name')).toBeTruthy();
  });

  it('carries the picked colour\'s own warning, and the natural-pigment caution', () => {
    const beet = normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ catalogId: 'beet-root', name: 'Beet root', kind: 'natural', percent: '', portionKey: '' }],
    });
    renderPanel(beet, 'cp');
    expect(screen.getByText(/never the red it is in the jar/i)).toBeTruthy();
    expect(screen.getByText(/anthocyanins in berries/i)).toBeTruthy();
  });

  it('a dual-purpose material says where else it belongs', () => {
    const clay = normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ catalogId: 'kaolin-clay', name: 'Kaolin clay', kind: 'natural', percent: '', portionKey: '' }],
    });
    renderPanel(clay, 'cp');
    expect(screen.getByText(/Also covered under Additives/i)).toBeTruthy();
  });

  it('an unknown catalog id falls back to a custom row, keeping the name', () => {
    const stale = normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ catalogId: 'retired-pigment', name: 'Old pigment', kind: 'natural', percent: '1', portionKey: '' }],
    });
    renderPanel(stale, 'cp');
    expect((screen.getByLabelText('Colorant name') as HTMLInputElement).value).toBe('Old pigment');
    expect((screen.getByLabelText(/Colorant for/) as HTMLSelectElement).value).toBe('');
  });

  it('stops adding at the cap the loader applies', () => {
    const full = normalizeScentColor({
      fragrances: [],
      colorants: Array.from({ length: 20 }, (_, i) => ({ name: `C${i}`, kind: 'mica', percent: '', portionKey: '' })),
      portions: [],
    });
    renderPanel(full, 'cp');
    expect((screen.getByRole('button', { name: /add colorant/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('how much, what shade, and what happens over time', () => {
  const pick = (catalogId: string) =>
    normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ catalogId, name: '', kind: 'natural', percent: '', portionKey: '' }],
    });

  it('a picked colour states its dose, its shade ladder and its keeping', () => {
    renderPanel(pick('activated-charcoal'), 'cp');
    expect(screen.getByText(/How dark it goes/)).toBeTruthy();
    expect(screen.getByText(/Teaspoons per kg of oils/)).toBeTruthy();
    // The ladder replaces the plain band rather than sitting beside it.
    expect(screen.queryByText(/density varies by product/)).toBeNull();
    expect(screen.getByText(/light grey/)).toBeTruthy();
    expect(screen.getByText(/black, noticeably grey lather/)).toBeTruthy();
    expect(screen.getByText(/Over time/)).toBeTruthy();
    expect(screen.getByText(/Holds its colour/)).toBeTruthy();
  });

  it('a colour that fades says so', () => {
    renderPanel(pick('spirulina'), 'cp');
    expect(screen.getByText(/Fades with time and light/)).toBeTruthy();
  });

  it('says nothing rather than guessing where no source gives a ladder or a verdict', () => {
    renderPanel(pick('woad'), 'cp');
    expect(screen.queryByText(/How dark it goes/)).toBeNull();
    expect(screen.queryByText(/Over time/)).toBeNull();
  });
});
