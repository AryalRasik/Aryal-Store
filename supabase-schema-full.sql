-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/srlejludttajosnrfkca/sql/new

-- ========== SINGLE-ROW CONFIG TABLES ==========
CREATE TABLE IF NOT EXISTS hero (
  id INTEGER PRIMARY KEY DEFAULT 1,
  heading TEXT DEFAULT 'Welcome to Aryal Store',
  subtext TEXT DEFAULT 'Your one-stop destination for quality products.'
);
INSERT INTO hero (id, heading, subtext) VALUES (1, 'Welcome to Aryal Store', 'Your one-stop destination for quality products.')
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS about (
  id INTEGER PRIMARY KEY DEFAULT 1,
  title TEXT DEFAULT 'About Us',
  heading TEXT DEFAULT 'Why Choose Us?',
  desc1 TEXT DEFAULT '',
  desc2 TEXT DEFAULT '',
  features TEXT DEFAULT ''
);
INSERT INTO about (id, title, heading, desc1, desc2, features) VALUES (1, 'About Us', 'Why Choose Us?', '', '', '')
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS contact (
  id INTEGER PRIMARY KEY DEFAULT 1,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  hours TEXT DEFAULT '',
  lat TEXT DEFAULT '28.0340872',
  lng TEXT DEFAULT '83.4126681',
  whatsapp TEXT DEFAULT ''
);
INSERT INTO contact (id, address, phone, email, hours, lat, lng, whatsapp)
  VALUES (1, '', '', '', '', '28.0340872', '83.4126681', '')
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  store_name TEXT DEFAULT 'My Store',
  store_tagline TEXT DEFAULT '',
  currency TEXT DEFAULT 'Rs. ',
  free_shipping_threshold NUMERIC DEFAULT 2000,
  shipping_fee NUMERIC DEFAULT 100,
  whatsapp_number TEXT DEFAULT ''
);
INSERT INTO settings (id, store_name, store_tagline, currency, free_shipping_threshold, shipping_fee, whatsapp_number)
  VALUES (1, 'My Store', '', 'Rs. ', 2000, 100, '')
  ON CONFLICT (id) DO NOTHING;

-- ========== PRODUCTS ==========
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC DEFAULT 0,
  compare_price NUMERIC DEFAULT 0,
  image_url TEXT DEFAULT '',
  category TEXT DEFAULT '',
  subcategory TEXT DEFAULT '',
  sizes TEXT DEFAULT '',
  colors TEXT DEFAULT '',
  material TEXT DEFAULT '',
  brand TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  icon TEXT DEFAULT 'fas fa-box',
  gradient TEXT DEFAULT 'linear-gradient(135deg, #e94560, #d63851)',
  video_url TEXT DEFAULT '',
  care_instructions TEXT DEFAULT '',
  fit_info TEXT DEFAULT '',
  stock INTEGER DEFAULT 0,
  sold_count INTEGER DEFAULT 0,
  rating NUMERIC DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  is_new INTEGER DEFAULT 0,
  is_best_seller INTEGER DEFAULT 0,
  is_trending INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- ========== CATEGORIES ==========
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

-- ========== TESTIMONIALS ==========
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  label TEXT DEFAULT 'Customer',
  text TEXT,
  stars INTEGER DEFAULT 5
);

-- ========== ORDERS ==========
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT DEFAULT '',
  customer_email TEXT DEFAULT '',
  customer_address TEXT DEFAULT '',
  payment_method TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  total_amount TEXT DEFAULT '0',
  subtotal TEXT DEFAULT '0',
  discount TEXT DEFAULT '0',
  coupon_code TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price TEXT DEFAULT '',
  size TEXT DEFAULT '',
  color TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS order_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== REVIEWS ==========
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT DEFAULT '',
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  title TEXT DEFAULT '',
  comment TEXT DEFAULT '',
  size TEXT DEFAULT '',
  color TEXT DEFAULT '',
  is_verified INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== MESSAGES ==========
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT DEFAULT '',
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== SUBSCRIBERS ==========
CREATE TABLE IF NOT EXISTS subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== COUPONS ==========
CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  discount_type TEXT NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC NOT NULL DEFAULT 0,
  min_order_amount NUMERIC DEFAULT 0,
  max_discount_amount NUMERIC DEFAULT 0,
  max_uses INTEGER DEFAULT 100,
  used_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== CUSTOMERS ==========
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

-- ========== RETURN REQUESTS ==========
CREATE TABLE IF NOT EXISTS return_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT DEFAULT '',
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== SIZE CHART ==========
CREATE TABLE IF NOT EXISTS size_chart (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  size TEXT NOT NULL,
  measurements TEXT DEFAULT '{}'
);

-- ========== RLS POLICIES (allow all for anon key - dev mode) ==========
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
