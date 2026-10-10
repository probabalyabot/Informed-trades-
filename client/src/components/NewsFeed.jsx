import { formatDateTime } from '../format.js';
import SentimentBadge from './SentimentBadge.jsx';

export const NEWS_FILTERS = [
  { value: null, label: 'All' },
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
];

export function NewsFilterTabs({ value, onChange }) {
  return (
    <div className="tabs" role="group" aria-label="Filter news by sentiment">
      {NEWS_FILTERS.map((f) => (
        <button
          key={f.label}
          type="button"
          className={f.value === value ? 'active' : ''}
          aria-pressed={f.value === value}
          onClick={() => onChange(f.value)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export default function NewsFeed({ articles, emptyText = 'No articles to show.' }) {
  if (articles.length === 0) return <p className="message">{emptyText}</p>;

  return (
    <ul className="news">
      {articles.map((a) => (
        // The coloured edge repeats the badge's sentiment so a long list can be skimmed.
        <li key={a.article_id} className={a.sentiment ?? 'pending'}>
          <div className="news-meta">
            <span className="muted">
              {a.source} · {formatDateTime(a.published_at)}
            </span>
            <SentimentBadge sentiment={a.sentiment} score={a.sentiment_score} />
          </div>
          <a href={a.url} target="_blank" rel="noreferrer">
            {a.title}
          </a>
          {a.summary && <p className="news-summary muted">{a.summary}</p>}
        </li>
      ))}
    </ul>
  );
}
