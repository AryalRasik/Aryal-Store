-- Add a per-place delivery fee to admin-managed delivery locations.
-- Safe to re-run. Run ONCE in Supabase Dashboard -> SQL Editor.

ALTER TABLE delivery_locations
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC NOT NULL DEFAULT 0;

UPDATE delivery_locations SET delivery_fee = 0 WHERE delivery_fee IS NULL;
