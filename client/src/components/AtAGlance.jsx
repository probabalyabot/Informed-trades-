import { formatPercent, signClass } from '../format.js';
import { activityLevel } from '../lib/sentiment.js';
import SentimentGauge from './SentimentGauge.jsx';

// Three tiles summarising a stock's row from v_stock_signal: how recent news
// has read, how the price has moved, and how busy the news flow is.
export default function AtAGlance({ signal }) {
  if (!signal) return null;

  return (
    <section className="glance" aria-label="At a glance">
      <div className="glance-tiles">
        <div className="tile">
          <h2>News sentiment · last 5 trading days</h2>
          <SentimentGauge
            score={signal.sentiment_avg}
            label={signal.sentiment_label}
            trend={signal.sentiment_trend}
            analysed={signal.sentiment_analysed}
            total={signal.sentiment_articles}
          />
        </div>

        <div className="tile">
          <h2>Price trend</h2>
          <dl className="stat-pair">
            <div>
              <dt>5 trading days</dt>
              <dd className={signClass(signal.return_5d_pct)}>{formatPercent(signal.return_5d_pct)}</dd>
            </div>
            <div>
              <dt>20 trading days</dt>
              <dd className={signClass(signal.return_20d_pct)}>{formatPercent(signal.return_20d_pct)}</dd>
            </div>
          </dl>
          <p className="tile-note">Change in closing price up to {signal.as_of}.</p>
        </div>

        <div className="tile">
          <h2>News activity</h2>
          {signal.news_activity_ratio == null ? (
            <p className="gauge-value muted">Not enough history</p>
          ) : (
            <>
              <p className="gauge-value">
                {activityLevel(signal.news_activity_ratio)}{' '}
                <span className="gauge-score">{signal.news_activity_ratio.toFixed(1)}×</span>
              </p>
              <p className="tile-note">
                About {Math.round(signal.news_recent_avg)} articles a day over the last 5 trading
                days, against {Math.round(signal.news_baseline_avg)} a day over the 20 before.
              </p>
            </>
          )}
        </div>
      </div>
      <p className="note">
        These figures describe recent data. They are not a forecast and not advice.
      </p>
    </section>
  );
}
