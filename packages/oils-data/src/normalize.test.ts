import { describe, expect, it } from 'vitest';
import { inferCategory } from './normalize.js';

describe('inferCategory', () => {
  it('classifies mustard oil as triglyceride despite low saponifiable %', () => {
    expect(inferCategory('Mustard Oil, kachi ghani', 'mustard-oil-kachi-ghani')).toBe('triglyceride');
  });

  it('classifies rapeseed as triglyceride despite incomplete breakdown', () => {
    expect(inferCategory('Rapeseed Oil, unrefined canola', 'rapeseed-oil-canola')).toBe('triglyceride');
  });

  it('classifies jojoba as wax_ester by name', () => {
    expect(inferCategory('Jojoba Oil (a Liquid Wax Ester)', 'jojoba-oil-a-liquid-wax-ester')).toBe('wax_ester');
  });

  it('classifies beeswax as wax', () => {
    expect(inferCategory('Beeswax', 'beeswax')).toBe('wax');
  });
});
