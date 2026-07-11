export type Point = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Axis `index` of `count`, `value` on a 0–100 scale, placed on a circle of `radius`
 * around `center`. Axis 0 points straight up; axes proceed clockwise. */
export function radarPoint(
  index: number,
  count: number,
  value: number,
  radius: number,
  center: number,
): Point {
  const scaled = (clamp(value, 0, 100) / 100) * radius;
  const angle = -Math.PI / 2 + (index / count) * 2 * Math.PI;
  return {
    x: center + scaled * Math.cos(angle),
    y: center + scaled * Math.sin(angle),
  };
}

export function polygonPoints(values: number[], radius: number, center: number): string {
  return values
    .map((v, i) => {
      const p = radarPoint(i, values.length, v, radius, center);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(' ');
}

/** Suggested-range band: highs polygon plus lows polygon (each per-axis), so an
 * evenodd fill leaves a hole in the middle. */
export function ringPath(
  lows: number[],
  highs: number[],
  radius: number,
  center: number,
): string {
  const toSubpath = (values: number[]): string => {
    const pts = values.map((v, i) => radarPoint(i, values.length, v, radius, center));
    const [head, ...rest] = pts;
    return `M ${head.x.toFixed(2)} ${head.y.toFixed(2)} ${rest
      .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ')} Z`;
  };
  return `${toSubpath(highs)} ${toSubpath(lows)}`;
}
