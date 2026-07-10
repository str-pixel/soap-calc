import { describe, expect, it } from 'vitest';
import { additiveStageLabel } from './additiveStageLabel';

describe('additiveStageLabel', () => {
  it('labels after_cook as "After cook" with no process context', () => {
    expect(additiveStageLabel('after_cook')).toBe('After cook');
  });

  it('labels after_cook as "After cook" under hp', () => {
    expect(additiveStageLabel('after_cook', 'hp')).toBe('After cook');
  });

  it('labels after_cook as "After dilution" under ls', () => {
    expect(additiveStageLabel('after_cook', 'ls')).toBe('After dilution');
  });

  it('leaves the other stages unaffected by process', () => {
    expect(additiveStageLabel('lye', 'ls')).toBe('In lye water');
    expect(additiveStageLabel('oils', 'ls')).toBe('With oils');
    expect(additiveStageLabel('trace', 'ls')).toBe('At trace');
    expect(additiveStageLabel('top', 'ls')).toBe('On top');
    expect(additiveStageLabel('trace')).toBe('At trace');
  });
});
