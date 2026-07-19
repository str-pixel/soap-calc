import { expect, it } from 'vitest';
import { HP_COOK_STAGES } from './cook-stages';

it('lists the HP cook stages in order', () => {
  expect(HP_COOK_STAGES).toEqual(['trace', 'applesauce', 'expansion', 'mashed potato', 'gel / neat']);
});
