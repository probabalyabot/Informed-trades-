import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api.js';
import CompareChart, { SLOT_COLOURS } from '../components/CompareChart.jsx';
import RangeButtons from '../components/RangeButtons.jsx';
import SentimentBadge from '../components/SentimentBadge.jsx';
import { formatPercent, signClass } from '../format.js';
import { RANGES, monthsAgo } from '../lib/ranges.js';
import { averageTone, coverageText } from '../lib/sentiment.js';
import {
  MAX_COMPARE, MIN_COMPARE, assignSlots, parseSymbolsParam, toggleSelection,
} from '../lib/stocks.js';

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState(RANGES[1]);
  const symbols = parseSymbolsParam(params.get('symbols'));

  // Colour slots persist across changes so removing a stock does not repaint the rest.
  const slotsRef = useRef({});
  const selectionKey = symbols.join(',');
  const slots = useMemo(() => {
    slotsRef.current = assignSlots(slotsRef.current, parseSymbolsParam(selectionKey));
    return slotsRef.current;
  }, [selectionKey]);

  const enough = symbols.length >= MIN_COMPARE;
  const allStocks = useApi('/stocks');
  const comparison = useApi(
    enough ? `/compare?symbols=${symbols.join(',')}&from=${monthsAgo(range.months)}` : null,
  );
  // While a new selection loads, keep showing only the stocks still selected.
  const series = enough
    ? (comparison.data?.series ?? []).filter((s) => symbols.includes(s.symbol))
    : [];

  const toggle = (symbol) => {
    const next = toggleSelection(symbols, symbol);
    setParams(next.length ? { symbols: next.join(',') } : {}, { replace: true });
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Compare stocks</h2>
          <span className="muted small">
            Choose {MIN_COMPARE} to {MAX_COMPARE} · {symbols.length} selected
          </span>
        </div>
        {allStocks.error && <p className="message error">{allStocks.error.message}</p>}
        <div className="chips">
          {(allStocks.data ?? []).map((s) => {
            const on = symbols.includes(s.symbol);
            return (
              <button
                key={s.symbol}
                type="button"
                className={`chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                title={s.company_name}
                disabled={!on && symbols.length >= MAX_COMPARE}
                onClick={() => toggle(s.symbol)}
              >
                {on && <i className="key-swatch" style={{ background: SLOT_COLOURS[slots[s.symbol]] }} />}
                {s.symbol}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Price change over the period</h2>
          <RangeButtons value={range} onChange={setRange} />
        </div>
        {!enough && <p className="message">Select at least {MIN_COMPARE} stocks above to compare them.</p>}
        {enough && comparison.error && <p className="message error">{comparison.error.message}</p>}
        {enough && !comparison.error && series.length === 0 && <p className="message">Loading…</p>}
        {series.length > 0 && <CompareChart series={series} slots={slots} />}
      </section>

      {series.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Over the same period</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Stock</th>
                  <th className="num">Price change</th>
                  <th>Average news sentiment</th>
                  <th className="num">Detected events</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.symbol}>
                    <td>
                      <i className="key-swatch" style={{ background: SLOT_COLOURS[slots[s.symbol]] }} />{' '}
                      <Link to={`/stocks/${s.symbol}`} className="symbol">{s.symbol}</Link>
                      <span className="company muted">{s.company_name}</span>
                    </td>
                    <td className={`num ${signClass(s.return_pct)}`}>{formatPercent(s.return_pct)}</td>
                    <td>
                      <SentimentBadge sentiment={averageTone(s.avg_sentiment)} score={s.avg_sentiment} />{' '}
                      <span className="muted small">{coverageText(s.analysed_count, s.article_count)}</span>
                    </td>
                    <td className="num">{s.event_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Figures describe what was observed in this period. They are not a forecast and not advice.
          </p>
        </section>
      )}
    </>
  );
}
