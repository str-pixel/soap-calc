// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { SuperfatWaterPanel } from './SuperfatWaterPanel';
import { DEFAULT_SETTINGS, normalizeSettings, type RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function Harness({
  process = 'cp' as ProcessId,
  initial,
}: {
  process?: ProcessId;
  initial?: Partial<RecipeSettings>;
} = {}) {
  const [settings, setSettings] = useState<RecipeSettings>({ ...DEFAULT_SETTINGS, ...initial });
  return (
    <SuperfatWaterPanel
      settings={settings}
      setSettings={setSettings}
      process={process}
      totalOilGrams={1000}
      lyeGrams={140}
      waterGrams={330}
      weightUnit="g"
      waterSuggestion={null}
      lyeWaterStatus={null}
      splitLiquidRows={[]}
      splitAllocation={null}
      acidExtraLye={null}
    />
  );
}

// A one-row post-cook superfat fully allocating a 5% budget, matching the HP process default.
const ONE_PCSF = {
  postCookSuperfatTotalPercent: '5',
  postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '5' }],
};

test('renders the Superfat & water panel heading', () => {
  render(<Harness />);
  expect(screen.getByRole('heading', { name: 'Superfat & water' })).toBeTruthy();
});

test('hosts the Split liquid option (moved here from Settings, alongside the water controls)', () => {
  render(<Harness />);
  expect(screen.getByRole('heading', { name: 'Split liquid' })).toBeTruthy();
});

test('editing the Superfat field updates settings state', () => {
  render(<Harness />);
  const input = screen.getByLabelText('Superfat %') as HTMLInputElement;
  expect(input.value).toBe('5');
  fireEvent.change(input, { target: { value: '8' } });
  expect((screen.getByLabelText('Superfat %') as HTMLInputElement).value).toBe('8');
});

test('Superfat allows a negative min only for LS', () => {
  const { rerender } = render(<Harness process="cp" />);
  expect(screen.getByLabelText('Superfat %').getAttribute('min')).toBe('0');
  rerender(<Harness process="ls" />);
  expect(screen.getByLabelText('Superfat %').getAttribute('min')).toBe('-5');
});

test('changing the water method swaps the editable water-ratio field', () => {
  render(<Harness />);
  expect(screen.getByLabelText('Water % of oils')).toBeTruthy();
  // The method is a segmented radio group now, not a select — pick the cell by its
  // accessible name. The "— water method" suffix is what keeps the CELL apart from the
  // editable field it swaps in, which carries the bare label; asserting both here is the
  // point of this test, so the two names must not collide.
  fireEvent.click(screen.getByRole('radio', { name: 'Lye concentration % — water method' }));
  expect(screen.getByLabelText('Lye concentration %')).toBeTruthy();
  expect(screen.queryByLabelText('Water % of oils')).toBeNull();
});

test('post-cook superfat controls render for HP (per-oil row + method)', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  expect(screen.getByLabelText('Post-cook superfat oil 1')).toBeTruthy();
  expect(screen.getByLabelText('Post-cook superfat % 1')).toBeTruthy();
  expect(screen.getByLabelText('Post-cook superfat method')).toBeTruthy();
});

test('post-cook superfat controls render for LS', () => {
  render(<Harness process="ls" initial={ONE_PCSF} />);
  expect(screen.getByLabelText('Post-cook superfat % 1')).toBeTruthy();
});

test('post-cook superfat controls are hidden for CP (no cook stage)', () => {
  render(<Harness process="cp" initial={ONE_PCSF} />);
  expect(screen.queryByLabelText('Post-cook superfat % 1')).toBeNull();
  expect(screen.queryByLabelText('Post-cook superfat method')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add post-cook superfat oil' })).toBeNull();
});

test('editing a post-cook superfat row % updates settings state', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  const input = screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '4' } });
  expect((screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement).value).toBe('4');
});

