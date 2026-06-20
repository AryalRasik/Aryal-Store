-- Migration: Add missing columns to existing Supabase tables
-- Run this in: https://supabase.com/dashboard/project/srlejludttajosnrfkca/sql/new

-- ========== PRODUCTS: Add missing columns ==========
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_price NUMERIC DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS colors TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS material TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_best_seller INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_trending INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- ========== ORDERS: Add missing columns ==========
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';

-- Change total_amount to TEXT (frontend sends "Rs. 1500" format)
ALTER TABLE orders ALTER COLUMN total_amount TYPE TEXT USING total_amount::TEXT;

-- ========== ORDER_ITEMS: Add missing columns ==========
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT DEFAULT '';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price TEXT DEFAULT '';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size TEXT DEFAULT '';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '';

-- ========== TESTIMONIALS: Already exists, just ensure ==========

-- ========== REVIEWS: Already has correct columns ==========
-- Add is_verified if missing
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- ========== CUSTOMERS: Create if not exists ==========
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  total_orders INTEGER DEFAULT 0,
  total_spent TEXT DEFAULT '0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== ENABLE RLS & CREATE POLICIES ==========
ALTER TABLE hero ENABLE ROW LEVEL SECURITY;
ALTER TABLE about ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE size_chart ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['hero','about','contact','settings','products','product_images','categories','testimonials','orders','order_items','order_tracking','reviews','messages','subscribers','coupons','customers','return_requests','size_chart'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Enable all for all users" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Enable all for all users" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;
