-- Alerts: when an event is detected for a stock, every user who has that stock
-- on a watchlist gets an alert. The rows are written by a trigger, never by the
-- application, so no code path that inserts an event can forget to do it.

CREATE TABLE alert (
    alert_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES app_user (user_id) ON DELETE CASCADE,
    event_id    BIGINT      NOT NULL REFERENCES news_price_event (event_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at     TIMESTAMPTZ,              -- NULL means unread
    UNIQUE (user_id, event_id)
);

-- Partial index: "my unread alerts" is the common lookup, and unread rows are a
-- shrinking share of the table, so only they are indexed.
CREATE INDEX alert_unread_idx ON alert (user_id, created_at DESC) WHERE read_at IS NULL;

-- The alert text is not stored: it is the event's explanation in v_event_summary.
CREATE FUNCTION notify_watchers() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO alert (user_id, event_id)
    -- DISTINCT: a user with the stock on two watchlists still gets one alert.
    SELECT DISTINCT w.user_id, NEW.event_id
    FROM watchlist_stock ws
    JOIN watchlist w USING (watchlist_id)
    WHERE ws.stock_id = NEW.stock_id
    ON CONFLICT (user_id, event_id) DO NOTHING;
    RETURN NULL;  -- the return value of an AFTER trigger is ignored
END $$;

-- AFTER INSERT only: detect_events() upserts, and when it merely refreshes an
-- existing event (ON CONFLICT DO UPDATE) no insert happens, so nobody is
-- alerted twice about the same event.
CREATE TRIGGER trg_event_alert
AFTER INSERT ON news_price_event
FOR EACH ROW EXECUTE FUNCTION notify_watchers();
