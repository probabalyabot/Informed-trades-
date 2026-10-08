// Shows an article's sentiment label and score, or that it has no analysis yet.
export default function SentimentBadge({ sentiment, score }) {
  if (!sentiment) return <span className="badge pending">not analysed</span>;
  return (
    <span className={`badge ${sentiment}`} title={`Sentiment score ${score.toFixed(2)} (-1 to 1)`}>
      {sentiment} {score > 0 ? '+' : ''}
      {score.toFixed(2)}
    </span>
  );
}
