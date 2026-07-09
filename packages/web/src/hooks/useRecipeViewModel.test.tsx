// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useRecipeViewModel } from './useRecipeViewModel';
import { createStarterLines, DEFAULT_SETTINGS, createEmptyAdditives } from '../lib/recipe';

afterEach(cleanup);

function probe(onVm: (vm: unknown) => void) {
  function Probe() {
    const vm = useRecipeViewModel({
      recipeName: 'Test',
      lines: createStarterLines(),
      settings: DEFAULT_SETTINGS,
      additives: createEmptyAdditives(),
      drafts: {},
      weightUnit: 'g',
    });
    onVm(vm);
    return null;
  }
  render(<Probe />);
}

test('view-model computes a lye result and printable batch sheet for the starter recipe', () => {
  let captured: any;
  probe((vm) => { captured = vm; });
  expect(captured.result).not.toBeNull();
  expect(captured.totalOilGrams).toBeGreaterThan(0);
  expect(captured.inputErrors).toEqual([]);
  expect(captured.batchSheetData).not.toBeNull();
  expect(captured.lyeLabel).toBe('NaOH');
});
