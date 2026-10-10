// Helpers for presenting sentiment. Scores run from -1 (very negative) to +1.

// Same cut-offs as v_stock_signal and v_event_summary in the database.
const MIXED_BAND = 0.15;

// Tone of an AVERAGE score: 'positive' | 'mixed' | 'negative', or null if unknown.
export function averageTone(score) {
  if (score == null) return null;
  if (score > MIXED_BAND) return 'positive';
  if (score < -MIXED_BAND) return 'negative';
  return 'mixed';
}

// Where a score sits on a left-to-right track, as a percentage (0 = -1, 50 = 0, 100 = +1).
export function gaugePosition(score) {
  const clamped = Math.max(-1, Math.min(1, score));
  return (clamped + 1) * 50;
}

// The filled part of the track: it grows from the centre toward the score.
export function gaugeFill(score) {
  const position = gaugePosition(score);
  return { left: Math.min(50, position), width: Math.abs(position - 50) };
}

// "+0.42", "-0.30", "0.00"
export function formatScore(score) {
  if (score == null) return '—';
  const text = Math.abs(score).toFixed(2);
  if (Number(text) === 0) return '0.00';
  return `${score > 0 ? '+' : '-'}${text}`;
}

export const capitalise = (word) => (word ? word[0].toUpperCase() + word.slice(1) : '');

// "based on 38 of 240 articles"
export function coverageText(analysed, total) {
  if (!total) return 'no articles in this period';
  if (!analysed) return `none of ${total} articles analysed yet`;
  return `based on ${analysed} of ${total} articles`;
}

// Describes news volume relative to the stock's own usual level.
export function activityLevel(ratio) {
  if (ratio == null) return null;
  if (ratio >= 1.5) return 'Busier than usual';
  if (ratio <= 0.67) return 'Quieter than usual';
  return 'About usual';
}
