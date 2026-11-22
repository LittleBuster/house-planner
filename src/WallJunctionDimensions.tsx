import { format } from "./model";
import { readablePlanAngle } from "./planLabels";
import type { WallJunctionMeasurement } from "./wallJunctionMeasurements";

export function WallJunctionDimensions({ junction, unit }: { junction: WallJunctionMeasurement; unit: number }) {
  const { wall, side, spans } = junction;
  const angle = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180 / Math.PI;
  const correction = readablePlanAngle(angle) - angle;
  const y = side * (wall.thickness / 2 + 29 * unit);
  const color = "#4d7cae";
  return <g data-testid="wall-junction-dimensions" data-host-wall={wall.id} pointerEvents="none"
    transform={`translate(${wall.a.x},${wall.a.y}) rotate(${angle})`} stroke={color} strokeWidth={unit}>
    {spans.map(span => {
      const distance = Math.abs(span.from - span.to), label = `${format(distance, 3)} м`;
      const width = Math.max(45, label.length * 6 + 12) * unit;
      const middle = (span.from + span.to) / 2;
      const short = distance < width + 8 * unit;
      const x = short ? span.to + Math.sign(span.to - span.from) * (width / 2 + 6 * unit) : middle;
      return <g key={span.side} data-wall-junction-span={span.side} data-distance={distance}>
        <line x1={span.from} x2={span.to} y1={y} y2={y} />
        {[span.from,span.to].map((at, i) => <line key={i} x1={at} x2={at}
          y1={side * (wall.thickness / 2 + 3 * unit)} y2={y + side * 5 * unit}
          strokeDasharray={`${3 * unit} ${2 * unit}`} />)}
        {short && <line x1={span.to} x2={x} y1={y} y2={y} strokeDasharray={`${2 * unit} ${3 * unit}`} />}
        <g transform={`translate(${x},${y}) rotate(${correction})`}>
          <rect x={-width / 2} y={-10 * unit} width={width} height={20 * unit} rx={4 * unit} fill="#f5f9ff" />
          <text textAnchor="middle" dominantBaseline="central" stroke="none" fill={color} fontSize={11 * unit}
            className="opening-clearance-label">{label}</text>
        </g>
      </g>;
    })}
  </g>;
}
