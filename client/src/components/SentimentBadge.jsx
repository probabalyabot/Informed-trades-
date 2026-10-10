import { capitalise, formatScore } from '../lib/sentiment.js';

// A sentiment label with its signed score, or a note that there is none.
// `sentiment` is 'positive' | 'neutral' | 'mixed' | 'negative'. The dot
// carries the colour; the text stays in normal ink so it is always readable.
export default function SentimentBadge({ sentiment, score }) {
  if (!sentiment) return <span className="badge pending">not analysed</span>;
  return (
    <span className={`badge sentiment ${sentiment}`}>
      <span className="dot" aria-hidden="true" />
      {capitalise(sentiment)} {formatScore(score)}
    </span>
  );
}
