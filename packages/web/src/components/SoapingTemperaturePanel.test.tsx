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

// The heated-variant hedged-target case ("≈...°F (estimated)") no longer exists: LS
// collapsed to a single ambient variant (temp: null) whose method is now derived from the
// hold temperature — see core's ls-method.test.ts, which owns that ground (2026-08-01 LS
// temperature-method redesign, task 3).

test('LS cold-process zone (below 100 °F) gets the neutral no-external-heat note, not CP bar-band copy', () => {
  // 150 °F now resolves to the low-temp method (see the derived-method tests above); the
  // ambient no-heat sentence belongs to the cold-process zone only (< 100 °F).
  renderPanel({ processVariant: 'ls', soapingTempF: '90' }, 'ls');
  expect(screen.queryByText(/most commonly recommended/i)).toBeNull();
  expect(screen.getByText(/no external heat/i)).toBeTruthy();
});

test('LS: names the derived method beside the temperature', () => {
  renderPanel({ processVariant: 'ls', soapingTempF: '150' }, 'ls');
  expect(screen.getByText(/Low-temp LS/)).toBeTruthy();
});

test('LS: shows the honest gap note at 180 °F', () => {
  renderPanel({ processVariant: 'ls', soapingTempF: '180' }, 'ls');
  expect(screen.getByText(/below its 215/)).toBeTruthy();
  expect(screen.getByText(/High-temp LS/)).toBeTruthy();
});

test('LS: draws all three zone markers with the low-temp recommended sub-band', () => {
  renderPanel({ processVariant: 'ls', soapingTempF: '150' }, 'ls');
  expect(screen.getByText('cold process')).toBeTruthy();
  expect(screen.getByText('low temp')).toBeTruthy();
  expect(screen.getByText('high temp')).toBeTruthy();
});

test('LS: at 150 °F the low-temp zone carries --active and the high zone does not', () => {
  const { container } = renderPanel({ processVariant: 'ls', soapingTempF: '150' }, 'ls');
  // Render order in SoapingTemperaturePanel.tsx: cold, low, recommended (a sub-band of
  // low, not a fifth top-level zone), high — .temp-zones__zone is the shared base class,
  // so this is the only way to address a specific zone; none carries a --cold/--low/--high
  // class of its own.
  const zones = container.querySelectorAll('.temp-zones__zone');
  expect(zones).toHaveLength(4);
  const [cold, low, recommended, high] = Array.from(zones);
  expect(cold.classList.contains('temp-zones__zone--active')).toBe(false);
  expect(low.classList.contains('temp-zones__zone--active')).toBe(true);
  expect(recommended.classList.contains('temp-zones__zone--active')).toBe(false);
  expect(high.classList.contains('temp-zones__zone--active')).toBe(false);
});

test('LS: at 215 °F the high-temp zone carries --active', () => {
  const { container } = renderPanel({ processVariant: 'ls', soapingTempF: '215' }, 'ls');
  const zones = container.querySelectorAll('.temp-zones__zone');
  const [cold, low, , high] = Array.from(zones);
  expect(high.classList.contains('temp-zones__zone--active')).toBe(true);
  expect(cold.classList.contains('temp-zones__zone--active')).toBe(false);
  expect(low.classList.contains('temp-zones__zone--active')).toBe(false);
});

test('LS: the recommended sub-band renders inside the strip', () => {
  const { container } = renderPanel({ processVariant: 'ls', soapingTempF: '150' }, 'ls');
  expect(container.querySelector('.temp-zones__zone--recommended')).toBeTruthy();
});

test('LS: the low-temp zone is positioned at the sourced 120–160 °F edges (37.5%–62.5% of 60–220 °F)', () => {
  const { container } = renderPanel({ processVariant: 'ls', soapingTempF: '150' }, 'ls');
  const zones = container.querySelectorAll('.temp-zones__zone');
  const low = zones[1] as HTMLElement;
  expect(low.style.left).toBe('37.5%');
  expect(low.style.width).toBe('25%');
});

test('CP: unchanged — no zone markers', () => {
  renderPanel({ soapingTempF: '125' }, 'cp');
  expect(screen.queryByText('low temp')).toBeNull();
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
