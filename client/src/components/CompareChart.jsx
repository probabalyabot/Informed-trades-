import { LineSeries, createChart } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { formatPercent } from '../format.js';

// One colour per slot, in a fixed order checked for colour-blind separation
// on this background. A stock keeps its slot while selected (see assignSlots).
export const SLOT_COLOURS = ['#3987e5', '#d95926', '#199e70', '#c98500'];

const percent = (value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

// % change from the first day of the range for each stock, on one shared
// scale so stocks at very different prices can be compared.
//   series  [{ symbol, points: [{ time, change_pct }] }]
//   slots   { SYMBOL: slotIndex }
export default function CompareChart({ series, slots }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const linesRef = useRef(new Map());
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#9aa4b2' },
      grid: { vertLines: { color: '#1c2430' }, horzLines: { color: '#1c2430' } },
      rightPriceScale: { borderColor: '#2a3442' },
      timeScale: { borderColor: '#2a3442' },
      localization: { priceFormatter: percent },
      // Leave the mouse wheel to the page (see CandleChart).
      handleScroll: { mouseWheel: false },
      handleScale: { mouseWheel: false },
    });
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) return setHovered(null);
      const values = {};
      for (const [symbol, line] of linesRef.current) values[symbol] = param.seriesData.get(line)?.value;
      setHovered(values);
    });
    chartRef.current = chart;
    return () => {
      chartRef.current = null;
      linesRef.current = new Map();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    for (const line of linesRef.current.values()) chart.removeSeries(line);
    linesRef.current = new Map();

    for (const [index, s] of series.entries()) {
      const line = chart.addSeries(LineSeries, {
        color: SLOT_COLOURS[slots[s.symbol]],
        lineWidth: 2,
        // The symbol on the axis label names the line directly.
        title: s.symbol,
        priceLineVisible: false,
        priceFormat: { type: 'custom', formatter: percent, minMove: 0.01 },
      });
      line.setData(s.points.map((p) => ({ time: p.time, value: p.change_pct })));
      if (index === 0) {
        line.createPriceLine({
          price: 0, color: '#5b6675', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '',
        });
      }
      linesRef.current.set(s.symbol, line);
    }
    chart.timeScale().fitContent();
  }, [series, slots]);

  return (
    <figure className="chart-figure">
      <ul className="legend">
        {series.map((s) => (
          <li key={s.symbol}>
            <i className="key-swatch" style={{ background: SLOT_COLOURS[slots[s.symbol]] }} />
            <strong>{s.symbol}</strong>
            <span>{formatPercent(hovered ? hovered[s.symbol] : s.return_pct)}</span>
          </li>
        ))}
        <li className="muted">{hovered ? 'at the hovered day' : 'over the whole period'}</li>
      </ul>
      <div className="chart compare" ref={containerRef} />
      <figcaption className="chart-key">
        <span>Change in closing price since the first trading day of the period (0%).</span>
      </figcaption>
    </figure>
  );
}
