-- There is no login; the API acts as this user (see DEMO_USER_EMAIL).
INSERT INTO app_user (name, email)
VALUES ('Demo User', 'demo@informedtrades.local')
ON CONFLICT (email) DO NOTHING;

INSERT INTO watchlist (user_id, name)
SELECT user_id, 'My Watchlist' FROM app_user WHERE email = 'demo@informedtrades.local'
ON CONFLICT (user_id, name) DO NOTHING;
