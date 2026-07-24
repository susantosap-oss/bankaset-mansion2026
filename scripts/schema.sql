-- ============================================================
-- Mansion Asset Bank Intelligence — PostgreSQL Schema
-- Migration prep dari Google Sheets → PostgreSQL
-- ============================================================
-- Jalankan: psql $DATABASE_URL -f scripts/schema.sql
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUM types ──────────────────────────────────────────────
CREATE TYPE asset_type AS ENUM (
  'RUMAH', 'APARTEMEN', 'RUKO', 'GUDANG', 'PABRIK', 'LAHAN', 'KANTOR', 'OTHER'
);

CREATE TYPE asset_status AS ENUM (
  'ACTIVE', 'IN_PROCESS', 'SOLD', 'NPL'
);

CREATE TYPE user_role AS ENUM (
  'SUPERUSER', 'PRINCIPAL', 'ADMIN', 'AGENT'
);

CREATE TYPE data_source AS ENUM (
  'EXTERNAL', 'COMPUTED', 'MIXED'
);

-- ── assets (dari sheet: Asset Engine) ───────────────────────
CREATE TABLE assets (
  asset_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_name            TEXT NOT NULL,
  asset_type           asset_type NOT NULL DEFAULT 'OTHER',
  city                 TEXT NOT NULL DEFAULT '',
  district             TEXT NOT NULL DEFAULT '',
  area                 TEXT NOT NULL DEFAULT '',
  address              TEXT NOT NULL DEFAULT '',
  market_value         BIGINT NOT NULL DEFAULT 0,
  outstanding          BIGINT NOT NULL DEFAULT 0,
  land_area            NUMERIC(10, 2) NOT NULL DEFAULT 0,
  building_area        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status               asset_status NOT NULL DEFAULT 'ACTIVE',
  raw_row_ref          TEXT,
  -- Extended fields (kolom P-S di GSheets)
  debtor_name          TEXT,
  principal_outstanding BIGINT,
  liquidation_ratio    NUMERIC(6, 4),
  liquidation_value    BIGINT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_city       ON assets (city);
CREATE INDEX idx_assets_bank       ON assets (bank_name);
CREATE INDEX idx_assets_type       ON assets (asset_type);
CREATE INDEX idx_assets_status     ON assets (status);
CREATE INDEX idx_assets_created_at ON assets (created_at DESC);
CREATE INDEX idx_assets_search     ON assets USING gin(
  to_tsvector('indonesian', coalesce(address,'') || ' ' || coalesce(city,'') || ' ' || coalesce(area,'') || ' ' || coalesce(district,'') || ' ' || coalesce(debtor_name,''))
);

-- ── bank_mappings (dari sheet: Bank Mapping) ─────────────────
CREATE TABLE bank_mappings (
  mapping_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_name    TEXT NOT NULL UNIQUE,
  fields       JSONB NOT NULL DEFAULT '{}',  -- { canonical_field: "source_column" }
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by   TEXT NOT NULL DEFAULT 'system',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_mappings_name   ON bank_mappings (bank_name);
CREATE INDEX idx_bank_mappings_active ON bank_mappings (active);

-- ── field_aliases (dari sheet: Field Alias) ──────────────────
CREATE TABLE field_aliases (
  alias_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical     TEXT NOT NULL,  -- e.g. 'city', 'asset_type'
  alias         TEXT NOT NULL,  -- e.g. 'kota', 'tipe jaminan'
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_field_aliases_unique ON field_aliases (canonical, lower(alias));
CREATE INDEX idx_field_aliases_canonical ON field_aliases (canonical);

-- ── area_intelligence (dari sheet: Area Intelligence) ────────
CREATE TABLE area_intelligence (
  area_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  area             TEXT NOT NULL,
  city             TEXT NOT NULL,
  -- External/manual scores
  demand_score     SMALLINT NOT NULL DEFAULT 50 CHECK (demand_score BETWEEN 0 AND 100),
  liquidity_score  SMALLINT NOT NULL DEFAULT 50 CHECK (liquidity_score BETWEEN 0 AND 100),
  median_price     BIGINT NOT NULL DEFAULT 0,
  price_trend      NUMERIC(6, 2),  -- % change, e.g. +5.5 or -2.3
  source_note      TEXT,
  -- Computed from asset data (updated via batch job)
  computed_listing_count  INTEGER,
  computed_margin_avg     NUMERIC(6, 4),
  computed_at      TIMESTAMPTZ,
  -- Resolved final values
  final_source     data_source NOT NULL DEFAULT 'EXTERNAL',
  updated_by       TEXT NOT NULL DEFAULT 'system',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (city, area)
);

CREATE INDEX idx_area_intelligence_city ON area_intelligence (city);

-- ── ai_analyses (dari sheet: AI Analysis) ───────────────────
CREATE TABLE ai_analyses (
  analysis_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id             UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  summary              TEXT NOT NULL DEFAULT '',
  investment_potential TEXT NOT NULL DEFAULT '',
  sell_potential       TEXT NOT NULL DEFAULT '',
  risks                TEXT NOT NULL DEFAULT '',
  recommendation       TEXT NOT NULL DEFAULT '',
  marketing_strategy   TEXT NOT NULL DEFAULT '',
  model_used           TEXT NOT NULL DEFAULT '',
  generated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_analyses_asset_id    ON ai_analyses (asset_id);
CREATE INDEX idx_ai_analyses_generated_at ON ai_analyses (generated_at DESC);

-- ── import_jobs (dari sheet: Import Jobs) ───────────────────
CREATE TABLE import_jobs (
  job_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_name     TEXT NOT NULL,
  file_name     TEXT,
  file_type     TEXT,   -- 'EXCEL', 'CSV', 'PDF'
  total_rows    INTEGER NOT NULL DEFAULT 0,
  accepted      INTEGER NOT NULL DEFAULT 0,
  rejected      INTEGER NOT NULL DEFAULT 0,
  saved_count   INTEGER NOT NULL DEFAULT 0,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'COMPLETED',  -- 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
  error_detail  TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_jobs_bank      ON import_jobs (bank_name);
CREATE INDEX idx_import_jobs_created   ON import_jobs (created_at DESC);

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bank_mappings_updated_at
  BEFORE UPDATE ON bank_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_area_intelligence_updated_at
  BEFORE UPDATE ON area_intelligence
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Migration dari Google Sheets:
-- 1. Tambahkan DATABASE_URL ke .env.local
-- 2. Jalankan schema ini: psql $DATABASE_URL -f scripts/schema.sql
-- 3. Jalankan scripts/migrate-from-sheets.mjs untuk copy data
-- 4. Di container.ts, ganti Google Sheet repo → PG repo
--    (implementasi PG repo di src/repositories/implementations/pg/)
-- ============================================================
