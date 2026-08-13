-- =============================================================================
-- Neon SQL Editor — run if Query Raise / RFI / Executive / Issues show
-- "Failed to fetch" (usually missing tables/columns → HTTP 500).
-- Safe to re-run: IF NOT EXISTS / ALTER TYPE.
-- =============================================================================

-- 018: issue location / field-ops columns
ALTER TABLE issues ADD COLUMN IF NOT EXISTS lane VARCHAR(32);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS side VARCHAR(32);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS carriageway VARCHAR(64);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS start_chainage VARCHAR(64);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS end_chainage VARCHAR(64);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS voice_note TEXT;

-- Query Raise tables (012 + 014)
CREATE TABLE IF NOT EXISTS portal_query_tickets (
  id SERIAL PRIMARY KEY,
  ticket_no VARCHAR(64) NOT NULL UNIQUE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  module_area VARCHAR(64) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(32) NOT NULL DEFAULT 'medium',
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  raised_by_id INTEGER NOT NULL REFERENCES users(id),
  assigned_to_id INTEGER REFERENCES users(id),
  resolution_note TEXT,
  resolved_by_id INTEGER REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  attachment_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_portal_query_status ON portal_query_tickets (status);
CREATE INDEX IF NOT EXISTS ix_portal_query_raised_by ON portal_query_tickets (raised_by_id);

CREATE TABLE IF NOT EXISTS portal_query_comments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES portal_query_tickets(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  note TEXT NOT NULL,
  action VARCHAR(32) NOT NULL DEFAULT 'comment',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_portal_query_comments_ticket ON portal_query_comments (ticket_id);

ALTER TABLE portal_query_tickets ADD COLUMN IF NOT EXISTS attachment_path TEXT;
ALTER TABLE portal_query_tickets ALTER COLUMN attachment_path TYPE TEXT;

-- RFI table (013) + view fields (015)
CREATE TABLE IF NOT EXISTS site_rfis (
  id SERIAL PRIMARY KEY,
  rfi_no VARCHAR(64) NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  related_issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  chainage VARCHAR(64),
  priority VARCHAR(32) NOT NULL DEFAULT 'medium',
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  raised_by_id INTEGER NOT NULL REFERENCES users(id),
  answer_text TEXT,
  answered_by_id INTEGER REFERENCES users(id),
  answered_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_site_rfis_status ON site_rfis (status);
CREATE INDEX IF NOT EXISTS ix_site_rfis_project ON site_rfis (project_id);
CREATE INDEX IF NOT EXISTS ix_site_rfis_raised_by ON site_rfis (raised_by_id);

ALTER TABLE site_rfis ADD COLUMN IF NOT EXISTS ae_name VARCHAR(255);
ALTER TABLE site_rfis ADD COLUMN IF NOT EXISTS contractor_name VARCHAR(255);
ALTER TABLE site_rfis ADD COLUMN IF NOT EXISTS category VARCHAR(128);
ALTER TABLE site_rfis ADD COLUMN IF NOT EXISTS inspection_date DATE;
ALTER TABLE site_rfis ADD COLUMN IF NOT EXISTS photo_path VARCHAR(512);

-- Executive drawings (016)
CREATE TABLE IF NOT EXISTS executive_drawings (
  id SERIAL PRIMARY KEY,
  project_code VARCHAR(64) NOT NULL,
  project_name VARCHAR(255) NOT NULL,
  region VARCHAR(128),
  ae_name VARCHAR(255),
  counts_json TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 018 field-ops tables
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

UPDATE alembic_version SET version_num = '019_query_multi_attachments'
WHERE EXISTS (SELECT 1 FROM alembic_version);
INSERT INTO alembic_version (version_num)
SELECT '019_query_multi_attachments'
WHERE NOT EXISTS (SELECT 1 FROM alembic_version);

-- Billing invoice claim / diary columns (017)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS this_bill_amount NUMERIC(18, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cumulative_amount NUMERIC(18, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_amount_cr NUMERIC(18, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_pdf_path VARCHAR(512);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS final_bill_pdf_path VARCHAR(512);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS diary_note TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS diary_signature VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS correspondence_path VARCHAR(512);

-- MPR table (010)
CREATE TABLE IF NOT EXISTS monthly_progress_reports (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  folder_id INTEGER REFERENCES document_folders(id) ON DELETE SET NULL,
  package_name VARCHAR(255) NOT NULL,
  report_month DATE NOT NULL,
  physical_progress TEXT,
  financial_progress TEXT,
  rating_performance TEXT,
  timely_execution TEXT,
  pending_activity TEXT,
  critical_observation TEXT,
  last_remarks TEXT,
  pdf_path VARCHAR(512),
  submitted_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_mpr_project_id ON monthly_progress_reports (project_id);