test('the post-cook superfat total is a single slider (not one per oil)', () => {
  const { container } = render(
    <Harness
      process="hp"
      initial={{
        postCookSuperfatTotalPercent: '5',
        postCookSuperfatOils: [
          { oilId: 'shea-butter', percent: '3' },
          { oilId: 'jojoba-oil', percent: '2' },
        ],
      }}
    />,
  );
  // One total slider drives the budget; the oil rows are plain number inputs, no per-oil
  // sliders. TWO range inputs total: Superfat and the PCSF total (2 oils add none). The
  // water method lost its slider in the dial redesign — it is a typed dial beside the
  // grams it produces, so a third range here would mean the slider came back.
  expect(screen.getByLabelText('Post-cook superfat total %')).toBeTruthy();
  expect(container.querySelectorAll('input[type="range"]').length).toBe(2);
});

test('an oil % is capped at the remaining budget (sum can never exceed the total)', () => {
  render(
    <Harness
      process="hp"
      initial={{
        postCookSuperfatTotalPercent: '5',
        postCookSuperfatOils: [
          { oilId: 'shea-butter', percent: '3' },
          { oilId: 'jojoba-oil', percent: '2' },
        ],
      }}
    />,
  );
  // Row 2 has only 2% headroom (5 total − 3 on row 1); typing 9 clamps to 2.
  const row2 = screen.getByLabelText('Post-cook superfat % 2') as HTMLInputElement;
  fireEvent.change(row2, { target: { value: '9' } });
  expect((screen.getByLabelText('Post-cook superfat % 2') as HTMLInputElement).value).toBe('2');
  // Row 1 is untouched (siblings are independent, never rescaled).
  expect((screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement).value).toBe('3');
});

test('typing 200 into the post-cook superfat total clamps to 100, not left uncapped', () => {
  // A mistyped 200 (meaning 20) must not be reachable: budgeting more than 100% of the
  // recipe's own oil as a reserve is nonsensical, and an unclamped total inflates the
  // per-row headroom too (letting a row itself go over 100%, which the lye math then
  // silently drops to a zero reserve — see useRecipeViewModel).
  render(<Harness process="hp" initial={ONE_PCSF} />);
  fireEvent.change(screen.getByLabelText('Post-cook superfat total %'), { target: { value: '200' } });
  expect((screen.getByLabelText('Post-cook superfat total %') as HTMLInputElement).value).toBe('100');
  // The allocation note must never claim a 200% budget either.
  expect(screen.queryByText(/200%/)).toBeNull();
});

test('a negative total floors to 0 for storage but does not wipe the oil rows (typo protection)', () => {
  // A stray negative keystroke is a typo, not "set the budget to zero" — the trim-to-fit
  // branch (which proportionally shrinks every row to match a lowered total) must not
  // trigger off the floored value, or the maker's already-typed row gets silently discarded.
  render(<Harness process="hp" initial={ONE_PCSF} />);
  fireEvent.change(screen.getByLabelText('Post-cook superfat total %'), { target: { value: '-5' } });
  expect((screen.getByLabelText('Post-cook superfat total %') as HTMLInputElement).value).toBe('0');
  expect((screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement).value).toBe('5');
});

test('an explicitly typed 0 total DOES trim the oil rows to 0, unlike a negative typo', () => {
  // The sibling case to the negative-typo test above: typing an actual 0 is an intentional
  // "no PCSF budget" and the pre-existing proportional-trim behavior correctly zeroes the
  // rows to match — pinned explicitly so the two cases don't get conflated again.
  render(<Harness process="hp" initial={ONE_PCSF} />);
  fireEvent.change(screen.getByLabelText('Post-cook superfat total %'), { target: { value: '0' } });
  expect((screen.getByLabelText('Post-cook superfat total %') as HTMLInputElement).value).toBe('0');
  expect((screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement).value).toBe('0');
});

