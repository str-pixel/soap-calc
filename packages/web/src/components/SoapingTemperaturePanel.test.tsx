// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SoapingTemperaturePanel } from './SoapingTemperaturePanel';
import { DEFAULT_SETTINGS, type RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function renderPanel(over: Partial<RecipeSettings> = {}, process: ProcessId = 'cp') {
  const state = { settings: { ...DEFAULT_SETTINGS, ...over } };
  const setSettings = (updater: RecipeSettings | ((s: RecipeSettings) => RecipeSettings)) => {
    state.settings = typeof updater === 'function' ? updater(state.settings) : updater;
  };
  const utils = render(
    <SoapingTemperaturePanel settings={state.settings} setSettings={setSettings} process={process} />,
  );
  return { state, ...utils };
}

test('CP defaults to 125 °F with the two-unit readout and the average-band note', () => {
  renderPanel();
  expect((screen.getByLabelText('Soaping temperature') as HTMLInputElement).value).toBe('125');
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

test('moving the input writes the setting', () => {
  const { state } = renderPanel();
  fireEvent.change(screen.getByLabelText('Soaping temperature'), { target: { value: '150' } });
  expect(state.settings.soapingTempF).toBe('150');
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

test('a stale stored value displays clamped (LTHP 140 under HTHP reads 205)', () => {
  renderPanel({ processVariant: 'hp-hthp', soapingTempF: '140' }, 'hp');
  expect(screen.getByText(/96 °C \(205 °F\)/)).toBeTruthy();
});

test('an out-of-range typed value shows the clamp hint; an in-range one does not', () => {
  const { unmount } = renderPanel({ soapingTempF: '300' });
  expect(screen.getByText(/using 170 °F/i).textContent).toMatch(/range/i);
  unmount();
  renderPanel({ soapingTempF: '125' });
  expect(screen.queryByText(/using .* °F/i)).toBeNull();
});
