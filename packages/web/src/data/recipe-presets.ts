import type { AdditiveStage } from '@soap-calc/core';
import type { RecipeSettings, SplitLiquidSettings } from '../lib/recipe';

export type RecipePresetOilLine = {
  oilId: string;
  weightPercent: string;
};

export type RecipePresetAdditive = {
  catalogId: string;
  name: string;
  percentOfOil: string;
  addAt: AdditiveStage;
};

export type RecipePresetSettings = Partial<
  Omit<RecipeSettings, 'splitLiquid' | 'batchOilGrams' | 'weightUnit'>
> & {
  splitLiquid?: Partial<SplitLiquidSettings>;
};

export type RecipePreset = {
  id: string;
  name: string;
  description: string;
  batchOilGrams: string;
  lines: RecipePresetOilLine[];
  settings: RecipePresetSettings;
  additives?: RecipePresetAdditive[];
};

export const RECIPE_PRESETS: readonly RecipePreset[] = [
  {
    id: 'classic-castile',
    name: 'Classic castile',
    description: '100% olive oil — slow trace, long cure, mild bar.',
    batchOilGrams: '1000',
    lines: [{ oilId: 'olive-oil', weightPercent: '100' }],
    settings: {
      superfatPercent: '5',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '33',
    },
  },
  {
    id: 'mild-coconut-bar',
    name: 'Mild coconut bar (30% superfat)',
    description: '100% coconut with high superfat for a gentler cleanse.',
    batchOilGrams: '500',
    lines: [{ oilId: 'coconut-oil-76', weightPercent: '100' }],
    settings: {
      superfatPercent: '30',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '33',
    },
  },
  {
    id: 'grocery-three-oil',
    name: 'Grocery three-oil',
    description: 'Lard, olive, and coconut — a simple pantry blend.',
    batchOilGrams: '1000',
    lines: [
      { oilId: 'lard-pig-tallow', weightPercent: '40' },
      { oilId: 'olive-oil', weightPercent: '40' },
      { oilId: 'coconut-oil-76', weightPercent: '20' },
    ],
    settings: {
      superfatPercent: '5',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '33',
    },
  },
  {
    id: 'balanced-four-oil',
    name: 'Balanced four-oil bar',
    description: 'Palm, olive, coconut, and castor for a well-rounded bar.',
    batchOilGrams: '1000',
    lines: [
      { oilId: 'palm-oil', weightPercent: '35' },
      { oilId: 'olive-oil', weightPercent: '40' },
      { oilId: 'coconut-oil-76', weightPercent: '20' },
      { oilId: 'castor-oil', weightPercent: '5' },
    ],
    settings: {
      superfatPercent: '5',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '33',
    },
  },
  {
    id: 'pumpkin-puree-bar',
    name: 'Pumpkin puree bar',
    description: 'Balanced oils with pumpkin puree added at trace as split liquid.',
    batchOilGrams: '1000',
    lines: [
      { oilId: 'olive-oil', weightPercent: '40' },
      { oilId: 'coconut-oil-76', weightPercent: '25' },
      { oilId: 'palm-oil', weightPercent: '30' },
      { oilId: 'castor-oil', weightPercent: '5' },
    ],
    settings: {
      superfatPercent: '5',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '28',
      splitLiquid: {
        enabled: true,
        name: 'Pumpkin puree',
        percentOfOil: '7',
        addAt: 'trace',
      },
    },
  },
  {
    id: 'goat-milk-bar',
    name: 'Goat milk bar',
    description: 'Four-oil base with goat milk as split liquid at trace.',
    batchOilGrams: '1000',
    lines: [
      { oilId: 'olive-oil', weightPercent: '40' },
      { oilId: 'coconut-oil-76', weightPercent: '25' },
      { oilId: 'palm-oil', weightPercent: '30' },
      { oilId: 'castor-oil', weightPercent: '5' },
    ],
    settings: {
      superfatPercent: '6',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '28',
      splitLiquid: {
        enabled: true,
        name: 'Goat milk',
        percentOfOil: '20',
        addAt: 'trace',
      },
    },
  },
  {
    id: 'charcoal-facial-bar',
    name: 'Charcoal facial bar',
    description: 'Gentle oils with charcoal in oils and honey at trace.',
    batchOilGrams: '500',
    lines: [
      { oilId: 'olive-oil', weightPercent: '45' },
      { oilId: 'rice-bran-oil', weightPercent: '25' },
      { oilId: 'coconut-oil-76', weightPercent: '20' },
      { oilId: 'castor-oil', weightPercent: '10' },
    ],
    settings: {
      superfatPercent: '8',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '33',
    },
    additives: [
      {
        catalogId: 'charcoal',
        name: 'Charcoal',
        percentOfOil: '1',
        addAt: 'oils',
      },
      {
        catalogId: 'honey',
        name: 'Honey',
        percentOfOil: '1',
        addAt: 'trace',
      },
    ],
  },
] as const;

export function recipePresetById(id: string): RecipePreset | undefined {
  return RECIPE_PRESETS.find((preset) => preset.id === id);
}
