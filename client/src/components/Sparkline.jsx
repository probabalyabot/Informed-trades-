import { formatPercent } from '../format.js';
import { seriesChangePct, sparklineCoords, toPolyline } from '../lib/sparkline.js';

const WIDTH = 104;
const HEIGHT = 30;

// A small axis-free line showing the shape of recent closes. It answers
// "what is the trend?"; the exact figures sit beside it in the row.
export default function Sparkline({ values, label }) {
  const coords = sparklineCoords(values, WIDTH, HEIGHT, 3);
  if (coords.length === 0) return <span className="muted">—</span>;

  const change = seriesChangePct(values);
  const end = coords.at(-1);
  return (
    <svg
      className={`sparkline ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${label}: ${formatPercent(change)} over ${values.length} trading days`}
    >
      <polyline points={toPolyline(coords)} />
      <circle cx={end.x} cy={end.y} r="2.5" />
    </svg>
  );
}
