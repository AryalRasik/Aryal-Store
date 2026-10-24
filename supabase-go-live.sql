-- ==============================================================
-- Aryal Store - GO LIVE migration (safe, additive, idempotent)
-- Project: srlejludttajosnrfkca
--
-- Run ONCE in:
--   https://supabase.com/dashboard/project/srlejludttajosnrfkca/sql/new
--
-- Safe to re-run. Only CREATE ... IF NOT EXISTS / ALTER ... ADD COLUMN
-- IF NOT EXISTS / CREATE INDEX IF NOT EXISTS. No DROP, no DELETE.
--
-- This file is the union of:
--   supabase-migration-add-users-table.sql
--   auth-migration.sql
--   supabase-migration-missing-tables.sql
-- ==============================================================


-- ==============================================================
-- 0. exec_sql helper (lets the server auto-apply future migrations)
-- ==============================================================
CREATE OR REPLACE FUNCTION exec_sql(query_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query_text;
END;
$$;


-- ==============================================================
-- 1. USERS + AUTH (needed by signup/login/OTP/Google/Facebook)
-- ==============================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  facebook_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS remember_token TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider_id TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

CREATE TABLE IF NOT EXISTS user_addresses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT 'Home',
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  zip_code TEXT DEFAULT '',
  country TEXT DEFAULT 'Nepal',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens(email);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL DEFAULT '',
  refresh_token TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  is_valid BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh ON user_sessions(refresh_token);

CREATE TABLE IF NOT EXISTS user_cart (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  session_id TEXT DEFAULT '',
  product_id BIGINT NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  size TEXT DEFAULT '',
  color TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_cart_user ON user_cart(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cart_session ON user_cart(session_id);


-- ==============================================================
-- 2. ORDER WORKFLOW COLUMNS
-- ==============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_code       TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token   TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone   TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_landmark TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal         NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount         NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code      TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_label   TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee     NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_eta     TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method   TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes            TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes      TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_status     TEXT DEFAULT 'none';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_revision   INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS declined_at      TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason    TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by     TEXT DEFAULT '';

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT DEFAULT '';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price  NUMERIC DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size         TEXT DEFAULT '';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color        TEXT DEFAULT '';

ALTER TABLE order_tracking ADD COLUMN IF NOT EXISTS type    TEXT DEFAULT 'status';
ALTER TABLE order_tracking ADD COLUMN IF NOT EXISTS actor   TEXT DEFAULT 'system';
ALTER TABLE order_tracking ADD COLUMN IF NOT EXISTS visible INTEGER DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_code
  ON orders(order_code) WHERE order_code <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token
  ON orders(tracking_token) WHERE tracking_token <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key) WHERE idempotency_key <> '';


-- ==============================================================
-- 3. ORDER OFFERS / REFUNDS
-- ==============================================================
CREATE TABLE IF NOT EXISTS order_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL,
  revision        INTEGER NOT NULL DEFAULT 1,
  subtotal        NUMERIC DEFAULT 0,
  discount        NUMERIC DEFAULT 0,
  delivery_method TEXT DEFAULT '',
  delivery_label  TEXT DEFAULT '',
  delivery_fee    NUMERIC DEFAULT 0,
  delivery_eta    TEXT DEFAULT '',
  total           NUMERIC DEFAULT 0,
  payment_method  TEXT DEFAULT '',
  payment_methods TEXT DEFAULT '',
  message         TEXT DEFAULT '',
  status          TEXT DEFAULT 'sent',
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_offers_order ON order_offers(order_id);

CREATE TABLE IF NOT EXISTS order_refunds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL,
  amount       NUMERIC DEFAULT 0,
  reason       TEXT DEFAULT '',
  method       TEXT DEFAULT '',
  reference    TEXT DEFAULT '',
  status       TEXT DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_order_refunds_order ON order_refunds(order_id);


-- ==============================================================
-- 4. FEATURE TABLES MISSING FROM THE LIVE PROJECT
-- ==============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL DEFAULT '',
  type       TEXT DEFAULT 'order',
  title      TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  link       TEXT DEFAULT '',
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_session ON notifications(session_id);

CREATE TABLE IF NOT EXISTS wishlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wishlist_session ON wishlist(session_id);

CREATE TABLE IF NOT EXISTS recently_viewed (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  viewed_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_session ON recently_viewed(session_id);

CREATE TABLE IF NOT EXISTS saved_addresses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL DEFAULT '',
  label      TEXT DEFAULT 'Home',
  full_name  TEXT DEFAULT '',
  phone      TEXT DEFAULT '',
  address    TEXT DEFAULT '',
  city       TEXT DEFAULT '',
  state      TEXT DEFAULT '',
  zip_code   TEXT DEFAULT '',
  country    TEXT DEFAULT 'Nepal',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_addresses_session ON saved_addresses(session_id);

CREATE TABLE IF NOT EXISTS search_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL DEFAULT '',
  query      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_history_session ON search_history(session_id);

CREATE TABLE IF NOT EXISTS trending_searches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query         TEXT NOT NULL DEFAULT '',
  count         INTEGER NOT NULL DEFAULT 0,
  last_searched TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_searches_query ON trending_searches(query);

CREATE TABLE IF NOT EXISTS site_analytics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url   TEXT DEFAULT '',
  page_title TEXT DEFAULT '',
  session_id TEXT DEFAULT '',
  event_type TEXT DEFAULT 'pageview',
  product_id TEXT DEFAULT '0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_analytics_created ON site_analytics(created_at);

CREATE TABLE IF NOT EXISTS product_views (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_views_session ON product_views(session_id);

CREATE TABLE IF NOT EXISTS flash_sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL DEFAULT '',
  description    TEXT DEFAULT '',
  start_time     TIMESTAMPTZ DEFAULT NOW(),
  end_time       TIMESTAMPTZ,
  discount_type  TEXT DEFAULT 'percentage',
  discount_value NUMERIC DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flash_sale_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flash_sale_id UUID NOT NULL,
  product_id    TEXT NOT NULL DEFAULT '',
  sale_price    TEXT DEFAULT '',
  max_quantity  INTEGER DEFAULT 0,
  sold_count    INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_flash_sale_products_sale ON flash_sale_products(flash_sale_id);


-- ==============================================================
-- 5. GRANTS (the storefront/admin use the publishable key)
-- ==============================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'users','user_addresses','password_reset_tokens',
      'email_verification_tokens','user_sessions','user_cart',
      'order_offers','order_refunds','notifications','wishlist',
      'recently_viewed','saved_addresses','search_history',
      'trending_searches','site_analytics','product_views',
      'flash_sales','flash_sale_products'
    ])
  LOOP
    EXECUTE format('GRANT ALL ON TABLE %I TO anon, authenticated;', tbl);
  END LOOP;
END $$;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ==============================================================
-- DONE. Verify:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- ==============================================================
