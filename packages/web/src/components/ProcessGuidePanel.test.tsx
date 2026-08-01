// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { lsMethodForTemp } from '@soap-calc/core';
import { ProcessGuidePanel } from './ProcessGuidePanel';

afterEach(cleanup);

test('HP-HTHP shows a firm temp, all 5 cook stages, and the over-mix caution', () => {
  render(<ProcessGuidePanel process="hp" processVariant="hp-hthp" />);
  expect(screen.getByText(/215 °F, ceiling 240 °F/)).toBeTruthy();
  expect(screen.queryByText(/≈/)).toBeNull();
  expect(screen.getByText('trace')).toBeTruthy();
  expect(screen.getByText('applesauce')).toBeTruthy();
  expect(screen.getByText('expansion')).toBeTruthy();
  expect(screen.getByText('mashed potato')).toBeTruthy();
  expect(screen.getByText('gel / neat')).toBeTruthy();
  expect(screen.getByText(/stop mixing once the batter reaches neat/)).toBeTruthy();
});

test('HP-fluid shows a hedged temp', () => {
  render(<ProcessGuidePanel process="hp" processVariant="hp-fluid" />);
  expect(screen.getByText(/≈.*°F.*\(estimated\)/)).toBeTruthy();
});

test('CP shows the soaping-temp note and no cook stages', () => {
  render(<ProcessGuidePanel process="cp" processVariant="cp" />);
  expect(screen.getByText(/comfortable working temperature/)).toBeTruthy();
  expect(screen.queryByText('trace')).toBeNull();
  expect(screen.queryByText(/stop mixing once the batter reaches neat/)).toBeNull();
});

// The per-variant hedged-temp case (a heated LS variant with an unverified in-cook target)
// no longer exists: LS collapsed to a single ambient variant (temp: null) whose method is
// now derived from the hold temperature — see core's ls-method.test.ts, which owns that
// ground (2026-08-01 LS temperature-method redesign, task 3).
test('LS shows the ambient no-cook note, like CP', () => {
  render(<ProcessGuidePanel process="ls" processVariant="ls" />);
  expect(screen.getByText(/comfortable working temperature/)).toBeTruthy();
  expect(screen.queryByText('trace')).toBeNull();
});

test('LS: renders the derived method steps (high temp at 215) with the vessel mandate', () => {
  render(
    <ProcessGuidePanel
      process="ls"
      processVariant="ls"
      lsMethod={lsMethodForTemp(215)}
      ls30Min={false}
    />,
  );
  expect(screen.getByText(/2× the total recipe volume/)).toBeTruthy();
  expect(screen.getByText(/High-temp LS/)).toBeTruthy();
});

test('LS: 30-minute note only when the package is present on high temp', () => {
  render(
    <ProcessGuidePanel
      process="ls"
      processVariant="ls"
      lsMethod={lsMethodForTemp(215)}
      ls30Min={true}
    />,
  );
  expect(screen.getByText(/30-minute no-paste/i)).toBeTruthy();
});

test('LS: cold method renders CPLS steps and no cook-stage list', () => {
  render(
    <ProcessGuidePanel
      process="ls"
      processVariant="ls"
      lsMethod={lsMethodForTemp(80)}
      ls30Min={false}
    />,
  );
  expect(screen.getByText(/12–48 hours/)).toBeTruthy();
});

test('an invalid processVariant renders nothing instead of throwing', () => {
  expect(() =>
    render(
      <ProcessGuidePanel
        process="cp"
        processVariant={'bogus-variant' as unknown as import('../lib/process').ProcessVariantId}
      />,
    ),
  ).not.toThrow();
  expect(screen.queryByText('Process guide')).toBeNull();
});
