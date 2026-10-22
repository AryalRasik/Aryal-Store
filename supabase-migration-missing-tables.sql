-- ==============================================================
-- Aryal Store — additive schema migration for the LIVE project
-- Project: srlejludttajosnrfkca
--
-- SAFE TO RUN: only CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS.
-- No DROP, no DELETE, no data loss. Safe to re-run.
--
-- Run in: https://supabase.com/dashboard/project/srlejludttajosnrfkca/sql/new
--
-- IMPORTANT:
--   Do NOT run supabase-migration-integer-ids.sql against this project.
--   It starts with DROP TABLE on every table and recreates them with
--   SERIAL (integer) ids. The live schema uses UUID primary keys
--   (products.id is uuid), so it would wipe all data AND break every
--   stored product_id.
-- ==============================================================


-- ==============================================================
-- 1. ORDER WORKFLOW COLUMNS
-- The hosted `orders` table predates the manual-confirmation workflow.
-- server.js writes these columns on every order; without them the
-- insert fails, which is why orders were routed to local SQLite.
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

-- Unique order code / tracking token so the lookup used by
-- GET /api/orders/track resolves to exactly one row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_code
  ON orders(order_code) WHERE order_code <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token
  ON orders(tracking_token) WHERE tracking_token <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key) WHERE idempotency_key <> '';


-- ==============================================================
-- 2. ORDER OFFER / REFUND TABLES (used by server.js, missing entirely)
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
-- 3. FEATURE TABLES MISSING FROM THE LIVE PROJECT
-- All of these are queried by server.js and currently return 404.
-- ==============================================================

-- notifications (server.js)
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

-- wishlist (server.js) - product_id stays TEXT: no FK join is performed
CREATE TABLE IF NOT EXISTS wishlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wishlist_session ON wishlist(session_id);

-- recently_viewed (server.js)
CREATE TABLE IF NOT EXISTS recently_viewed (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  viewed_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_session ON recently_viewed(session_id);

-- saved_addresses (server.js)
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

-- search_history (server.js)
CREATE TABLE IF NOT EXISTS search_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL DEFAULT '',
  query      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_history_session ON search_history(session_id);

-- trending_searches (server.js)
CREATE TABLE IF NOT EXISTS trending_searches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query        TEXT NOT NULL DEFAULT '',
  count        INTEGER NOT NULL DEFAULT 0,
  last_searched TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_searches_query ON trending_searches(query);

-- site_analytics (server.js) - product_id is written as product_id || 0, so TEXT
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

-- product_views (server.js)
CREATE TABLE IF NOT EXISTS product_views (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_views_session ON product_views(session_id);

-- flash_sales (server.js)
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

-- flash_sale_products (server.js)
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
-- 4. GRANTS
-- The storefront talks to Supabase straight from the browser with the
-- publishable key, so anon needs the same access it has on the
-- existing tables. RLS is left as-is (not enabled here) to match the
-- current posture of the live project.
-- ==============================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
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
-- DONE. Verify with:
--   SELECT count(*) FROM notifications;
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'orders' ORDER BY ordinal_position;
-- ==============================================================
