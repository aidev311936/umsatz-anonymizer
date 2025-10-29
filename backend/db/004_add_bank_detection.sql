ALTER TABLE bank_mapping
  ADD COLUMN IF NOT EXISTS detection_hints JSONB NOT NULL DEFAULT '{}'::jsonb;