test('a loaded total renders in the budget field instead of blanking it', () => {
  // The stored total reaches this field verbatim — that is the point of keeping the maker's
  // own precision — so whatever normalizeSettings hands back has to be a value an
  // <input type="number"> will display. It shows NOTHING for ' 12.34 ' (Chromium and jsdom
  // agree), which left the budget blank while the allocation note beside it still printed
  // "12.3%": one quantity, two figures, and the editable one missing.
  render(
    <Harness
      process="hp"
      initial={normalizeSettings({ postCookSuperfatTotalPercent: ' 12.34 ' })}
    />,
  );
  expect((screen.getByLabelText('Post-cook superfat total %') as HTMLInputElement).value).toBe(
    '12.34',
  );
  expect(screen.getByText('12.3% unallocated')).toBeTruthy();
});

test('a loaded 500% budget cannot hand two rows 100% each', () => {
  // What the missing load-time ceiling actually cost: the per-row headroom is
  // Math.min(100, total − others), so an unclamped 500 gave every row a full 100 to spend.
  // Both rows took 100 and the note read "200% of 500% allocated · 300% left" — a budget the
  // maker cannot type, an allocation the calc will not honour, and a row 2 that the next
  // save/load silently rewrote to '0'.
  render(
    <Harness
      process="hp"
      initial={normalizeSettings({
        postCookSuperfatTotalPercent: '500',
        postCookSuperfatOils: [
          { oilId: 'olive-oil', percent: '' },
          { oilId: 'shea-butter', percent: '' },
        ],
      })}
    />,
  );
  fireEvent.change(screen.getByLabelText('Post-cook superfat % 1'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Post-cook superfat % 2'), { target: { value: '100' } });
  expect((screen.getByLabelText('Post-cook superfat % 2') as HTMLInputElement).value).toBe('0');
  expect(screen.getByText('100% of 100% allocated')).toBeTruthy();
  expect(screen.queryByText(/500%/)).toBeNull();
});

test('a row still caps at 100 even when the total budget somehow exceeds it', () => {
  // Both entry points now clamp the budget to 100 — setPcsfTotal for a typed one,
  // normalizePostCookSuperfatTotal for a loaded/imported one — so this state is constructed
  // directly rather than loaded. The row-level ceiling in updatePcsfOil is the independent
  // second line: a row's OWN percent must not pass 100 (parsePercentOfOil's ceiling, over
  // which it returns null and the lye reserve silently becomes 0) whatever the budget says.
  render(
    <Harness
      process="hp"
      initial={{
        postCookSuperfatTotalPercent: '500',
        postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '' }],
      }}
    />,
  );
  const row = screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement;
  fireEvent.change(row, { target: { value: '400' } });
  expect((screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement).value).toBe('100');
});

test('lowering the total below the allocated sum trims the oils to fit', () => {
  render(
    <Harness
      process="hp"
      initial={{
        postCookSuperfatTotalPercent: '10',
        postCookSuperfatOils: [
          { oilId: 'shea-butter', percent: '6' },
          { oilId: 'jojoba-oil', percent: '4' },
        ],
      }}
    />,
  );
  // Drop the budget 10 → 5; the 6/4 split scales to 3/2 (proportional trim).
  fireEvent.change(screen.getByLabelText('Post-cook superfat total %'), { target: { value: '5' } });
  expect((screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement).value).toBe('3');
  expect((screen.getByLabelText('Post-cook superfat % 2') as HTMLInputElement).value).toBe('2');
});

test('trimming an uneven split never lets the oils sum above the new total', () => {
  render(
    <Harness
      process="hp"
      initial={{
        postCookSuperfatTotalPercent: '9',
        postCookSuperfatOils: [
          { oilId: 'shea-butter', percent: '3' },
          { oilId: 'jojoba-oil', percent: '3' },
          { oilId: 'castor-oil', percent: '3' },
        ],
      }}
    />,
  );
  // 3+3+3 = 9 trimmed to 5: proportional scale is 1.666…% each. Rounding each up would sum
  // to 5.1 (> 5); flooring to 0.1 keeps the sum ≤ 5.
  fireEvent.change(screen.getByLabelText('Post-cook superfat total %'), { target: { value: '5' } });
  const rows = [1, 2, 3].map(
    (n) => Number((screen.getByLabelText(`Post-cook superfat % ${n}`) as HTMLInputElement).value),
  );
  const sum = rows.reduce((a, b) => a + b, 0);
  expect(sum).toBeLessThanOrEqual(5);
});

