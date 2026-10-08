-- Integrity tests. Run with:  npm run db:test   (from server/)
-- Everything happens inside one transaction that is rolled back, so the
-- database is left untouched. Each check raises NOTICE 'PASS ...' or aborts.

BEGIN;

-- Runs a statement that must be rejected with the given SQLSTATE.
CREATE FUNCTION pg_temp.expect_fail(p_label TEXT, p_sqlstate TEXT, p_sql TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = p_sqlstate THEN
            RAISE NOTICE 'PASS  %', p_label;
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL  %: expected SQLSTATE %, got % (%)', p_label, p_sqlstate, SQLSTATE, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  %: statement was accepted', p_label;
END $$;

CREATE FUNCTION pg_temp.expect_count(p_label TEXT, p_expected BIGINT, p_sql TEXT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_actual BIGINT;
BEGIN
    EXECUTE p_sql INTO v_actual;
    IF v_actual IS DISTINCT FROM p_expected THEN
        RAISE EXCEPTION 'FAIL  %: expected %, got %', p_label, p_expected, v_actual;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

-- Fixture -----------------------------------------------------------------
INSERT INTO app_user (name, email) VALUES ('T User', 't@test.local');
INSERT INTO stock (symbol, company_name, exchange) VALUES ('TST', 'Test Corp', 'NYSE'), ('TSU', 'Test Two', 'NYSE');
INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
    SELECT stock_id, DATE '2026-01-05', 10, 12, 9, 11, 1000 FROM stock WHERE symbol = 'TST';
INSERT INTO news_article (url, title, summary, source, published_at)
    VALUES ('https://test.local/a1', 'Test Corp beats earnings', 'Strong quarter', 'TestWire', '2026-01-05 15:00+00');
INSERT INTO stock_article (stock_id, article_id)
    SELECT s.stock_id, a.article_id FROM stock s, news_article a
    WHERE s.symbol IN ('TST', 'TSU') AND a.url = 'https://test.local/a1';
INSERT INTO article_analysis (article_id, sentiment, sentiment_score, confidence, model, prompt_version)
    SELECT article_id, 'positive', 0.8, 0.9, 'm1', 'v1' FROM news_article WHERE url = 'https://test.local/a1';
INSERT INTO watchlist (user_id, name) SELECT user_id, 'WL' FROM app_user WHERE email = 't@test.local';
INSERT INTO watchlist_stock (watchlist_id, stock_id)
    SELECT w.watchlist_id, s.stock_id FROM watchlist w, stock s WHERE w.name = 'WL' AND s.symbol = 'TST';
INSERT INTO news_price_event (stock_id, event_date, price_change_pct, news_count, baseline_news_avg, direction, severity)
    SELECT stock_id, DATE '2026-01-05', 5.5, 4, 1.0, 'up', 'medium' FROM stock WHERE symbol = 'TST';
INSERT INTO event_article (event_id, article_id)
    SELECT e.event_id, a.article_id FROM news_price_event e, news_article a WHERE a.url = 'https://test.local/a1';

-- UNIQUE / duplicate prevention --------------------------------------------
SELECT pg_temp.expect_fail('duplicate stock symbol', '23505',
    $$INSERT INTO stock (symbol, company_name, exchange) VALUES ('TST', 'Dup', 'NYSE')$$);
SELECT pg_temp.expect_fail('duplicate user email', '23505',
    $$INSERT INTO app_user (name, email) VALUES ('X', 't@test.local')$$);
SELECT pg_temp.expect_fail('duplicate candle (stock, timeframe, period_start)', '23505',
    $$INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
      SELECT stock_id, DATE '2026-01-05', 10, 12, 9, 11, 1 FROM stock WHERE symbol = 'TST'$$);
SELECT pg_temp.expect_fail('duplicate article url', '23505',
    $$INSERT INTO news_article (url, title, source, published_at) VALUES ('https://test.local/a1', 'x', 's', now())$$);
SELECT pg_temp.expect_fail('duplicate stock-article link', '23505',
    $$INSERT INTO stock_article SELECT stock_id, article_id FROM stock_article LIMIT 1$$);
SELECT pg_temp.expect_fail('duplicate analysis for same model + prompt', '23505',
    $$INSERT INTO article_analysis (article_id, sentiment, sentiment_score, confidence, model, prompt_version)
      SELECT article_id, 'neutral', 0, 0.5, 'm1', 'v1' FROM news_article WHERE url = 'https://test.local/a1'$$);
SELECT pg_temp.expect_fail('duplicate event for stock + date', '23505',
    $$INSERT INTO news_price_event (stock_id, event_date, price_change_pct, news_count, baseline_news_avg, direction, severity)
      SELECT stock_id, DATE '2026-01-05', 1, 3, 1, 'up', 'low' FROM stock WHERE symbol = 'TST'$$);
SELECT pg_temp.expect_fail('duplicate watchlist name per user', '23505',
    $$INSERT INTO watchlist (user_id, name) SELECT user_id, 'WL' FROM app_user WHERE email = 't@test.local'$$);

-- CHECK constraints ----------------------------------------------------------
SELECT pg_temp.expect_fail('lowercase symbol', '23514',
    $$INSERT INTO stock (symbol, company_name, exchange) VALUES ('abc', 'x', 'NYSE')$$);
SELECT pg_temp.expect_fail('high below close', '23514',
    $$INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
      SELECT stock_id, DATE '2026-01-06', 10, 10.5, 9, 11, 1 FROM stock WHERE symbol = 'TST'$$);
SELECT pg_temp.expect_fail('low above open', '23514',
    $$INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
      SELECT stock_id, DATE '2026-01-06', 10, 12, 10.5, 11, 1 FROM stock WHERE symbol = 'TST'$$);
SELECT pg_temp.expect_fail('non-positive price', '23514',
    $$INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
      SELECT stock_id, DATE '2026-01-06', 1, 2, 0, 1, 1 FROM stock WHERE symbol = 'TST'$$);
SELECT pg_temp.expect_fail('negative volume', '23514',
    $$INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
      SELECT stock_id, DATE '2026-01-06', 10, 12, 9, 11, -1 FROM stock WHERE symbol = 'TST'$$);
SELECT pg_temp.expect_fail('unsupported timeframe', '23514',
    $$INSERT INTO price_history (stock_id, timeframe, period_start, open, high, low, close, volume)
      SELECT stock_id, '5m', DATE '2026-01-06', 10, 12, 9, 11, 1 FROM stock WHERE symbol = 'TST'$$);
SELECT pg_temp.expect_fail('invalid sentiment label', '23514',
    $$INSERT INTO article_analysis (article_id, sentiment, sentiment_score, confidence, model, prompt_version)
      SELECT article_id, 'bullish', 0, 0.5, 'm2', 'v1' FROM news_article LIMIT 1$$);
SELECT pg_temp.expect_fail('sentiment score out of range', '23514',
    $$INSERT INTO article_analysis (article_id, sentiment, sentiment_score, confidence, model, prompt_version)
      SELECT article_id, 'positive', 1.5, 0.5, 'm2', 'v1' FROM news_article LIMIT 1$$);
SELECT pg_temp.expect_fail('confidence out of range', '23514',
    $$INSERT INTO article_analysis (article_id, sentiment, sentiment_score, confidence, model, prompt_version)
      SELECT article_id, 'positive', 0.5, -0.1, 'm2', 'v1' FROM news_article LIMIT 1$$);
SELECT pg_temp.expect_fail('invalid event direction', '23514',
    $$INSERT INTO news_price_event (stock_id, event_date, price_change_pct, news_count, baseline_news_avg, direction, severity)
      SELECT stock_id, DATE '2026-01-07', 1, 3, 1, 'sideways', 'low' FROM stock WHERE symbol = 'TST'$$);
SELECT pg_temp.expect_fail('blank watchlist name', '23514',
    $$INSERT INTO watchlist (user_id, name) SELECT user_id, '  ' FROM app_user WHERE email = 't@test.local'$$);

-- NOT NULL / foreign keys -----------------------------------------------------
SELECT pg_temp.expect_fail('article without title', '23502',
    $$INSERT INTO news_article (url, source, published_at) VALUES ('https://test.local/a2', 's', now())$$);
SELECT pg_temp.expect_fail('price for unknown stock', '23503',
    $$INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume) VALUES (-1, DATE '2026-01-06', 10, 12, 9, 11, 1)$$);
SELECT pg_temp.expect_fail('analysis for unknown article', '23503',
    $$INSERT INTO article_analysis (article_id, sentiment, sentiment_score, confidence, model, prompt_version) VALUES (-1, 'neutral', 0, 0.5, 'm', 'v')$$);
SELECT pg_temp.expect_fail('watchlist for unknown user', '23503',
    $$INSERT INTO watchlist (user_id, name) VALUES (-1, 'x')$$);

-- N:M and generated column ------------------------------------------------------
SELECT pg_temp.expect_count('one article linked to two stocks', 2,
    $$SELECT count(*) FROM stock_article sa JOIN news_article a USING (article_id) WHERE a.url = 'https://test.local/a1'$$);
SELECT pg_temp.expect_count('full-text search matches stemmed word', 1,
    $$SELECT count(*) FROM news_article WHERE url = 'https://test.local/a1' AND search_vector @@ websearch_to_tsquery('english', 'earning')$$);

-- Cascades ------------------------------------------------------------------
DELETE FROM news_article WHERE url = 'https://test.local/a1';
SELECT pg_temp.expect_count('deleting article removes its analyses', 0,
    $$SELECT count(*) FROM article_analysis WHERE model = 'm1'$$);
SELECT pg_temp.expect_count('deleting article removes stock links', 0,
    $$SELECT count(*) FROM stock_article sa JOIN stock s USING (stock_id) WHERE s.symbol IN ('TST', 'TSU')$$);
SELECT pg_temp.expect_count('deleting article removes event links but keeps event', 1,
    $$SELECT count(*) FROM news_price_event e JOIN stock s USING (stock_id)
      WHERE s.symbol = 'TST' AND NOT EXISTS (SELECT 1 FROM event_article ea WHERE ea.event_id = e.event_id)$$);

DELETE FROM stock WHERE symbol = 'TST';
SELECT pg_temp.expect_count('deleting stock removes its prices', 0,
    $$SELECT count(*) FROM price_history WHERE period_start = DATE '2026-01-05' AND volume = 1000$$);
SELECT pg_temp.expect_count('deleting stock removes its events', 0,
    $$SELECT count(*) FROM news_price_event WHERE event_date = DATE '2026-01-05' AND price_change_pct = 5.5$$);
SELECT pg_temp.expect_count('deleting stock empties watchlist but keeps it', 1,
    $$SELECT count(*) FROM watchlist w WHERE w.name = 'WL'
      AND NOT EXISTS (SELECT 1 FROM watchlist_stock ws WHERE ws.watchlist_id = w.watchlist_id)$$);

DELETE FROM app_user WHERE email = 't@test.local';
SELECT pg_temp.expect_count('deleting user removes watchlists', 0,
    $$SELECT count(*) FROM watchlist WHERE name = 'WL'$$);

ROLLBACK;
