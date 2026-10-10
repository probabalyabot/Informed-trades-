import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../api.js';
import AtAGlance from '../components/AtAGlance.jsx';
import CandleChart from '../components/CandleChart.jsx';
import EventTimeline from '../components/EventTimeline.jsx';
import NewsFeed, { NewsFilterTabs } from '../components/NewsFeed.jsx';
import RangeButtons from '../components/RangeButtons.jsx';
import { formatPercent, formatPrice, signClass } from '../format.js';
import { RANGES, monthsAgo } from '../lib/ranges.js';

// Keyed by symbol so the selected range, event and filter reset when the stock changes.
export default function StockPage() {
  const { symbol } = useParams();
  return <StockView key={symbol} symbol={symbol} />;
}

function StockView({ symbol }) {
  const [range, setRange] = useState(RANGES[1]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [sentimentFilter, setSentimentFilter] = useState(null);

  const from = monthsAgo(range.months);
  const stock = useApi(`/stocks/${symbol}`);
  const prices = useApi(`/stocks/${symbol}/prices?from=${from}`);
  const sentiment = useApi(`/stocks/${symbol}/sentiment?from=${from}`);
  const events = useApi(`/stocks/${symbol}/events`);
  const recentNews = useApi(
    `/stocks/${symbol}/news${sentimentFilter ? `?sentiment=${sentimentFilter}` : ''}`,
  );
  const selectedEvent = useApi(selectedEventId === null ? null : `/events/${selectedEventId}`);

  if (stock.error) return <p className="message error">{stock.error.message}</p>;
  if (!stock.data) return <p className="message">Loading…</p>;
  const s = stock.data;

  // Recent news is filtered by the API; an event's articles arrive complete
  // and are filtered here.
  const showingEvent = selectedEventId !== null;
  const news = showingEvent
    ? {
        error: selectedEvent.error,
        articles: selectedEvent.data?.articles.filter(
          (a) => !sentimentFilter || a.sentiment === sentimentFilter,
        ),
      }
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

      <AtAGlance signal={s.signal} />

      <section className="panel">
        <div className="panel-head">
          <h2>Price and news sentiment</h2>
          <RangeButtons value={range} onChange={setRange} />
        </div>
        {prices.error && <p className="message error">{prices.error.message}</p>}
        <CandleChart
          candles={prices.data ?? []}
          sentiment={sentiment.data ?? []}
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
          high news volume. It records that the two happened together, not that one led to the
          other. Select a row to read its description and see that day's articles.
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
          <div className="panel-actions">
            {showingEvent && (
              <button type="button" className="link" onClick={() => setSelectedEventId(null)}>
                Show recent news
              </button>
            )}
            <NewsFilterTabs value={sentimentFilter} onChange={setSentimentFilter} />
          </div>
        </div>
        {news.error && <p className="message error">{news.error.message}</p>}
        {!news.error && !news.articles && <p className="message">Loading…</p>}
        {news.articles && (
          <NewsFeed
            articles={news.articles}
            emptyText={
              sentimentFilter
                ? `No ${sentimentFilter} articles here. Articles that have not been analysed only appear under All.`
                : 'No articles stored for this stock.'
            }
          />
        )}
      </section>
    </>
  );
}
