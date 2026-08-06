export type TroubleshootingEntry = {
  symptom: string;
  cause: string;
  fix: string;
};

export const TROUBLESHOOTING: Record<'cp' | 'hp' | 'ls', readonly TroubleshootingEntry[]> = {
  cp: [
    {
      symptom: 'Ashy white film on the top of the bar',
      cause: 'Free lye at the surface reacts with air before that thin layer fully saponifies.',
      fix: 'Mist the top with rubbing alcohol right after pour, cover the mold, or steam the ash off after unmolding.',
    },
    {
      symptom: 'A visible ring or line running through an otherwise even bar',
      cause: 'Only part of the batch retained enough heat to gel, so gelled and ungelled soap sit side by side.',
      fix: 'Insulate the mold evenly on all sides to gel the whole batch, or skip insulation entirely for a uniform, fully ungelled bar.',
    },
    {
      symptom: 'The mold domes, cracks, or overflows during gel',
      cause: 'The batch overheated during saponification, often from high sugar-based additives trapping extra heat.',
      fix: 'Soap at a cooler temperature, cut back sugar-heavy additives, and avoid extra insulation in warm rooms.',
    },
    {
      symptom: 'Small orange or rust-colored spots appear on cured bars weeks later',
      cause: 'Rancidity taking hold in pockets of oil, usually from older oil stock or trace contamination.',
      fix: 'Use fresh oils, add an antioxidant to the recipe, and cure and store bars somewhere cool and dry.',
    },
  ],
  hp: [
    {
      symptom: "Cook won't gel — batter stays opaque and thick instead of turning translucent",
      cause: 'Not enough heat is being retained to carry the batch through saponification.',
      fix: 'Switch to a lower, longer heat-assisted cook, or add gentle direct heat to restart the reaction.',
    },
    {
      symptom: 'Finished bar crumbles or will not hold together out of the mold',
      cause: 'The batter was worked well past the neat stage before molding, breaking the emulsion.',
      fix: 'Move faster once trace hits, and stir in a splash more water or liquid to loosen an over-thick batter.',
    },
    {
      symptom: 'Bar zaps the tongue or tests above pH 11 after the cook',
      cause: 'The cook finished before all the lye fully reacted, or the lye was measured or mixed incorrectly.',
      fix: 'Recheck the lye calculation and scale, and rebatch with extra oil if the bar is confirmed lye-heavy.',
    },
  ],
  ls: [
    {
      symptom: 'A clear diluted solution turns cloudy once it cools to room temperature',
      cause: 'Chill haze — some fatty material stays undissolved at lower temperatures.',
      fix: 'Gently reheat and stir the solution until it clears, or add a solubilizer to keep it clear at room temperature.',
    },
    {
      symptom: 'Diluted soap turns stringy or sets up like gelatin instead of staying liquid',
      cause:
        'Usually the alkali blend: too large a NaOH share in a recipe already high in stearic and palmitic sets those sodium soaps to a semi-solid gel as the soap sits. Too much salt or thickener does the same by parking the soap at the peak of the salt curve, where viscosity is highest. And a soap held above its recipe\'s own maximum concentration can look the same for a different reason — the excess soap never dissolves and sits as lumps of paste or a thick, goopy layer on top; high-oleic recipes have the lowest ceilings. Recipes low in lauric and myristic are the most prone to all three.',
      fix: 'Cut the NaOH share next batch and check the fatty-acid profile against it. For a salt gel, carry on along the salt curve — past the peak more salt thins it again, at the cost of lather, clarity and a tacky feel — or add water and use less salt next time. If the recipe is over its concentration ceiling (no NaOH or salt in play), add water until it drops below the ceiling — the dilution panel shows the recipe\'s maximum. Extra water rarely fully clears an alkali-blend gel, but the soap still cleans and is usable as it is.',
    },
    {
      symptom: 'A separate oily layer floats on top of the paste or the diluted soap',
      cause:
        'Unsaponified oil that never converted — either too high a superfat, or dilution water added before the cook had finished, which leaves fat that may never catch up and can leave the batch lye-heavy instead.',
      fix: 'Skim the floating oil off the current batch and lower the superfat next time. Before diluting, run a clarity test: stir a little paste into hot water — clear means it is ready, milky means it needs more cook time.',
    },
  ],
};

export function troubleshootingFor(process: 'cp' | 'hp' | 'ls'): readonly TroubleshootingEntry[] {
  return TROUBLESHOOTING[process];
}
