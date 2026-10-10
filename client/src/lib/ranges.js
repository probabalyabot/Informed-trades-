// Chart date ranges shared by the stock and compare pages.
export const RANGES = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
];

// 'YYYY-MM-DD' for the day `months` months before `now`.
export function monthsAgo(months, now = new Date()) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}
