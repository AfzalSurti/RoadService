-- =============================================================================
-- Neon SQL Editor — run this ONCE if pages show "Failed to fetch" / CORS on
-- /api/v1/issues (real cause is usually missing DB columns → HTTP 500).
-- Safe to re-run: uses IF NOT EXISTS.
-- =============================================================================

-- 018: issue location / field-ops columns
ALTER TABLE issues ADD COLUMN IF NOT EXISTS lane VARCHAR(32);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS side VARCHAR(32);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS carriageway VARCHAR(64);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS start_chainage VARCHAR(64);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS end_chainage VARCHAR(64);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS voice_note TEXT;

-- 018: mobile field-ops tables
CREATE TABLE IF NOT EXISTS site_ncrs (
  id SERIAL PRIMARY KEY,
  ncr_no VARCHAR(64) NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  related_rfi_id INTEGER REFERENCES site_rfis(id) ON DELETE SET NULL,
  chainage_start VARCHAR(64),
  chainage_end VARCHAR(64),
  category VARCHAR(128),
  sub_category VARCHAR(128),
  item VARCHAR(128),
  layer VARCHAR(128),
  side VARCHAR(32),
  description TEXT NOT NULL,
  rectification_duration VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  stage VARCHAR(64),
  block_succeeding_rfis BOOLEAN NOT NULL DEFAULT FALSE,
  photo_path VARCHAR(512),
  raised_by_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_site_ncrs_project ON site_ncrs (project_id);
CREATE INDEX IF NOT EXISTS ix_site_ncrs_status ON site_ncrs (status);

CREATE TABLE IF NOT EXISTS pmm_surveys (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  survey_date DATE,
  remarks TEXT,
  lane_length_km DOUBLE PRECISION,
  distress_json TEXT,
  raised_by_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS critical_issues (
  id SERIAL PRIMARY KEY,
  issue_no VARCHAR(64) NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  issue_type VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'new',
  expected_resolution DATE,
  concerned_authority VARCHAR(255),
  chainage_from VARCHAR(64),
  chainage_to VARCHAR(64),
  total_length_km DOUBLE PRECISION,
  priority VARCHAR(32),
  remarks TEXT,
  raised_by_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS road_warnings (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  chainage VARCHAR(64),
  note TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  raised_by_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 019: query tickets can store multiple attachment paths as JSON text
ALTER TABLE portal_query_tickets
  ALTER COLUMN attachment_path TYPE TEXT;

-- Keep Alembic in sync (single-row version table)
UPDATE alembic_version SET version_num = '019_query_multi_attachments'
WHERE EXISTS (SELECT 1 FROM alembic_version);
INSERT INTO alembic_version (version_num)
SELECT '019_query_multi_attachments'
WHERE NOT EXISTS (SELECT 1 FROM alembic_version);
