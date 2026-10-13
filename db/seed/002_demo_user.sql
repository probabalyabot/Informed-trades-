-- There is no login; the API acts as this user (see DEMO_USER_EMAIL).
INSERT INTO app_user (name, email)
VALUES ('Demo User', 'demo@informedtrades.local')
ON CONFLICT (email) DO NOTHING;

INSERT INTO watchlist (user_id, name)
SELECT user_id, 'My Watchlist' FROM app_user WHERE email = 'demo@informedtrades.local'
ON CONFLICT (user_id, name) DO NOTHING;

-- Starting stocks for that watchlist, so alerts have someone to notify. Only
-- added while the watchlist is empty: seeds re-run, and must not undo the
-- user's own changes.
INSERT INTO watchlist_stock (watchlist_id, stock_id)
SELECT w.watchlist_id, s.stock_id
FROM watchlist w
JOIN app_user u USING (user_id)
CROSS JOIN stock s
WHERE u.email = 'demo@informedtrades.local'
  AND w.name = 'My Watchlist'
  AND s.symbol IN ('AAPL', 'MSFT', 'NVDA', 'TSLA', 'META')
  AND NOT EXISTS (SELECT 1 FROM watchlist_stock ws WHERE ws.watchlist_id = w.watchlist_id);
