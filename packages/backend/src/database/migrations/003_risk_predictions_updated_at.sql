-- Migration 003: Add updated_at to risk_predictions + misc audit_logs seed helpers

-- Add updated_at column to risk_predictions (nullable, so existing rows unaffected)
ALTER TABLE risk_predictions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Backfill existing rows so updated_at matches created_at
UPDATE risk_predictions SET updated_at = created_at WHERE updated_at IS NULL;
