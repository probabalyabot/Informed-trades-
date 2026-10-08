// News provider. Finnhub is queried per ticker, so every article returned is
// already known to relate to that stock.
import { requireConfig } from '../config.js';

// from/to are 'YYYY-MM-DD' (inclusive).
// Returns [{ url, title, summary, source, publishedAt: Date }].
export async function fetchCompanyNews(symbol, from, to) {
  const params = new URLSearchParams({ symbol, from, to });
  const res = await fetch(`https://finnhub.io/api/v1/company-news?${params}`, {
    headers: { 'X-Finnhub-Token': requireConfig('finnhubApiKey') },
  });
  if (!res.ok) throw new Error(`Finnhub ${res.status} for ${symbol}: ${await res.text()}`);

  const items = await res.json();
  return items
    .filter((a) => a.url && a.headline && a.datetime)
    .map((a) => ({
      url: a.url,
      title: a.headline.trim(),
      summary: a.summary?.trim() || null,
      source: a.source || 'Unknown',
      publishedAt: new Date(a.datetime * 1000),
    }));
}
