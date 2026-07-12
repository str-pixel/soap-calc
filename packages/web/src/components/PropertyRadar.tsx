import { SOAP_PROPERTY_GUIDE, SOAP_PROPERTY_LABELS } from '@soap-calc/core';
import type { SoapProperties, SoapPropertyName } from '@soap-calc/core';
import { polygonPoints, radarPoint, ringPath } from '../lib/radarGeometry';

type PropertyRadarProps = {
  properties: SoapProperties;
  order: SoapPropertyName[];
  lowCoverage: boolean;
};

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 78; // leaves room for axis labels inside the viewBox
const RINGS = [100, 66, 33];

/** Short axis labels for the narrow sidebar. */
const SHORT_LABEL: Partial<Record<SoapPropertyName, string>> = {
  bubbly: 'Bubbly',
  creamy: 'Creamy',
};

export function PropertyRadar({ properties, order, lowCoverage }: PropertyRadarProps) {
  const values = order.map((key) => properties[key]);
  const lows = order.map((key) => SOAP_PROPERTY_GUIDE[key].low);
  const highs = order.map((key) => SOAP_PROPERTY_GUIDE[key].high);

  return (
    <svg
      className="property-radar"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="presentation"
      aria-hidden="true"
    >
      {/* grid rings */}
      {RINGS.map((r) => (
        <polygon
          key={r}
          className="property-radar__grid"
          points={polygonPoints(order.map(() => r), RADIUS, CENTER)}
        />
      ))}
      {/* axis spokes + labels */}
      {order.map((key, i) => {
        const tip = radarPoint(i, order.length, 100, RADIUS, CENTER);
        const label = radarPoint(i, order.length, 100, RADIUS + 20, CENTER);
        return (
          <g key={key}>
            <line
              className="property-radar__spoke"
              x1={CENTER}
              y1={CENTER}
              x2={tip.x}
              y2={tip.y}
            />
            <text
              className="property-radar__axis-label"
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {SHORT_LABEL[key] ?? SOAP_PROPERTY_LABELS[key]}
            </text>
          </g>
        );
      })}
      {/* suggested-range band */}
      <path
        className="property-radar__band"
        d={ringPath(lows, highs, RADIUS, CENTER)}
        fillRule="evenodd"
      />
      {/* recipe polygon */}
      <polygon
        data-testid="radar-recipe"
        className={`property-radar__recipe${lowCoverage ? ' property-radar__recipe--estimated' : ''}`}
        points={polygonPoints(values, RADIUS, CENTER)}
      />
      {/* recipe vertices */}
      {values.map((v, i) => {
        const p = radarPoint(i, order.length, v, RADIUS, CENTER);
        return <circle key={order[i]} className="property-radar__vertex" cx={p.x} cy={p.y} r={2.5} />;
      })}
    </svg>
  );
}
