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
      .toEqual(['Colorant', 'Name', 'Kind', 'Dose', 'Portion', 'Add at', 'Adds']);
  });

  it('offers two buttons — the whole batter, or this colour\'s own portion', () => {
    const onChange = renderPanel(blueMica, 'cp');
    const seg = screen.getByRole('radiogroup', { name: /Blue mica portion/ });
    expect([...seg.querySelectorAll('label')].map((n) => n.textContent)).toEqual(['Whole batter', 'Portion']);
    expect((screen.getByRole('radio', { name: 'Whole batter' }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: 'Portion' }));
    const next = onChange.mock.calls[0][0] as ScentColor;
    // One gesture: the share exists AND belongs to this colour. It carries no name of its
    // own — the manifest reads that off the colour, so nothing can go stale.
    expect(next.portions).toHaveLength(1);
    expect(next.portions[0].name).toBe('');
    expect(next.colorants[0].portionKey).toBe(next.portions[0].key);
  });

  it('handing the share back takes the portion with it', () => {
    const scent = normalizeScentColor({
      fragrances: [],
      colorants: [{ name: 'Blue mica', kind: 'mica', percent: '1', portionKey: '#0' }],
      portions: [{ name: 'Blue mica', percent: '40' }],
    });
    const onChange = renderPanel(scent, 'cp');
    expect((screen.getByRole('radio', { name: 'Portion' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Whole batter' }));
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.colorants[0].portionKey).toBe('');
    expect(next.portions).toEqual([]);
  });

  it('a share another colour still sits in is left alone', () => {
    // A recipe saved when two colours could share one portion still loads and still works.
    const shared = normalizeScentColor({
      fragrances: [],
      colorants: [
        { name: 'Blue mica', kind: 'mica', percent: '1', portionKey: '#0' },
        { name: 'Gold mica', kind: 'mica', percent: '1', portionKey: '#0' },
      ],
      portions: [{ name: 'Swirl', percent: '40' }],
    });
    const onChange = renderPanel(shared, 'cp');
    fireEvent.click(screen.getAllByRole('radio', { name: 'Whole batter' })[0]);
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.colorants[0].portionKey).toBe('');
    expect(next.portions).toHaveLength(1);
    expect(next.colorants[1].portionKey).toBe(next.portions[0].key);
  });

  it('the share is entered on the colour it belongs to, and only while it has one', () => {
    renderPanel(blueMica, 'cp');
    expect(screen.queryByLabelText(/share of the batter/i)).toBeNull();
    cleanup();
    const scent = normalizeScentColor({
      fragrances: [],
      colorants: [{ name: 'Blue mica', kind: 'mica', percent: '1', portionKey: '#0' }],
      portions: [{ name: 'Blue mica', percent: '40' }],
    });
    const onChange = renderPanel(scent, 'cp');
    const share = screen.getByLabelText(/Blue mica share of the batter/) as HTMLInputElement;
    expect(share.value).toBe('40');
    expect(share.closest('.ledger__figure')!.querySelector('.ledger__unit')!.textContent).toBe('% of batter');
    fireEvent.change(share, { target: { value: '25' } });
    expect((onChange.mock.calls[0][0] as ScentColor).portions[0].percent).toBe('25');
  });

  it('a repick keeps the share, and never overwrites a name the maker typed', () => {
    const scent = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'mica', name: 'Mica', kind: 'mica', percent: '1', portionKey: '#0' }],
      // A name from an older build, which no control can retype: it must survive a repick.
      portions: [{ name: 'Top layer', percent: '40' }],
    });
    const onChange = renderPanel(scent, 'cp');
    fireEvent.change(screen.getByLabelText(/Colorant for/), { target: { value: 'kaolin-clay' } });
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.portions[0]).toMatchObject({ name: 'Top layer', percent: '40' });
    expect(next.colorants[0].portionKey).toBe(next.portions[0].key);
  });

  describe('a share cannot outlive the colour that asked for it', () => {
    const coloured = () => normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'madder-root', name: 'Madder root', kind: 'natural', percent: '0.88', portionKey: '#0' }],
      portions: [{ name: '', percent: '40' }],
    });

    it('deleting the colour takes its share with it', () => {
      const onChange = renderPanel(coloured(), 'cp');
      fireEvent.click(screen.getByRole('button', { name: /^Remove Madder root$/ }));
      const next = onChange.mock.calls[0][0] as ScentColor;
      expect(next.colorants).toEqual([]);
      // Left behind, it would still count toward the total with no control able to reach it.
      expect(next.portions).toEqual([]);
    });

    it('sending the colour through the lye hands its share back', () => {
      const onChange = renderPanel(coloured(), 'cp');
      fireEvent.click(screen.getByRole('radio', { name: 'In lye water' }));
      const next = onChange.mock.calls[0][0] as ScentColor;
      expect(next.portions).toEqual([]);
      // and the row does not keep pointing at a share that no longer exists
      expect(next.colorants[0].portionKey).toBe('');
      expect(next.colorants[0].viaLye).toBe(true);
    });

    it('a share another colour still sits in is left where it is', () => {
      const shared = normalizeScentColor({
        fragrances: [],
        colorants: [
          { name: 'Blue mica', kind: 'mica', percent: '1', portionKey: '#0' },
          { name: 'Gold mica', kind: 'mica', percent: '1', portionKey: '#0' },
        ],
        portions: [{ name: 'Swirl', percent: '40' }],
      });
      const onChange = renderPanel(shared, 'cp');
      fireEvent.click(screen.getByRole('button', { name: /^Remove Blue mica$/ }));
      const next = onChange.mock.calls[0][0] as ScentColor;
      expect(next.portions).toHaveLength(1);
      expect(next.colorants[0].portionKey).toBe(next.portions[0].key);
    });
  });

  it('the share row carries a visible label and a figure slab, like every other row', () => {
    const withPortion = normalizeScentColor({
      fragrances: [],
      colorants: [{ name: 'Swirl', kind: 'mica', percent: '1', portionKey: '#0' }],
      portions: [{ name: 'Swirl', percent: '40' }],
    });
    renderPanel(withPortion, 'cp');
    const share = screen.getByLabelText(/Swirl share of the batter/);
    expect(share.closest('label')!.querySelector('.micro-label')!.textContent).toBe('Share');
    expect(share.closest('.ledger__figure')!.querySelector('.ledger__unit')!.textContent).toBe('% of batter');
  });

  it('an over-100 share can still be typed and is still flagged, not clamped away', () => {
    const over = normalizeScentColor({
      fragrances: [],
      colorants: [{ name: 'Swirl', kind: 'mica', percent: '1', portionKey: '#0' }],
      portions: [{ name: 'Swirl', percent: '150' }],
    });
    renderPanel(over, 'cp');
    const share = screen.getByLabelText(/Swirl share of the batter/) as HTMLInputElement;
    expect(share.value).toBe('150');
    // No max attribute: clamping would hide the very mistake the footer points out.
    expect(share.getAttribute('max')).toBeNull();
    expect(share.validity.rangeOverflow).toBe(false);
    expect(screen.getByText(/over 100%/)).toBeTruthy();
  });

  it('every visible label is part of the control\'s accessible name', () => {
    const withPortion = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'madder-root', name: 'Madder root', kind: 'natural', percent: '1', portionKey: '#0' }],
      portions: [{ name: 'Madder root', percent: '40' }],
    });
    renderPanel(withPortion, 'cp');
    const named = (visible: string, control: HTMLElement) =>
      (control.getAttribute('aria-label') ?? '').toLowerCase().includes(visible.toLowerCase());
    expect(named('Share', screen.getByLabelText(/Madder root share of the batter/))).toBe(true);
    expect(named('Portion', screen.getByRole('radiogroup', { name: /Madder root portion/ }))).toBe(true);
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
    // A bottle has no batter to divide, so the row carries no portion control at all.
    cleanup();
    renderPanel(blueMica, 'ls');
    expect(screen.queryByRole('radiogroup', { name: /portion$/i })).toBeNull();
    // and the panel head has no split button in any process — the split is made per colour
    cleanup();
    renderPanel(createEmptyScentColor(), 'cp');
    expect(screen.queryByRole('button', { name: /split the batter/i })).toBeNull();
  });

  it('shows the guidance in the active unit, the dispersal line, and "to shade" without a dose', () => {
    renderPanel(blueMica, 'cp', 'lb');
    expect(screen.getByText(/About 0\.4–1\.8% of the oils, which is ½–2 tsp per lb/)).toBeTruthy();
    expect(screen.getByText(/to shade/i)).toBeTruthy();
    expect(screen.getByText(/1:1 with a light carrier oil/i)).toBeTruthy();
    cleanup();
    renderPanel(blueMica, 'cp', 'g');
    expect(screen.getByText(/which is 1–4½ tsp per kg/)).toBeTruthy();
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
    expect(screen.getByText(/0\.1% light grey/)).toBeTruthy();
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

describe('the per-process copy states what the sources state', () => {
  const empty = createEmptyScentColor();

  it('HP names the alternatives the source offers, instead of one solvent as the rule', () => {
    renderPanel(empty, 'hp');
    const copy = screen.getByText(/One colour for the whole batch/).textContent!;
    expect(copy).toMatch(/hot sugar water/i);
    expect(copy).toMatch(/post-cook superfat/i); // oil route, which the app already models
    expect(copy).toMatch(/glycerin/i);           // the one it advises against
  });

  it('LS steers to a water-soluble dye and warns that pigments sediment', () => {
    renderPanel(empty, 'ls');
    const copy = screen.getByText(/Colour goes in after the dilution/).textContent!;
    expect(copy).toMatch(/water-soluble/i);
    expect(copy).toMatch(/sink to the bottom/i);
    // the oils themselves are a colorant in liquid soap
    expect(copy).toMatch(/hemp reads green/i);
  });

  it('LS prescribes no water temperature, because no source gives one', () => {
    // A custom row: no dye is named in the catalog, but the kind is still choosable.
    const dye = normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ catalogId: '', name: 'My dye', kind: 'dye', percent: '', portionKey: '' }],
    });
    renderPanel(dye, 'ls');
    expect(screen.getByText(/Stir straight into the diluted soap/)).toBeTruthy();
    expect(screen.queryByText(/warm water/i)).toBeNull();
  });
});

