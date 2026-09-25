-- ============================================================
-- Online payment (QR) support — Aryal Store
-- Run this in the Supabase SQL Editor.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- Payment columns on orders (existing rows stay readable and are treated as
-- legacy/unpaid until a new order is created).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_token TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_note TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT DEFAULT '';

-- Duplicate-submission protection for "Place Order".
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key) WHERE idempotency_key <> '';

-- Mark pre-existing non-online orders so admin views are explicit.
UPDATE orders SET payment_status = 'pending' WHERE payment_status IS NULL OR payment_status = '';
