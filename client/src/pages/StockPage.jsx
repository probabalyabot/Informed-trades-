import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../api.js';
import CandleChart from '../components/CandleChart.jsx';
import EventTimeline from '../components/EventTimeline.jsx';
import NewsFeed from '../components/NewsFeed.jsx';
import { formatPercent, formatPrice, signClass } from '../format.js';

const RANGES = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
];

// 'YYYY-MM-DD' for the day `months` months before today.
function monthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

// Keyed by symbol so the selected range and event reset when the stock changes.
export default function StockPage() {
  const { symbol } = useParams();
  return <StockView key={symbol} symbol={symbol} />;
}

function StockView({ symbol }) {
  const [range, setRange] = useState(RANGES[1]);
  const [selectedEventId, setSelectedEventId] = useState(null);

  const stock = useApi(`/stocks/${symbol}`);
  const prices = useApi(`/stocks/${symbol}/prices?from=${monthsAgo(range.months)}`);
  const events = useApi(`/stocks/${symbol}/events`);
  const recentNews = useApi(`/stocks/${symbol}/news`);
  const selectedEvent = useApi(selectedEventId === null ? null : `/events/${selectedEventId}`);

  if (stock.error) return <p className="message error">{stock.error.message}</p>;
  if (!stock.data) return <p className="message">Loading…</p>;
  const s = stock.data;

  const showingEvent = selectedEventId !== null;
  const news = showingEvent
    ? { error: selectedEvent.error, articles: selectedEvent.data?.articles }
    : { error: recentNews.error, articles: recentNews.data };

  return (
    <>
      <section className="stock-header">
        <div>
          <h1>
            {s.symbol} <span className="muted">{s.company_name}</span>
          </h1>
          <p className="muted">
            {s.exchange}
            {s.sector && ` · ${s.sector}`}
          </p>
        </div>
        <div className="quote">
          <span className="price">{formatPrice(s.last_close)}</span>
          <span className={signClass(s.change_pct)}>{formatPercent(s.change_pct)}</span>
          {s.last_date && <span className="muted">as of {s.last_date}</span>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Price</h2>
          <div className="range">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                className={r === range ? 'active' : ''}
                onClick={() => setRange(r)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {prices.error && <p className="message error">{prices.error.message}</p>}
        {prices.data?.length === 0 && (
          <p className="message">No price data stored for this period.</p>
        )}
        <CandleChart
          candles={prices.data ?? []}
          events={events.data ?? []}
          selectedEventId={selectedEventId}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Detected events</h2>
        </div>
        <p className="note">
          An event marks a day when an unusually large price move occurred alongside unusually
          high news volume. It records that the two happened together, not that one caused the
          other.
        </p>
        {events.error && <p className="message error">{events.error.message}</p>}
        {events.data && (
          <EventTimeline
            events={events.data}
            selectedEventId={selectedEventId}
            onSelect={setSelectedEventId}
          />
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            {showingEvent
              ? `News on the event day${selectedEvent.data ? ` · ${selectedEvent.data.event_date}` : ''}`
              : 'Recent news'}
          </h2>
          {showingEvent && (
            <button type="button" className="link" onClick={() => setSelectedEventId(null)}>
              Show recent news
            </button>
          )}
        </div>
        {news.error && <p className="message error">{news.error.message}</p>}
        {!news.error && !news.articles && <p className="message">Loading…</p>}
        {news.articles && <NewsFeed articles={news.articles} />}
      </section>
    </>
  );
}
