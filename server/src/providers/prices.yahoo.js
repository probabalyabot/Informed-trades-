// Price provider. Any replacement must export fetchDailyPrices with the same
// return shape; nothing else in the app knows where prices come from.
import YahooFinance from 'yahoo-finance2';

const yahoo = new YahooFinance();

// from/to are 'YYYY-MM-DD' (to is exclusive).
// Returns [{ date: 'YYYY-MM-DD', open, high, low, close, volume }].
export async function fetchDailyPrices(symbol, from, to) {
  const { quotes } = await yahoo.chart(symbol, { period1: from, period2: to, interval: '1d' });
  return quotes
    // Yahoo returns null fields for halted days and the still-open session.
    .filter((q) => [q.open, q.high, q.low, q.close, q.volume].every(Number.isFinite))
    .map((q) => ({
      // Bars are stamped at the 13:30/14:30 UTC market open, so the UTC date is the trading date.
      date: q.date.toISOString().slice(0, 10),
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume,
    }));
}