describe('the kind seg explains the cell it has selected', () => {
  const custom = (kind: string) =>
    normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ catalogId: '', name: 'Mine', kind, percent: '', portionKey: '' }],
    });

  it('says what Other actually means, since it is the one cell with no dose range', () => {
    renderPanel(custom('other'), 'cp');
    const note = screen.getByText(/Anything outside those four/);
    expect(note.textContent).toMatch(/glitter/i);
    expect(note.textContent).toMatch(/no sourced rate/i);
    // and it is the only kind the app offers no band for
    expect(screen.queryByText(/tsp per/)).toBeNull();
  });

  it('explains every other kind too, and only where the choice is actually offered', () => {
    for (const [kind, phrase] of [['mica', /labelled for cold process/i], ['oxide', /will not bleed/i], ['natural', /many plant colours fade/i], ['dye', /creeps across a layer line/i]] as const) {
      cleanup();
      renderPanel(custom(kind), 'cp');
      expect(screen.getByText(phrase)).toBeTruthy();
    }
    // A catalog pick states its kind, so there is no cell to explain.
    cleanup();
    renderPanel(normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ catalogId: 'madder-root', name: 'Madder root', kind: 'natural', percent: '', portionKey: '' }],
    }), 'cp');
    expect(screen.queryByText(/many plant colours fade/i)).toBeNull();
  });
});

