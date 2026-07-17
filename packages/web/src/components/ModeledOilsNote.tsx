import { oilDisplayName } from '../lib/oilDisplay';
import { InfoTip } from './InfoTip';

type ModeledOilsNoteProps = {
  /** Recipe oils whose fatty-acid profile is a modeled reconstruction, not a measured composition. */
  oilIds: string[];
};

/**
 * Data-honesty marker shared by every panel that renders numbers derived from a reconstructed
 * fatty-acid profile — the fatty-acid bars themselves and the bar properties computed from them.
 * Shared rather than duplicated so the two can't drift in wording or in which oils they name.
 */
export function ModeledOilsNote({ oilIds }: ModeledOilsNoteProps) {
  if (oilIds.length === 0) return null;

  const plural = oilIds.length > 1;

  return (
    <p className="properties-modeled">
      <span className="properties-modeled__tag">Modeled</span>
      {oilIds.map(oilDisplayName).join(', ')}
      <InfoTip term={plural ? 'Modeled oils' : 'Modeled oil'}>
        {plural
          ? 'These oils’ fatty-acid profiles are reconstructions (e.g. a hydrogenation transform of a measured base oil), not directly measured compositions, so the scores they feed are estimates and may differ from other calculators.'
          : 'This oil’s fatty-acid profile is a reconstruction (e.g. a hydrogenation transform of a measured base oil), not a directly measured composition, so the scores it feeds are estimates and may differ from other calculators.'}
      </InfoTip>
    </p>
  );
}
