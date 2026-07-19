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
      cause: 'The paste was over-diluted, or the paste itself was under-cooked before dilution.',
      fix: 'Cook the paste longer before diluting, and use less water when you dilute it.',
    },
    {
      symptom: 'A separate oily layer floats on top of the paste or the diluted soap',
      cause: 'Excess unsaponified oil that never fully converted, usually from too high a superfat.',
      fix: 'Reduce the superfat on the next batch, and skim the free-floating oil off the current one.',
    },
  ],
};

export function troubleshootingFor(process: 'cp' | 'hp' | 'ls'): readonly TroubleshootingEntry[] {
  return TROUBLESHOOTING[process];
}
