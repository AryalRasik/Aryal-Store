-- ==============================================================
-- COMPLETE Supabase Schema — Aryal Store
-- Run this entire script in your Supabase SQL editor ONCE.
-- Uses CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- so it is safe to run repeatedly.
-- ==============================================================

-- ==================== CREATE MISSING TABLES ====================

-- wishlist (used by server.js but had no CREATE TABLE)
CREATE TABLE IF NOT EXISTS wishlist (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT '',
  product_id BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- recently_viewed (used by server.js but had no CREATE TABLE)
CREATE TABLE IF NOT EXISTS recently_viewed (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT '',
  product_id BIGINT NOT NULL DEFAULT 0,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_session ON recently_viewed(session_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_session ON wishlist(session_id);

-- ==================== ADD MISSING COLUMNS ====================

-- ---------- settings ----------
ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_password TEXT DEFAULT 'admin123';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS store_email TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_host TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_user TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_pass TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_email INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_whatsapp INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS whatsapp_api_token TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS whatsapp_phone_id TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ---------- orders ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';

-- ---------- products ----------
-- The codebase uses BOTH naming conventions. Add the missing ones so both work.
ALTER TABLE products ADD COLUMN IF NOT EXISTS desc TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_price NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS care_instructions TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS fit_info TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ---------- categories ----------
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ---------- coupons ----------
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count INTEGER DEFAULT 0;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ---------- customers ----------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent NUMERIC DEFAULT 0;

-- ---------- product_views ----------
ALTER TABLE product_views ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT NOW();

-- ---------- flash_sale_products ----------
ALTER TABLE flash_sale_products ADD COLUMN IF NOT EXISTS max_quantity INTEGER DEFAULT 0;
ALTER TABLE flash_sale_products ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0;

-- ==================== ENABLE RLS ON ALL TABLES ====================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'hero','about','contact','settings','products','product_images',
      'categories','testimonials','orders','order_items','order_tracking',
      'reviews','messages','subscribers','coupons','customers',
      'return_requests','size_chart','wishlist','recently_viewed',
      'flash_sales','flash_sale_products','notifications','saved_addresses',
      'search_history','trending_searches','product_views','site_analytics'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END $$;

-- ==================== GRANT ANON ACCESS (public read/write for storefront) ====================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'hero','about','contact','settings','products','product_images',
      'categories','testimonials','orders','order_items','order_tracking',
      'reviews','messages','subscribers','coupons','customers',
      'return_requests','size_chart','wishlist','recently_viewed',
      'flash_sales','flash_sale_products','notifications','saved_addresses',
      'search_history','trending_searches','product_views','site_analytics'
    ])
  LOOP
    EXECUTE format('GRANT ALL ON TABLE %I TO anon, authenticated;', tbl);
  END LOOP;
END $$;

-- Grant usage on sequences for identity columns
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
