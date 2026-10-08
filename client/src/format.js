export const formatPrice = (n) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const formatPercent = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);

// ISO timestamp -> e.g. "Oct 8, 2026, 3:10 PM" in the viewer's timezone.
export const formatDateTime = (isoString) =>
  new Date(isoString).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

// CSS class for a signed number: 'up', 'down' or '' when flat/unknown.
export const signClass = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
