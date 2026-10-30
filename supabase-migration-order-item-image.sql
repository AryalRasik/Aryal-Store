-- ==============================================================
-- Aryal Store - store the customer's selected product photo
-- Project: srlejludttajosnrfkca
--
-- Run ONCE in:
--   https://supabase.com/dashboard/project/srlejludttajosnrfkca/sql/new
--
-- Safe to re-run. Adds the selected gallery photo to each order item
-- so the admin order details show the exact photo the customer chose.
-- ==============================================================

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
