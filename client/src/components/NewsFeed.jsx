import { formatDateTime } from '../format.js';
import SentimentBadge from './SentimentBadge.jsx';

export default function NewsFeed({ articles }) {
  if (articles.length === 0) return <p className="message">No articles stored for this stock.</p>;

  return (
    <ul className="news">
      {articles.map((a) => (
        <li key={a.article_id}>
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