describe('picking a colour seeds its gentlest sourced dose', () => {
  it('fills the field with the low end of that colour\'s own band, editable', () => {
    const onChange = renderPanel(blueMica, 'cp');
    fireEvent.change(screen.getByLabelText(/Colorant for/), { target: { value: 'activated-charcoal' } });
    const next = onChange.mock.calls[0][0] as ScentColor;
    // charcoal's band starts at 1/8 tsp per lb, which is about 0.1% of the oils
    expect(next.colorants[0]).toMatchObject({ catalogId: 'activated-charcoal', percent: '0.11' });
  });

  it('seeds nothing for a colour the sources give no rate for', () => {
    // Indigo HAS a rate, so it seeds like any other; alkanet's only route is an infusion.
    const onChange = renderPanel(blueMica, 'cp');
    fireEvent.change(screen.getByLabelText(/Colorant for/), { target: { value: 'indigo' } });
    expect((onChange.mock.calls[0][0] as ScentColor).colorants[0].percent).toBe('0.22');
    cleanup();
    const onChange2 = renderPanel(blueMica, 'cp');
    fireEvent.change(screen.getByLabelText(/Colorant for/), { target: { value: 'alkanet-root' } });
    expect((onChange2.mock.calls[0][0] as ScentColor).colorants[0].percent).toBe('');
  });

  it('Custom… hands the dose back along with the name and the kind', () => {
    const picked = normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ catalogId: 'madder-root', name: 'Madder root', kind: 'natural', percent: '0.44', portionKey: '' }],
    });
    const onChange = renderPanel(picked, 'cp');
    fireEvent.change(screen.getByLabelText(/Colorant for/), { target: { value: '' } });
    expect((onChange.mock.calls[0][0] as ScentColor).colorants[0]).toMatchObject({ catalogId: '', percent: '' });
  });
});

