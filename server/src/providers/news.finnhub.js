// News provider. Finnhub is queried per ticker, so every article returned is
// already known to relate to that stock.
import { setTimeout as sleep } from 'node:timers/promises';
import { requireConfig } from '../config.js';

// Finnhub silently truncates a response at about 250 articles. A result this
// large must be treated as incomplete and re-requested over a shorter window.
export const TRUNCATION_THRESHOLD = 230;

const RATE_LIMIT_RETRIES = 3;

// from/to are 'YYYY-MM-DD' (inclusive).
// Returns [{ url, title, summary, source, publishedAt: Date }].
export async function fetchCompanyNews(symbol, from, to) {
  const params = new URLSearchParams({ symbol, from, to });
  const request = () =>
    fetch(`https://finnhub.io/api/v1/company-news?${params}`, {
      headers: { 'X-Finnhub-Token': requireConfig('finnhubApiKey') },
    });

  let res = await request();
  // The free tier allows 60 calls a minute; wait out the window and retry.
  for (let attempt = 0; res.status === 429 && attempt < RATE_LIMIT_RETRIES; attempt++) {
    await sleep(20_000);
    res = await request();
  }
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
