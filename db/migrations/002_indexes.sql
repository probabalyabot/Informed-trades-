-- Secondary indexes. Primary keys and UNIQUE constraints already cover:
--   price range scans (stock_id, timeframe, period_start), symbol lookup,
--   url de-duplication, and junction lookups by their first column.

-- Reverse direction of each junction table.
CREATE INDEX stock_article_article_idx   ON stock_article (article_id);
CREATE INDEX event_article_article_idx   ON event_article (article_id);
CREATE INDEX watchlist_stock_stock_idx   ON watchlist_stock (stock_id);

-- News feeds and daily news counts.
CREATE INDEX news_article_published_idx  ON news_article (published_at DESC);

-- Full-text search over title + summary.
CREATE INDEX news_article_search_idx     ON news_article USING GIN (search_vector);

-- "Latest analysis per article".
CREATE INDEX article_analysis_latest_idx ON article_analysis (article_id, analyzed_at DESC);

-- Recent events across all stocks.
CREATE INDEX news_price_event_date_idx   ON news_price_event (event_date DESC);
