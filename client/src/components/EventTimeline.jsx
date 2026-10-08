import { formatPercent, signClass } from '../format.js';

// Lists detected events, newest first. Selecting one tells the page to show
// that event's articles; selecting it again clears the selection.
export default function EventTimeline({ events, selectedEventId, onSelect }) {
  if (events.length === 0) {
    return <p className="message">No events detected for this stock in the stored period.</p>;
  }

  return (
    <ul className="events">
      {events.map((e) => (
        <li key={e.event_id}>
          <button
            type="button"
            className={e.event_id === selectedEventId ? 'selected' : ''}
            aria-pressed={e.event_id === selectedEventId}
            onClick={() => onSelect(e.event_id === selectedEventId ? null : e.event_id)}
          >
            <div className="event-head">
              <strong>{e.event_date}</strong>
              <span className={signClass(e.price_change_pct)}>{formatPercent(e.price_change_pct)}</span>
              <span className="muted">
                {e.news_count} articles
                {e.news_multiple != null && ` (${e.news_multiple}× usual)`}
              </span>
              <span className={`badge severity-${e.severity}`}>{e.severity}</span>
            </div>
            <p className="muted">{e.explanation}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