describe('the lye-solution route', () => {
  const routed = normalizeScentColor({
    fragrances: [],
    colorants: [{ catalogId: 'madder-root', name: 'Madder root', kind: 'natural', percent: '0.88', portionKey: '' }],
    portions: [],
  });

  it('turns "Add at" into a choice only for a colour a source puts in the lye', () => {
    renderPanel(routed, 'cp');
    const seg = screen.getByRole('radiogroup', { name: /Add at for Madder root/ });
    expect([...seg.querySelectorAll('label')].map((n) => n.textContent)).toEqual(['With oils', 'In lye water']);
    cleanup();
    // A mica has no such source, so its stage stays a statement.
    renderPanel(blueMica, 'cp');
    expect(screen.queryByRole('radiogroup', { name: /Add at/ })).toBeNull();
  });

  it('is cold-process only — the sources cover no other process', () => {
    for (const process of ['hp', 'ls'] as const) {
      renderPanel(routed, process);
      expect(screen.queryByRole('radiogroup', { name: /Add at/ })).toBeNull();
      cleanup();
    }
  });

  it('choosing it reports the choice up, and the route note appears once chosen', () => {
    const onChange = renderPanel(routed, 'cp');
    expect(screen.queryByText(/Through the lye/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'In lye water' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].colorants[0].viaLye).toBe(true);

    cleanup();
    const viaLye = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'madder-root', name: 'Madder root', kind: 'natural', percent: '0.88', portionKey: '', viaLye: true }],
      portions: [],
    });
    renderPanel(viaLye, 'cp');
    expect(screen.getByText(/Through the lye/)).toBeTruthy();
    // the caustic caution, and the absorption failure for a natural colour
    expect(screen.getByText(/at arm's length/)).toBeTruthy();
    expect(screen.getByText(/never set at 30 g of root/)).toBeTruthy();
    // no other solvent: it does not also ask for a carrier oil
    expect(screen.getByText(/Stir into the lye solution itself/)).toBeTruthy();
  });

  it('a lye colour cannot also claim a portion — it is in the pot before the batter exists', () => {
    const split = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'madder-root', name: 'Madder root', kind: 'natural', percent: '0.88', portionKey: 'p1', viaLye: true }],
      portions: [{ key: 'p1', name: 'Swirl', percent: '40' }],
    });
    renderPanel(split, 'cp');
    // the whole batter's worth, not 40% of it
    expect(screen.getByText('8.8 g')).toBeTruthy();
  });
});

