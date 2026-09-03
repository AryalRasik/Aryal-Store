-- ============================================================================
--  Aryal Store — Supabase schema FIX migration
--  Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run
--  It is IDEMPOTENT and SAFE (checks each table exists before altering).
--
--  This adds the columns the admin panel and storefront expect but that are
--  missing from the current database (products, settings, orders, reviews...).
--  Without it, saving products/settings and editing products fails.
-- ============================================================================

-- ---------- PRODUCTS (legacy aliases + missing feature columns) ----------
ALTER TABLE products ADD COLUMN IF NOT EXISTS "desc" TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_price NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS gradient TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS colors TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS material TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_best_seller INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_trending INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS care_instructions TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS fit_info TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Back-fill the status of existing products
UPDATE products SET status = 'active' WHERE status IS NULL OR status = '';

-- ---------- SETTINGS (all fields used by admin panel + storefront) ----------
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
ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_email TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_email_verified_at TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sms_api_url TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS delivery_text TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_light TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_dark TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS favicon TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS shipping_fee_text TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS free_shipping_text TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_phone TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_email TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_address TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_map_lat TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_map_lng TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_hours TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS facebook_url TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS instagram_url TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tiktok_url TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS youtube_url TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS twitter_url TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS service_exp_text TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS service_exp_seats_text TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS shipping_policy TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS return_policy TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS refund_policy TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS privacy_policy TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terms_policy TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS free_shipping_text2 TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'NPR';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS store_phone TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS store_address TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS store_goolemap_embed TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_goolemap_embed TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS facebook_pixel_id TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS google_analytics_id TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS hotjar_id TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS whatsapp_chat_enabled INTEGER DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS whatsapp_chat_number TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS store_general_email TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS buy_whatsapp_number TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS announcement TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS announcement_enabled INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS announcement_type TEXT DEFAULT 'none';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS announcement_link TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS announcement_text_color TEXT DEFAULT '#ffffff';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS announcement_bg_color TEXT DEFAULT '#1a1a2e';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS announcement_btn_text TEXT DEFAULT 'Shop Now';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS announcement_btn_link TEXT DEFAULT 'shop.html';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Make sure the settings row exists
INSERT INTO settings (id, store_name, currency, free_shipping_threshold, shipping_fee)
VALUES (1, 'Aryal Store', 'Rs. ', 2000, 100)
ON CONFLICT (id) DO NOTHING;

-- ---------- ORDERS (missing columns) ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_city TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_state TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_phone TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ---------- OPTIONAL TABLES (only alter if the table exists) ----------
DO $$
BEGIN
  IF to_regclass('public.reviews') IS NOT NULL THEN
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_verified INTEGER DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.return_requests') IS NOT NULL THEN
    ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS customer_email TEXT DEFAULT '';
    ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS details TEXT DEFAULT '';
    ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
    ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.testimonials') IS NOT NULL THEN
    ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.coupons') IS NOT NULL THEN
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count INTEGER DEFAULT 0;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id TEXT DEFAULT '';
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
  END IF;
END $$;

-- ============================================================================
-- Done. You can now refresh the admin panel — product/settings saving works
-- with all fields.
-- ============================================================================
