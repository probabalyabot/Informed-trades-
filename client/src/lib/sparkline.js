// Geometry for a sparkline: maps a series of values onto a width x height box
// and returns the SVG polyline points. The vertical scale spans the series'
// own min..max (no zero baseline, which would flatten a price series).
// Returns [] when there are fewer than two values to connect.
export function sparklineCoords(values, width, height, pad = 2) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return values.map((value, i) => ({
    x: round(pad + (i / (values.length - 1)) * innerW),
    // A flat series sits on the vertical centre instead of dividing by zero.
    y: round(span === 0 ? height / 2 : pad + (1 - (value - min) / span) * innerH),
  }));
}

export const toPolyline = (coords) => coords.map((c) => `${c.x},${c.y}`).join(' ');

// % change from the first to the last value, or null if it cannot be computed.
export function seriesChangePct(values) {
  if (!Array.isArray(values) || values.length < 2 || !values[0]) return null;
  return (values.at(-1) / values[0] - 1) * 100;
}

const round = (n) => Math.round(n * 100) / 100;