it('a lye colour has no portion control and no share — there is no batter to split yet', () => {
  const split = normalizeScentColor({
    fragrances: [],
    colorants: [{ catalogId: 'madder-root', name: '', kind: 'natural', percent: '0.88', portionKey: '#0', viaLye: true }],
    portions: [{ name: 'Swirl', percent: '40' }],
  });
  // The share went with the route, on load as in the panel: nothing could reach it.
  expect(split.portions).toEqual([]);
  renderPanel(split, 'cp');
  expect(screen.queryByRole('radiogroup', { name: /portion$/i })).toBeNull();
  expect(screen.queryByLabelText(/share of the batter/i)).toBeNull();
  expect(screen.getByRole('radio', { name: 'In lye water' })).toBeTruthy();
});


describe('the cautions follow the hazard, not the kind', () => {
  const routed = (catalogId: string) => normalizeScentColor({
    fragrances: [],
    colorants: [{ catalogId, name: '', kind: 'natural', percent: '0.88', portionKey: '', viaLye: true }],
    portions: [],
  });

  it('warns about swollen pieces only where pieces are strained back out', () => {
    renderPanel(routed('madder-root'), 'cp');
    expect(screen.getByText(/never set at 30 g of root/)).toBeTruthy();
    cleanup();
    // A clay powder is never lifted out, so it cannot take the alkali with it.
    renderPanel(routed('kaolin-clay'), 'cp');
    expect(screen.queryByText(/never set at 30 g of root/)).toBeNull();
    // The caustic warning still applies to every route.
    expect(screen.getByText(/at arm's length/)).toBeTruthy();
  });

  it('spares a mineral the plant-pigment caution', () => {
    renderPanel(routed('kaolin-clay'), 'cp');
    expect(screen.queryByText(/anthocyanins in berries/)).toBeNull();
    cleanup();
    renderPanel(routed('spirulina'), 'cp');
    expect(screen.getByText(/anthocyanins in berries/)).toBeTruthy();
  });

  it('never tells the maker to wet a colour the lye has already wetted', () => {
    renderPanel(routed('kaolin-clay'), 'cp');
    const text = document.querySelector('.additive-list')!.textContent!;
    expect(text).toContain('needs no other solvent');
    expect(text).toContain('Unless it is going through the lye, wet it in water');
  });
});

describe('picking a different colorant', () => {
  it('does not carry the lye route across to the new material', () => {
    const scent = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'madder-root', name: '', kind: 'natural', percent: '0.44', portionKey: '', viaLye: true }],
      portions: [],
    });
    const onChange = renderPanel(scent, 'cp');
    fireEvent.change(screen.getByLabelText(/Colorant for/), { target: { value: 'kaolin-clay' } });
    expect(onChange.mock.calls[0][0].colorants[0]).toMatchObject({ catalogId: 'kaolin-clay', viaLye: false });
    cleanup();
    // and a custom row cannot keep a route either
    const onChange2 = renderPanel(scent, 'cp');
    fireEvent.change(screen.getByLabelText(/Colorant for/), { target: { value: '' } });
    expect(onChange2.mock.calls[0][0].colorants[0]).toMatchObject({ catalogId: '', viaLye: false });
  });
});

it('a purée says it is also a liquid the water budget can size', () => {
  const scent = normalizeScentColor({
    fragrances: [],
    colorants: [{ catalogId: 'carrot-puree', name: '', kind: 'natural', percent: '', portionKey: '', viaLye: true }],
    portions: [],
  });
  renderPanel(scent, 'cp');
  expect(screen.getByText(/Also a liquid: entered under Split liquid/)).toBeTruthy();
  // and the route note points at the same place instead of asking for arithmetic
  const text = document.querySelector('.additive-list')!.textContent!;
  expect(text).toContain('Enter it as a split liquid and that water comes out for you');
  expect(text).not.toContain('take the same weight off');
});