test('each method shows a plain-language explanation that changes with the selection', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  // Subtract is the default — its explanation is shown.
  expect(screen.getByText(/trims the lye/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Append (add oil)' }));
  expect(screen.getByText(/on top after the cook/i)).toBeTruthy();
});

test('Add oil appends a second post-cook superfat row', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  expect(screen.queryByLabelText('Post-cook superfat oil 2')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add post-cook superfat oil' }));
  expect(screen.getByLabelText('Post-cook superfat oil 2')).toBeTruthy();
  expect(screen.getByLabelText('Post-cook superfat % 2')).toBeTruthy();
});

test('Remove drops a post-cook superfat row', () => {
  render(
    <Harness
      process="hp"
      initial={{
        postCookSuperfatOils: [
          { oilId: 'shea-butter', percent: '3' },
          { oilId: 'jojoba-oil', percent: '2' },
        ],
      }}
    />,
  );
  expect(screen.getByLabelText('Post-cook superfat oil 2')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Remove post-cook superfat row 1'));
  // One row left; the second row's controls are gone.
  expect(screen.queryByLabelText('Post-cook superfat oil 2')).toBeNull();
  expect(screen.getByLabelText('Post-cook superfat oil 1')).toBeTruthy();
});

test('the post-cook superfat method toggles, defaulting to subtract', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  // A segmented radio pair now, not a select: "which cell is checked" is the state, and
  // the group must still open on subtract.
  const subtract = screen.getByRole('radio', { name: 'Subtract (reserve)' }) as HTMLInputElement;
  const append = screen.getByRole('radio', { name: 'Append (add oil)' }) as HTMLInputElement;
  expect(subtract.checked).toBe(true);
  expect(append.checked).toBe(false);
  fireEvent.click(append);
  expect(
    (screen.getByRole('radio', { name: 'Append (add oil)' }) as HTMLInputElement).checked,
  ).toBe(true);
});

test('says the budget is spent, instead of silently rewriting the row to 0', () => {
  // REPORTED: "if superfat is 2 percent I can't add any number to second oil. there are no
  // warnings that I have reached the 2% limit." The cap is right — the rows must not sum
  // past the total — but it applied itself in silence: 1, 0.5 and 5 all landed as 0 with
  // nothing on screen saying why. The allocation note went quiet in exactly that state too,
  // because its "· N% left" clause is gated on there being some left.
  render(
    <Harness
      process="ls"
      initial={{
        postCookSuperfatTotalPercent: '2',
        postCookSuperfatOils: [
          { oilId: 'olive-oil', percent: '2' },
          { oilId: 'olive-oil', percent: '' },
        ],
      }}
    />,
  );
  const row2 = () => screen.getByLabelText('Post-cook superfat % 2') as HTMLInputElement;
  fireEvent.change(row2(), { target: { value: '1' } });
  expect(row2().value, 'the cap itself still holds').toBe('0');

  // The part that was missing: an explanation, naming the budget and both ways out of it.
  const note = screen.getByText(/all 2% is allocated/i);
  expect(note.textContent).toMatch(/raise the total|lower another/i);
});

test('the spent-budget notice clears as soon as there is headroom again', () => {
  render(
    <Harness
      process="ls"
      initial={{
        postCookSuperfatTotalPercent: '2',
        postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '2' }],
      }}
    />,
  );
  expect(screen.getByText(/all 2% is allocated/i)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Post-cook superfat % 1'), { target: { value: '1' } });
  expect(screen.queryByText(/is allocated/i)).toBeNull();
});
