-- Run this in: https://supabase.com/dashboard/project/srlejludttajosnrfkca/sql/new
-- This migration drops and recreates tables with SERIAL (integer) IDs
-- to be compatible with the existing frontend that uses integer IDs.

-- ========== DROP EXISTING TABLES (order matters for FK) ==========
DROP TABLE IF EXISTS order_history CASCADE;
DROP TABLE IF EXISTS product_views CASCADE;
DROP TABLE IF EXISTS trending_searches CASCADE;
DROP TABLE IF EXISTS search_history CASCADE;
DROP TABLE IF EXISTS saved_addresses CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS flash_sale_products CASCADE;
DROP TABLE IF EXISTS flash_sales CASCADE;
DROP TABLE IF EXISTS size_chart CASCADE;
DROP TABLE IF EXISTS site_analytics CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS recently_viewed CASCADE;
DROP TABLE IF EXISTS wishlist CASCADE;
DROP TABLE IF EXISTS subscribers CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS return_requests CASCADE;
DROP TABLE IF EXISTS order_tracking CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS testimonials CASCADE;
DROP TABLE IF EXISTS product_images CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS contact CASCADE;
DROP TABLE IF EXISTS about CASCADE;
DROP TABLE IF EXISTS hero CASCADE;

-- ========== SINGLE-ROW CONFIG TABLES ==========
CREATE TABLE hero (
  id INTEGER PRIMARY KEY DEFAULT 1,
  heading TEXT DEFAULT 'Welcome to Aryal Store',
  subtext TEXT DEFAULT 'Your one-stop destination for quality products.'
);
INSERT INTO hero (id, heading, subtext) VALUES (1, 'Welcome to Aryal Store', 'Your one-stop destination for quality products.')
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE about (
  id INTEGER PRIMARY KEY DEFAULT 1,
  title TEXT DEFAULT 'About Us',
  heading TEXT DEFAULT 'Why Choose Us?',
  desc1 TEXT DEFAULT '',
  desc2 TEXT DEFAULT '',
  features TEXT DEFAULT ''
);
INSERT INTO about (id, title, heading, desc1, desc2, features) VALUES (1, 'About Us', 'Why Choose Us?', '', '', '')
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE contact (
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

CREATE TABLE settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  admin_password TEXT DEFAULT 'admin123',
  store_name TEXT DEFAULT 'My Store',
  store_tagline TEXT DEFAULT '',
  currency TEXT DEFAULT 'Rs. ',
  free_shipping_threshold NUMERIC DEFAULT 2000,
  shipping_fee NUMERIC DEFAULT 100,
  whatsapp_number TEXT DEFAULT '',
  store_email TEXT DEFAULT '',
  smtp_host TEXT DEFAULT '',
  smtp_port INTEGER DEFAULT 587,
  smtp_user TEXT DEFAULT '',
  smtp_pass TEXT DEFAULT '',
  notify_email INTEGER DEFAULT 0,
  notify_whatsapp INTEGER DEFAULT 0,
  whatsapp_api_token TEXT DEFAULT '',
  whatsapp_phone_id TEXT DEFAULT ''
);
INSERT INTO settings (id, admin_password, store_name, store_tagline, currency, free_shipping_threshold, shipping_fee, whatsapp_number)
  VALUES (1, 'admin123', 'My Store', '', 'Rs. ', 2000, 100, '')
  ON CONFLICT (id) DO NOTHING;

-- ========== PRODUCTS ==========
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT DEFAULT '',
  desc TEXT,
  price TEXT,
  compare_price TEXT DEFAULT '',
  icon TEXT DEFAULT 'fas fa-box',
  gradient TEXT DEFAULT 'linear-gradient(135deg, #e94560, #d63851)',
  image TEXT DEFAULT '',
  images TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  sizes TEXT DEFAULT '',
  colors TEXT DEFAULT '',
  material TEXT DEFAULT '',
  care_instructions TEXT DEFAULT '',
  fit_info TEXT DEFAULT '',
  brand TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  stock_count INTEGER DEFAULT 100,
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

CREATE TABLE product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- ========== CATEGORIES ==========
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

-- ========== TESTIMONIALS ==========
CREATE TABLE testimonials (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  label TEXT DEFAULT 'Customer',
  text TEXT,
  stars INTEGER DEFAULT 5
);

-- ========== ORDERS ==========
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
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

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price TEXT DEFAULT '',
  size TEXT DEFAULT '',
  color TEXT DEFAULT ''
);

CREATE TABLE order_tracking (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== REVIEWS ==========
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
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
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT DEFAULT '',
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== SUBSCRIBERS ==========
CREATE TABLE subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== COUPONS ==========
CREATE TABLE coupons (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  discount_type TEXT NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC NOT NULL DEFAULT 0,
  min_order_amount NUMERIC DEFAULT 0,
  max_discount_amount NUMERIC DEFAULT 0,
  max_uses INTEGER DEFAULT 100,
  used_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== CUSTOMERS ==========
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  total_orders INTEGER DEFAULT 0,
  total_spent TEXT DEFAULT '0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== RETURN REQUESTS ==========
CREATE TABLE return_requests (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT DEFAULT '',
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== SIZE CHART ==========
CREATE TABLE size_chart (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  size TEXT NOT NULL,
  measurements TEXT DEFAULT '{}'
);

-- ========== FLASH SALES ==========
CREATE TABLE flash_sales (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE flash_sale_products (
  id SERIAL PRIMARY KEY,
  flash_sale_id INTEGER NOT NULL REFERENCES flash_sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sale_price TEXT,
  max_quantity INTEGER DEFAULT 100,
  sold_count INTEGER DEFAULT 0
);

-- ========== NOTIFICATIONS ==========
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'order',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== SAVED ADDRESSES ==========
CREATE TABLE saved_addresses (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  label TEXT DEFAULT 'Home',
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  zip_code TEXT DEFAULT '',
  country TEXT DEFAULT 'Nepal',
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== SEARCH HISTORY ==========
CREATE TABLE search_history (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  query TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trending_searches (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL UNIQUE,
  count INTEGER DEFAULT 1,
  last_searched TIMESTAMPTZ DEFAULT NOW()
);

-- ========== PRODUCT VIEWS ==========
CREATE TABLE product_views (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== ORDER HISTORY ==========
CREATE TABLE order_history (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL DEFAULT 'viewed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== SITE ANALYTICS ==========
CREATE TABLE site_analytics (
  id SERIAL PRIMARY KEY,
  page_url TEXT DEFAULT '',
  page_title TEXT DEFAULT '',
  session_id TEXT DEFAULT '',
  event_type TEXT DEFAULT 'pageview',
  product_id INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
ALTER TABLE flash_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE flash_sale_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE trending_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_analytics ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['hero','about','contact','settings','products','product_images','categories','testimonials','orders','order_items','order_tracking','reviews','messages','subscribers','coupons','customers','return_requests','size_chart','flash_sales','flash_sale_products','notifications','saved_addresses','search_history','trending_searches','product_views','order_history','site_analytics'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Enable all for all users" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Enable all for all users" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;
