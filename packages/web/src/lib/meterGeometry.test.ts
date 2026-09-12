import { expect, test } from 'vitest';
import { trackPct, valueAnchor, valueAnchorClass } from './meterGeometry';

test('trackPct clamps to the 0–100 track', () => {
  expect(trackPct(-3)).toBe(0);
  expect(trackPct(47.3)).toBe(47.3);
  expect(trackPct(140)).toBe(100);
});

test('a label near either edge anchors to its marker instead of centring on it', () => {
  expect(valueAnchor(0)).toBe('start');
  expect(valueAnchor(0.5)).toBe('start'); // the 0.5% that printed as "5%"
  expect(valueAnchor(7.9)).toBe('start');
  expect(valueAnchor(8)).toBe('middle');
  expect(valueAnchor(50)).toBe('middle');
  expect(valueAnchor(92)).toBe('middle');
  expect(valueAnchor(92.1)).toBe('end');
  expect(valueAnchor(100)).toBe('end');
});

test('the class modifier is empty for a centred label and named for an anchored one', () => {
  expect(valueAnchorClass(50)).toBe('');
  expect(valueAnchorClass(0)).toBe(' property-meters__value--start');
  expect(valueAnchorClass(99)).toBe(' property-meters__value--end');
});
