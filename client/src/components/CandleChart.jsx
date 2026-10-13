import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPercent, formatPrice, formatVolume } from '../format.js';
import { averageTone, formatScore } from '../lib/sentiment.js';

// Price colours. Sentiment deliberately uses a different pair so a negative
// sentiment bar is never read as a falling price.
const UP = '#26a69a';
const DOWN = '#ef5350';
const EVENT = '#f5a524';
const EVENT_SELECTED = '#ffffff';
const SENTIMENT = { positive: '#3987e5', negative: '#d95926', mixed: '#8f8f8f' };

const SENTIMENT_PANE_HEIGHT = 96;
// A day's average resting on fewer analysed articles than this is drawn faded.
const THIN_COVERAGE = 3;

// lightweight-charts reports a hovered day as the string we supplied or as a
// { year, month, day } object, depending on the version.
function toDateKey(time) {
  if (time == null) return null;
  if (typeof time === 'string') return time;
  if (typeof time === 'object') {
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
  }
  return new Date(time * 1000).toISOString().slice(0, 10);
}

// Candlesticks with volume, detected events as markers on their candle, and a
// lane underneath showing each day's average news sentiment on the same time
// axis (its own pane and its own -1..+1 scale; never overlaid on price).
//   candles    [{ time: 'YYYY-MM-DD', open, high, low, close, volume }]
//   sentiment  [{ time, avg_sentiment, analysed_count, news_count }]
//   events     [{ event_id, event_date, direction, price_change_pct }]
export default function CandleChart({ candles, sentiment = [], events = [], selectedEventId = null }) {
  const containerRef = useRef(null);
  const seriesRef = useRef(null);
  const [hoveredDay, setHoveredDay] = useState(null);

  const candleByDay = useMemo(() => new Map(candles.map((c) => [c.time, c])), [candles]);
  const sentimentByDay = useMemo(() => new Map(sentiment.map((d) => [d.time, d])), [sentiment]);

  useEffect(() => {
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#8f8f8f',
        panes: { separatorColor: '#2a2a2a', enableResize: false },
      },
      grid: { vertLines: { color: '#161616' }, horzLines: { color: '#161616' } },
      rightPriceScale: { borderColor: '#2a2a2a' },
      timeScale: { borderColor: '#2a2a2a' },
      // Leave the mouse wheel to the page; the chart sits in a long scrolling
      // page and would otherwise swallow every scroll that passes over it.
      handleScroll: { mouseWheel: false },
      handleScale: { mouseWheel: false },
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    // Candles use the top 75% of the price pane, volume the bottom 20%.
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.25 } });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const sentimentBars = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
        lastValueVisible: false,
        priceLineVisible: false,
        // Fixed scale, so the same bar height means the same score on every stock.
        autoscaleInfoProvider: () => ({ priceRange: { minValue: -1, maxValue: 1 } }),
      },
      1,
    );
    chart.panes()[1]?.setHeight(SENTIMENT_PANE_HEIGHT);

    chart.subscribeCrosshairMove((param) => setHoveredDay(toDateKey(param.time)));

    seriesRef.current = {
      chart, candle, volume, sentimentBars, markers: createSeriesMarkers(candle, []),
    };
    return () => {
      seriesRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const { chart, candle, volume } = seriesRef.current;
    candle.setData(candles);
    volume.setData(
      candles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? `${UP}80` : `${DOWN}80`,
      })),
    );
    chart.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    // The lane can only show days that have a candle.
    const days = sentiment.filter((d) => candleByDay.has(d.time));
    seriesRef.current.sentimentBars.setData(
      days.map((d) => {
        // No analysed articles: leave the day blank, do not draw a zero.
        if (d.avg_sentiment == null) return { time: d.time };
        const colour = SENTIMENT[averageTone(d.avg_sentiment)];
        return {
          time: d.time,
          // An average of exactly 0 would be an invisible bar; give it a sliver.
          value: Math.abs(d.avg_sentiment) < 0.03 ? 0.03 : d.avg_sentiment,
          color: d.analysed_count < THIN_COVERAGE ? `${colour}66` : colour,
        };
      }),
    );
  }, [sentiment, candleByDay]);

  useEffect(() => {
    // A marker needs a candle to sit on, so events outside the loaded range are left out.
    seriesRef.current.markers.setMarkers(
      events
        .filter((e) => candleByDay.has(e.event_date))
        .map((e) => {
          const selected = e.event_id === selectedEventId;
          return {
            time: e.event_date,
            position: e.direction === 'up' ? 'belowBar' : 'aboveBar',
            shape: e.direction === 'up' ? 'arrowUp' : 'arrowDown',
            color: selected ? EVENT_SELECTED : EVENT,
            size: selected ? 2 : 1,
            text: formatPercent(e.price_change_pct),
          };
        })
        .sort((a, b) => (a.time < b.time ? -1 : 1)),
    );
  }, [candleByDay, events, selectedEventId]);

  // The readout follows the crosshair and falls back to the latest candle.
  const shownDay = candleByDay.has(hoveredDay) ? hoveredDay : candles.at(-1)?.time;
  const c = candleByDay.get(shownDay);
  const s = sentimentByDay.get(shownDay);

  return (
    <figure className="chart-figure">
      <div className="chart-readout" aria-live="off">
        {c ? (
          <>
            <strong>{c.time}</strong>
            <span>O {formatPrice(c.open)}</span>
            <span>H {formatPrice(c.high)}</span>
            <span>L {formatPrice(c.low)}</span>
            <span>C {formatPrice(c.close)}</span>
            <span>Vol {formatVolume(c.volume)}</span>
            {s && (
              <span className="readout-sentiment">
                Sentiment{' '}
                {s.avg_sentiment == null
                  ? `not analysed (${s.news_count} articles)`
                  : `${formatScore(s.avg_sentiment)} from ${s.analysed_count} of ${s.news_count} articles`}
              </span>
            )}
          </>
        ) : (
          <span className="muted">No price data in this range.</span>
        )}
      </div>
      <div className="chart" ref={containerRef} />
      <figcaption className="chart-key">
        <span><i className="key-swatch event" /> Detected event, labelled with that day's move</span>
        <span>
          Lower lane, average sentiment of each day's analysed articles (−1 to +1):
          <i className="key-swatch positive" /> positive
          <i className="key-swatch mixed" /> mixed
          <i className="key-swatch negative" /> negative
        </span>
        <span>Faded bars rest on fewer than {THIN_COVERAGE} articles; blank days have none analysed.</span>
      </figcaption>
    </figure>
  );
}
