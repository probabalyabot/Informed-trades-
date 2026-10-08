export const formatPrice = (n) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const formatPercent = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);

// CSS class for a signed number: 'up', 'down' or '' when flat/unknown.
export const signClass = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
