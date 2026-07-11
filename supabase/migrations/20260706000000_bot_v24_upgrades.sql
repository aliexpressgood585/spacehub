-- Bot v24 Upgrades: 7.5/10 → 10/10 (Correlation Hedging, Enhanced Entries, Advanced Exits, Dynamic Macros)

-- Extended bot_trade_snapshots with new indicator columns
ALTER TABLE bot_trade_snapshots
  ADD COLUMN IF NOT EXISTS stochastic_k        NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS stochastic_d        NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS macd_histogram       NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS correlation_hedge   NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS divergence_type     TEXT,
  ADD COLUMN IF NOT EXISTS pivot_level         TEXT;

-- Extended bot_trades with entry indicators for advanced exit comparison
ALTER TABLE bot_trades
  ADD COLUMN IF NOT EXISTS entry_macd_hist     NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS entry_stoch_k       NUMERIC(6,2);

-- Bot macro events table (for future dynamic calendar integration)
CREATE TABLE IF NOT EXISTS bot_macro_events (
  id              BIGSERIAL PRIMARY KEY,
  event_date      DATE NOT NULL,
  event_time_utc  TIME,
  event_name      TEXT NOT NULL,
  currency        TEXT DEFAULT 'USD',
  impact_level    INT DEFAULT 2,
  forecast        NUMERIC(15,2),
  actual          NUMERIC(15,2),
  previous        NUMERIC(15,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ,
  UNIQUE(event_date, event_name, currency)
);

CREATE INDEX IF NOT EXISTS idx_macro_events_date ON bot_macro_events(event_date);
CREATE INDEX IF NOT EXISTS idx_macro_events_time ON bot_macro_events(event_date, event_time_utc);

-- Enhanced bot_trade_snapshots to track breakdown scoring components
ALTER TABLE bot_trade_snapshots
  ADD COLUMN IF NOT EXISTS score_breakdown     JSONB COMMENT 'Detailed confluence score breakdown: {vpoc, ema1h, adxTrend, volumeSurge, oiFavor, sentiment, candlePattern, stochastic, divergence, macd, pivotBounce, bbSqueeze}';

-- Position correlation tracking table
CREATE TABLE IF NOT EXISTS bot_position_correlations (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sym1            TEXT NOT NULL,
  sym2            TEXT NOT NULL,
  correlation     NUMERIC(4,3),
  time_window     INT DEFAULT 100 COMMENT 'bars used for calculation',
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_corr_pair ON bot_position_correlations(sym1, sym2);

-- Advanced exit reasons tracking
ALTER TABLE bot_trade_snapshots
  ADD COLUMN IF NOT EXISTS exit_reason_advanced TEXT,
  ADD COLUMN IF NOT EXISTS exit_type          TEXT DEFAULT 'normal' COMMENT 'normal|macd_reversal|rsi_normalization|volume_cliff|pivot_bounce|bb_squeeze';
