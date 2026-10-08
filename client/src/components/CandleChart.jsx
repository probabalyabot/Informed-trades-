import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';

const UP = '#26a69a';
const DOWN = '#ef5350';
const EVENT = '#f5a524';
const EVENT_SELECTED = '#ffffff';

// Renders OHLCV rows ({ time: 'YYYY-MM-DD', open, high, low, close, volume })
// as candlesticks with a volume histogram along the bottom. Detected events
// are drawn as markers on the candle of their event_date.
export default function CandleChart({ candles, events = [], selectedEventId = null }) {
  const containerRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#9aa4b2' },
      grid: { vertLines: { color: '#1c2430' }, horzLines: { color: '#1c2430' } },
      rightPriceScale: { borderColor: '#2a3442' },
      timeScale: { borderColor: '#2a3442' },
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
    // Candles use the top 75% of the pane, volume the bottom 20%.
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.25 } });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    seriesRef.current = { chart, candle, volume, markers: createSeriesMarkers(candle, []) };
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
    // A marker needs a candle to sit on, so events outside the loaded range are left out.
    const loaded = new Set(candles.map((c) => c.time));
    seriesRef.current.markers.setMarkers(
      events
        .filter((e) => loaded.has(e.event_date))
        .map((e) => ({
          time: e.event_date,
          position: e.direction === 'up' ? 'belowBar' : 'aboveBar',
          shape: e.direction === 'up' ? 'arrowUp' : 'arrowDown',
          color: e.event_id === selectedEventId ? EVENT_SELECTED : EVENT,
          size: e.event_id === selectedEventId ? 2 : 1,
        }))
        .sort((a, b) => (a.time < b.time ? -1 : 1)),
    );
  }, [candles, events, selectedEventId]);

  return <div className="chart" ref={containerRef} />;
}
