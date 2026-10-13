import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../api.js';
import SentimentGauge from '../components/SentimentGauge.jsx';
import SeverityTag from '../components/SeverityTag.jsx';
import Sparkline from '../components/Sparkline.jsx';
import { formatMultiple, formatPercent, formatPrice, signClass } from '../format.js';
import { MAX_COMPARE, MIN_COMPARE, sortStocks, toggleSelection } from '../lib/stocks.js';

function RecentEvents({ events }) {
  if (events.length === 0) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Recent events</h2>
        <span className="muted small">
          Days when a large price move occurred alongside unusually high news volume
        </span>
      </div>
      <ul className="event-cards">
        {events.map((e) => (
          <li key={e.event_id}>
            <Link to={`/stocks/${e.symbol}`} className="event-card">
              <span className="event-card-head">
                <strong>{e.symbol}</strong>
                <span className={signClass(e.price_change_pct)}>{formatPercent(e.price_change_pct)}</span>
              </span>
              <span className="muted">{e.event_date}</span>
              <span className="muted">
                {e.news_count} articles
                {e.news_multiple != null && ` · ${e.news_multiple}× usual`}
              </span>
              <SeverityTag severity={e.severity} label={`${e.severity} severity`} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// A column header that sorts the table. Numeric columns start descending.
function SortHeader({ label, sortKey, sort, onSort, numeric = false }) {
  const active = sort.key === sortKey;
  return (
    <th
      className={numeric ? 'num' : ''}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={`sort ${active ? 'active' : ''}`}
        onClick={() =>
          onSort({
            key: sortKey,
            direction: active ? (sort.direction === 'asc' ? 'desc' : 'asc') : numeric ? 'desc' : 'asc',
          })
        }
      >
        {label}
        <span aria-hidden="true">{active ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  );
}

export default function Dashboard() {
  const { data, error } = useApi('/dashboard');
  const [sort, setSort] = useState({ key: 'symbol', direction: 'asc' });
  const [selected, setSelected] = useState([]);
  const navigate = useNavigate();

  if (error) return <p className="message error">{error.message}</p>;
  if (!data) return <p className="message">Loading…</p>;

  const stocks = sortStocks(data.stocks, sort.key, sort.direction);
  const canCompare = selected.length >= MIN_COMPARE;

  return (
    <>
      <RecentEvents events={data.recent_events} />

      <section className="panel">
        <div className="panel-head">
          <h2>Stocks</h2>
          <div className="panel-actions">
            <span className="muted small">
              {selected.length === 0
                ? `Tick ${MIN_COMPARE} to ${MAX_COMPARE} stocks to compare them`
                : `${selected.length} selected`}
            </span>
            <button
              type="button"
              className="primary"
              disabled={!canCompare}
              onClick={() => navigate(`/compare?symbols=${selected.join(',')}`)}
            >
              Compare
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="stocks">
            <thead>
              <tr>
                <th><span className="sr-only">Select to compare</span></th>
                <SortHeader label="Stock" sortKey="symbol" sort={sort} onSort={setSort} />
                <th>Last 30 days</th>
                <th className="num">Last close</th>
                <SortHeader label="Day" sortKey="change" sort={sort} onSort={setSort} numeric />
                <SortHeader label="5 days" sortKey="return5d" sort={sort} onSort={setSort} numeric />
                <SortHeader label="News sentiment (5 days)" sortKey="sentiment" sort={sort} onSort={setSort} />
                <SortHeader label="News activity" sortKey="news" sort={sort} onSort={setSort} numeric />
                <th>Latest event</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s) => {
                const g = s.signal;
                const checked = selected.includes(s.symbol);
                return (
                  <tr key={s.symbol} className={checked ? 'selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Compare ${s.symbol}`}
                        checked={checked}
                        disabled={!checked && selected.length >= MAX_COMPARE}
                        onChange={() => setSelected(toggleSelection(selected, s.symbol))}
                      />
                    </td>
                    <td>
                      <Link to={`/stocks/${s.symbol}`} className="symbol">{s.symbol}</Link>
                      <span className="company muted">{s.company_name}</span>
                    </td>
                    <td><Sparkline values={s.sparkline} label={`${s.symbol} closing price`} /></td>
                    <td className="num">{formatPrice(s.last_close)}</td>
                    <td className={`num ${signClass(s.change_pct)}`}>{formatPercent(s.change_pct)}</td>
                    <td className={`num ${signClass(g?.return_5d_pct)}`}>{formatPercent(g?.return_5d_pct)}</td>
                    <td>
                      <SentimentGauge
                        compact
                        score={g?.sentiment_avg}
                        label={g?.sentiment_label}
                        analysed={g?.sentiment_analysed}
                        total={g?.sentiment_articles}
                      />
                    </td>
                    <td className="num">{formatMultiple(g?.news_activity_ratio)}</td>
                    <td>
                      {g?.latest_event_date ? (
                        <span>
                          {g.latest_event_date}{' '}
                          <span className="muted">{g.latest_event_direction === 'up' ? '▲' : '▼'}</span>{' '}
                          <SeverityTag severity={g.latest_event_severity} />
                        </span>
                      ) : (
                        <span className="muted">none</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          Sentiment is the average of analysed articles over the last 5 trading days and is only
          labelled when at least 5 were analysed. News activity compares the last 5 trading days
          with the 20 before. These describe recent data; they are not a forecast and not advice.
        </p>
      </section>
    </>
  );
}
