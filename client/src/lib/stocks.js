// Sorting and selection helpers for the stock table and the compare page.

export const MAX_COMPARE = 4;
export const MIN_COMPARE = 2;

// How each sortable column reads its value from a dashboard stock row.
export const SORT_KEYS = {
  symbol: (s) => s.symbol,
  change: (s) => s.change_pct,
  return5d: (s) => s.signal?.return_5d_pct,
  // Only stocks with enough analysed articles to carry a label are ranked.
  sentiment: (s) => (s.signal?.sentiment_label ? s.signal.sentiment_avg : null),
  news: (s) => s.signal?.news_activity_ratio,
};

// Returns a sorted copy. Rows with no value for the key always go last,
// whichever direction is chosen; ties fall back to the symbol.
export function sortStocks(stocks, key, direction = 'asc') {
  const read = SORT_KEYS[key] ?? SORT_KEYS.symbol;
  const sign = direction === 'desc' ? -1 : 1;
  return [...stocks].sort((a, b) => {
    const [x, y] = [read(a), read(b)];
    if (x == null || y == null) {
      if (x == null && y == null) return a.symbol.localeCompare(b.symbol);
      return x == null ? 1 : -1;
    }
    const order = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return order === 0 ? a.symbol.localeCompare(b.symbol) : order * sign;
  });
}

// Adds or removes a symbol from the compare selection, never exceeding the maximum.
export function toggleSelection(selected, symbol) {
  if (selected.includes(symbol)) return selected.filter((s) => s !== symbol);
  if (selected.length >= MAX_COMPARE) return selected;
  return [...selected, symbol];
}

// Gives every symbol a colour slot (0..MAX_COMPARE-1). A symbol keeps its slot
// for as long as it stays selected, so removing one stock never repaints the
// others; a newly added symbol takes the lowest free slot.
export function assignSlots(previous, symbols) {
  const slots = {};
  for (const symbol of symbols) {
    if (symbol in previous) slots[symbol] = previous[symbol];
  }
  for (const symbol of symbols) {
    if (symbol in slots) continue;
    const taken = new Set(Object.values(slots));
    let slot = 0;
    while (taken.has(slot)) slot++;
    slots[symbol] = slot;
  }
  return slots;
}

// "aapl, MSFT,aapl" -> ['AAPL', 'MSFT'] (at most MAX_COMPARE)
export function parseSymbolsParam(value) {
  if (!value) return [];
  const symbols = value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return [...new Set(symbols)].slice(0, MAX_COMPARE);
}
