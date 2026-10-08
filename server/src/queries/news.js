import { query } from '../db.js';

// Articles linked to a stock, newest first, each with its latest sentiment
// analysis (NULL columns when the article has not been analysed yet).
// from/to are whole UTC days, independent of the database session's timezone.
export async function getStockNews(stockId, { from, to, sentiment, limit }) {
  const { rows } = await query(
    `SELECT a.article_id, a.title, a.summary, a.source, a.url, a.published_at,
            la.sentiment, la.sentiment_score, la.confidence
     FROM stock_article sa
     JOIN news_article a USING (article_id)
     LEFT JOIN v_latest_analysis la USING (article_id)
     WHERE sa.stock_id = $1
       AND ($2::date IS NULL OR a.published_at >= $2::date::timestamp AT TIME ZONE 'UTC')
       AND ($3::date IS NULL OR a.published_at < ($3::date + 1)::timestamp AT TIME ZONE 'UTC')
       AND ($4::text IS NULL OR la.sentiment = $4)
     ORDER BY a.published_at DESC, a.article_id DESC
     LIMIT $5`,
    [stockId, from, to, sentiment, limit],
  );
  return rows;
}
