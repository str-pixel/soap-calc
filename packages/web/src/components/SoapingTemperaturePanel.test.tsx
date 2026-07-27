// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SoapingTemperaturePanel } from './SoapingTemperaturePanel';
import { DEFAULT_SETTINGS, type RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function renderPanel(
  over: Partial<RecipeSettings> = {},
  process: ProcessId = 'cp',
  waterLyeRatio: number | null = 2.4,
) {
  const state = { settings: { ...DEFAULT_SETTINGS, ...over } };
  const setSettings = (updater: RecipeSettings | ((s: RecipeSettings) => RecipeSettings)) => {
    state.settings = typeof updater === 'function' ? updater(state.settings) : updater;
  };
  const utils = render(
    <SoapingTemperaturePanel
      settings={state.settings}
      setSettings={setSettings}
      process={process}
      waterLyeRatio={waterLyeRatio}
    />,
  );
  return { state, ...utils };
}

test('CP defaults to 52 °C (125 °F) with the two-unit readout and the average-band note', () => {
  renderPanel();
  // The control edits in °C; the setting still stores °F.
  expect((screen.getByLabelText('Soaping temperature') as HTMLInputElement).value).toBe('52');
  expect(screen.getByText(/52 °C \(125 °F\)/)).toBeTruthy();
  expect(screen.getByText(/most commonly recommended/i)).toBeTruthy();
});

test('the band note follows the temperature: slowed at 95, accelerated at 150', () => {
  const { unmount } = renderPanel({ soapingTempF: '95' });
  expect(screen.getByText(/Slower trace/i)).toBeTruthy();
  unmount();
  renderPanel({ soapingTempF: '150' });
  expect(screen.getByText(/Fast trace/i)).toBeTruthy();
});

test('typing °C writes the converted °F setting', () => {
  const { state } = renderPanel();
  fireEvent.change(screen.getByLabelText('Soaping temperature'), { target: { value: '66' } });
  expect(state.settings.soapingTempF).toBe('151'); // cToF(66)
});

test('HTHP shows its verified cook target instead of CP band copy', () => {
  renderPanel({ processVariant: 'hp-hthp', soapingTempF: '215' }, 'hp');
  expect(screen.queryByText(/most commonly recommended/i)).toBeNull();
  const hint = screen.getByText(/Cook target/);
  expect(hint.textContent).toContain('215');
  expect(hint.textContent).not.toContain('≈');
});

test('an unverified variant hedges its target with ≈', () => {
  renderPanel({ processVariant: 'ls-lowtemp', soapingTempF: '170' }, 'ls');
  expect(screen.getByText(/≈/)).toBeTruthy();
});

test('CPLS gets the neutral no-external-heat note, not CP bar-band copy', () => {
  renderPanel({ processVariant: 'ls-cpls', soapingTempF: '95' }, 'ls');
  expect(screen.queryByText(/most commonly recommended/i)).toBeNull();
  expect(screen.getByText(/no external heat/i)).toBeTruthy();
});

test('a stale stored value keeps its own figure in the field, clamped only for the calc', () => {
  // Clamp-at-read means the STORED value is never rewritten: the input still shows the
  // 140 °F (60 °C) that was saved, while the readout and the hint show the 205 °F (96 °C)
  // the calculation actually uses under HTHP. Switching back to LTHP restores 140 intact.
  renderPanel({ processVariant: 'hp-hthp', soapingTempF: '140' }, 'hp');
  expect((screen.getByLabelText('Soaping temperature') as HTMLInputElement).value).toBe('60');
  expect(screen.getByText(/96 °C \(205 °F\)/)).toBeTruthy();
  expect(screen.getByText(/Outside this process/i).textContent).toContain('96 °C');
});

test('an out-of-range stored value shows the clamp hint in °C; an in-range one does not', () => {
  const { unmount } = renderPanel({ soapingTempF: '300' }); // 149 °C, past the 77 °C cap
  // The hint interpolates values, so it spans text nodes — assert on the element's text.
  const hint = screen.getByText(/Outside this process/i);
  expect(hint.textContent).toContain('77 °C');
  expect(hint.textContent).toContain('16–77 °C');
  unmount();
  renderPanel({ soapingTempF: '125' });
  expect(screen.queryByText(/Outside this process/i)).toBeNull();
});

test('gel readout: likely at 125 °F with high water, unlikely at 2:1', () => {
  const { unmount } = renderPanel({ soapingTempF: '125' }, 'cp', 2.4);
  expect(screen.getByText(/Gel phase: likely/i)).toBeTruthy();
  unmount();
  renderPanel({ soapingTempF: '125' }, 'cp', 2.0);
  expect(screen.getByText(/Gel phase: unlikely/i)).toBeTruthy();
});

test('gel readout names the partial-gel ring in the 100–119 °F zone at high water', () => {
  renderPanel({ soapingTempF: '110' }, 'cp', 2.5);
  const line = screen.getByText(/Gel phase: possible/i);
  expect(line.textContent?.toLowerCase()).toContain('ring');
});

test('the steer line points both ways under CP', () => {
  renderPanel();
  const steer = screen.getByText(/avoids gel/i);
  expect(steer.textContent).toMatch(/encourages/i);
});

test('no gel line without a calculated water:lye ratio, and never outside CP', () => {
  const { unmount } = renderPanel({ soapingTempF: '125' }, 'cp', null);
  expect(screen.queryByText(/Gel phase:/i)).toBeNull();
  unmount();
  renderPanel({ processVariant: 'hp-hthp', soapingTempF: '215' }, 'hp', 2.4);
  expect(screen.queryByText(/Gel phase:/i)).toBeNull();
});

test('the gel-phase plan control lives with the prediction under CP', () => {
  const { state } = renderPanel();
  const select = screen.getByLabelText(/gel phase/i) as HTMLSelectElement;
  expect(select.value).toBe('natural');
  expect(Array.from(select.options).map((o) => o.value)).toEqual(['none', 'natural', 'forced']);
  fireEvent.change(select, { target: { value: 'forced' } });
  expect(state.settings.gelMode).toBe('forced');
});

test('the gel-phase plan is absent outside CP and when there is no result', () => {
  const { unmount } = renderPanel({ processVariant: 'hp-hthp' }, 'hp');
  expect(screen.queryByLabelText(/gel phase/i)).toBeNull();
  unmount();
  renderPanel({}, 'cp', null);
  expect(screen.queryByLabelText(/gel phase/i)).toBeNull();
});

test('the gel note describes firming speed, not optionality (moved from CP extras)', () => {
  renderPanel();
  expect(screen.queryByText(/gel phase is optional/i)).toBeNull();
  expect(screen.getAllByText(/how fast the bar firms/i).length).toBeGreaterThan(0);
});
