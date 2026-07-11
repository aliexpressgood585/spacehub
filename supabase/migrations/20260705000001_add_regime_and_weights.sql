-- Market regime columns on bot_state
ALTER TABLE bot_state
  ADD COLUMN IF NOT EXISTS market_regime        TEXT DEFAULT 'RANGING',
  ADD COLUMN IF NOT EXISTS regime_confidence    NUMERIC(4,2) DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS regime_updated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coin_weights         JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rebalanced_at        TIMESTAMPTZ;

-- Market regime history table
CREATE TABLE IF NOT EXISTS market_regime (
  id             BIGSERIAL PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  regime         TEXT        NOT NULL,
  confidence     NUMERIC(4,2),
  btc_adx        NUMERIC(6,2),
  btc_atr_pct    NUMERIC(8,5),
  btc_ema_slope  NUMERIC(10,6),
  bb_width_pct   NUMERIC(8,5),
  notes          TEXT
);

-- Rebalance history table
CREATE TABLE IF NOT EXISTS rebalance_history (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  trade_count  INT,
  weights_after JSONB,
  scores       JSONB
);
