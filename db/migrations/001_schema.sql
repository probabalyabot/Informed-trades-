-- Informed Trades: base schema (10 tables).
-- Raw data: stock, price_history, news_article
-- AI-derived: article_analysis
-- Associations (N:M): stock_article, event_article, watchlist_stock
-- Analytical result: news_price_event

CREATE TABLE app_user (
    user_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock (
    stock_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol        TEXT NOT NULL UNIQUE,
    company_name  TEXT NOT NULL,
    exchange      TEXT NOT NULL,
    sector        TEXT,
    CONSTRAINT stock_symbol_upper CHECK (symbol = upper(symbol) AND symbol <> '')
);

-- One row per candle. A candle is identified by (stock, timeframe, period start);
-- candlesticks are rendered from these rows, never stored separately.
CREATE TABLE price_history (
    stock_id      BIGINT        NOT NULL REFERENCES stock (stock_id) ON DELETE CASCADE,
    timeframe     TEXT          NOT NULL DEFAULT '1d',
    period_start  DATE          NOT NULL,
    open          NUMERIC(12,4) NOT NULL,
    high          NUMERIC(12,4) NOT NULL,
    low           NUMERIC(12,4) NOT NULL,
    close         NUMERIC(12,4) NOT NULL,
    volume        BIGINT        NOT NULL,
    PRIMARY KEY (stock_id, timeframe, period_start),
    CONSTRAINT price_history_timeframe CHECK (timeframe = '1d'),
    CONSTRAINT price_history_ohlc CHECK (
        low > 0
        AND high >= greatest(open, close)
        AND low  <= least(open, close)
    ),
    CONSTRAINT price_history_volume CHECK (volume >= 0)
);

CREATE TABLE watchlist (
    watchlist_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES app_user (user_id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT watchlist_name_not_blank CHECK (btrim(name) <> ''),
    UNIQUE (user_id, name)
);

CREATE TABLE watchlist_stock (
    watchlist_id  BIGINT      NOT NULL REFERENCES watchlist (watchlist_id) ON DELETE CASCADE,
    stock_id      BIGINT      NOT NULL REFERENCES stock (stock_id) ON DELETE CASCADE,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (watchlist_id, stock_id)
);

-- Source data only; AI output lives in article_analysis.
CREATE TABLE news_article (
    article_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    url            TEXT        NOT NULL UNIQUE,
    title          TEXT        NOT NULL,
    summary        TEXT,
    source         TEXT        NOT NULL,
    published_at   TIMESTAMPTZ NOT NULL,
    ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    search_vector  TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', title || ' ' || coalesce(summary, ''))
    ) STORED
);

CREATE TABLE stock_article (
    stock_id    BIGINT NOT NULL REFERENCES stock (stock_id) ON DELETE CASCADE,
    article_id  BIGINT NOT NULL REFERENCES news_article (article_id) ON DELETE CASCADE,
    PRIMARY KEY (stock_id, article_id)
);

-- 1:N from news_article: an article can be re-analysed by another model or prompt
-- without losing earlier results.
CREATE TABLE article_analysis (
    analysis_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_id       BIGINT       NOT NULL REFERENCES news_article (article_id) ON DELETE CASCADE,
    sentiment        TEXT         NOT NULL,
    sentiment_score  NUMERIC(4,3) NOT NULL,
    confidence       NUMERIC(4,3) NOT NULL,
    model            TEXT         NOT NULL,
    prompt_version   TEXT         NOT NULL,
    analyzed_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    raw_response     JSONB,
    CONSTRAINT article_analysis_sentiment CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    CONSTRAINT article_analysis_score CHECK (sentiment_score BETWEEN -1 AND 1),
    CONSTRAINT article_analysis_confidence CHECK (confidence BETWEEN 0 AND 1),
    UNIQUE (article_id, model, prompt_version)
);

-- An observed co-occurrence of an unusual price move and unusual news volume.
-- The metric columns are a snapshot taken at detection time; they describe an
-- association and make no causal claim.
CREATE TABLE news_price_event (
    event_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stock_id           BIGINT       NOT NULL REFERENCES stock (stock_id) ON DELETE CASCADE,
    event_date         DATE         NOT NULL,
    price_change_pct   NUMERIC(8,4) NOT NULL,
    return_zscore      NUMERIC(8,3),
    news_count         INTEGER      NOT NULL,
    baseline_news_avg  NUMERIC(8,3) NOT NULL,
    avg_sentiment      NUMERIC(4,3),
    direction          TEXT         NOT NULL,
    severity           TEXT         NOT NULL,
    detected_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT news_price_event_news_count CHECK (news_count > 0),
    CONSTRAINT news_price_event_direction CHECK (direction IN ('up', 'down')),
    CONSTRAINT news_price_event_severity CHECK (severity IN ('low', 'medium', 'high')),
    UNIQUE (stock_id, event_date)
);

CREATE TABLE event_article (
    event_id    BIGINT NOT NULL REFERENCES news_price_event (event_id) ON DELETE CASCADE,
    article_id  BIGINT NOT NULL REFERENCES news_article (article_id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, article_id)
);
