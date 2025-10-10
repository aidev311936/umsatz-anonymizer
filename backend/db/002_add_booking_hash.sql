ALTER TABLE masked_transactions
  ADD COLUMN IF NOT EXISTS booking_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_masked_transactions_booking_hash
  ON masked_transactions(booking_hash);
