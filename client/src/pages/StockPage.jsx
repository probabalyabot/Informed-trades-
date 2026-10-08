import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../api.js';
import CandleChart from '../components/CandleChart.jsx';
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

export default function StockPage() {
  const { symbol } = useParams();
  const [range, setRange] = useState(RANGES[2]);

  const stock = useApi(`/stocks/${symbol}`);
  const prices = useApi(`/stocks/${symbol}/prices?from=${monthsAgo(range.months)}`);
  const news = useApi(`/stocks/${symbol}/news`);

  if (stock.error) return <p className="message error">{stock.error.message}</p>;
  if (!stock.data) return <p className="message">Loading…</p>;
  const s = stock.data;

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
        <CandleChart candles={prices.data ?? []} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent news</h2>
        </div>
        {news.error && <p className="message error">{news.error.message}</p>}
        {news.data && <NewsFeed articles={news.data} />}
      </section>
    </>
  );
}
