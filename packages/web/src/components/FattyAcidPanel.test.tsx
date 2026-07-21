// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FattyAcidPanel } from './FattyAcidPanel';

afterEach(cleanup);

const PROFILE = { oleic: 41, elaidic: 22, stearic: 15, linoleic: 11, palmitic: 10, linolenic: 1 };

/**
 * These bars ARE the reconstruction — the panel renders the modeled percentages themselves — so
 * it must carry the modeled marker, not just the properties derived from it.
 */
test('marks a recipe built on a modeled (reconstructed) profile', () => {
  render(
    <FattyAcidPanel
      result={{
        profile: PROFILE,
        coveragePercent: 100,
        missingOilIds: [],
        modeledOilIds: ['soybean-27-5-hydrogenated'],
      }}
    />,
  );
  expect(screen.getByText('Modeled')).toBeTruthy();
  // Named via the shared oilDisplayName helper, not the raw id.
  expect(screen.getByText(/Soybean, 27\.5% hydrogenated/)).toBeTruthy();
});

test('stays silent for a measured-only recipe', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  expect(screen.queryByText('Modeled')).toBeNull();
});

// PROFILE.elaidic = 22 falls in the "trans" bar (typical 0–2%), well outside its band — the panel
// must signal that with more than color (WCAG 1.4.1): a non-color, real-text verdict plus the
// status folded into the meter's accessible name, not left for sighted users only.
test('flags an out-of-range bar with a non-color marker and names the status in the meter', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  const transMeter = screen.getByRole('meter', { name: /Trans \(elaidic\)/i });
  expect(transMeter.getAttribute('aria-label')).toMatch(/outside typical range/i);

  // A non-color, visible verdict accompanies the value — real text, not only a CSS color class.
  // 22% against a 0–2% band reads as "Too high" on the trans row specifically.
  const transRow = transMeter.closest('.property-bars__row');
  expect(transRow?.querySelector('.property-bars__value--outside')).not.toBeNull();
  expect(transRow?.querySelector('.property-bars__status')?.textContent).toMatch(/^Too high$/);
});

test('does not flag an in-range bar as outside range', () => {
  render(
    <FattyAcidPanel
      result={{ profile: PROFILE, coveragePercent: 100, missingOilIds: [], modeledOilIds: [] }}
    />,
  );
  // Oleic = 41, band is 32–41 — in range.
  const oleicMeter = screen.getByRole('meter', { name: /^Oleic:/i });
  expect(oleicMeter.getAttribute('aria-label')).not.toMatch(/outside typical range/i);
});
