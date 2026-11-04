-- Add private product cost price (admin-only) for profit tracking.
-- Safe to run more than once.
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;

COMMENT ON COLUMN products.cost_price IS 'Private cost price in NPR. Admin-only; never expose to customers.';
