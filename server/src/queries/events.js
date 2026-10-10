import { query } from '../db.js';

export async function getStockEvents(stockId) {
  const { rows } = await query(
    `SELECT * FROM v_event_summary WHERE stock_id = $1 ORDER BY event_date DESC`,
    [stockId],
  );
  return rows;
}

// The newest events across all stocks.
export async function getRecentEvents(limit) {
  const { rows } = await query(
    `SELECT * FROM v_event_summary ORDER BY event_date DESC, event_id DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function getEvent(eventId) {
  const { rows } = await query(`SELECT * FROM v_event_summary WHERE event_id = $1`, [eventId]);
  return rows[0];
}

// The articles that counted toward an event's trading day, through the
// event_article junction, each with its latest sentiment analysis.
export async function getEventArticles(eventId) {
  const { rows } = await query(
    `SELECT a.article_id, a.title, a.summary, a.source, a.url, a.published_at,
            la.sentiment, la.sentiment_score, la.confidence
     FROM event_article ea
     JOIN news_article a USING (article_id)
     LEFT JOIN v_latest_analysis la USING (article_id)
     WHERE ea.event_id = $1
     ORDER BY a.published_at DESC, a.article_id DESC`,
    [eventId],
  );
  return rows;
}
