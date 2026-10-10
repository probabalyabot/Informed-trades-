import { formatPercent, signClass } from '../format.js';
import { averageTone } from '../lib/sentiment.js';
import SentimentBadge from './SentimentBadge.jsx';

// Detected events as scannable rows with aligned columns, newest first.
// Selecting a row reveals its description and tells the page to show that
// day's articles; selecting it again clears the selection.
export default function EventTimeline({ events, selectedEventId, onSelect }) {
  if (events.length === 0) {
    return <p className="message">No events detected for this stock in the stored period.</p>;
  }

  return (
    <div className="events">
      <div className="event-row event-columns" aria-hidden="true">
        <span>Date</span>
        <span className="num">Price move</span>
        <span>News volume</span>
        <span>Sentiment that day</span>
        <span>Severity</span>
      </div>
      <ul>
        {events.map((e) => {
          const selected = e.event_id === selectedEventId;
          return (
            <li key={e.event_id} className={selected ? 'selected' : ''}>
              <button
                type="button"
                className="event-row"
                aria-expanded={selected}
                onClick={() => onSelect(selected ? null : e.event_id)}
              >
                <strong>{e.event_date}</strong>
                <span className={`num ${signClass(e.price_change_pct)}`}>
                  {formatPercent(e.price_change_pct)}
                </span>
                <span>
                  {e.news_count} articles
                  {e.news_multiple != null && <span className="muted"> · {e.news_multiple}× usual</span>}
                </span>
                <SentimentBadge sentiment={averageTone(e.avg_sentiment)} score={e.avg_sentiment} />
                <span className={`badge severity-${e.severity}`}>{e.severity}</span>
              </button>
              {selected && <p className="event-explanation">{e.explanation}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
