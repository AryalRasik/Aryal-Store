const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eomsbcjoxebmoxchilrx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_service_role_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvbXNiY2pveGVibW94Y2hpbHJ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkzMzQ5NCwiZXhwIjoyMDk3NTA5NDk0fQ.R_M3B-HJ_wAkJbZe1aVGoQ9Ic2IHoHDFYleCfKT24vA';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runMigration(sql) {
  try {
    await supabase.rpc('exec_sql', { query_text: sql });
    return true;
  } catch {
    try {
      await supabase.rpc('exec_sql', { query: sql });
      return true;
    } catch {
      return false;
    }
  }
}

async function migrateDb() {
  const sql = `
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
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE TABLE IF NOT EXISTS wishlist (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      session_id TEXT NOT NULL DEFAULT '',
      product_id BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS recently_viewed (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      session_id TEXT NOT NULL DEFAULT '',
      product_id BIGINT NOT NULL DEFAULT 0,
      viewed_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_recently_viewed_session ON recently_viewed(session_id);
    CREATE INDEX IF NOT EXISTS idx_wishlist_session ON wishlist(session_id);
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
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method TEXT DEFAULT '';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT DEFAULT '';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT DEFAULT '';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
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
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count INTEGER DEFAULT 0;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent NUMERIC DEFAULT 0;
    ALTER TABLE product_views ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE flash_sale_products ADD COLUMN IF NOT EXISTS max_quantity INTEGER DEFAULT 0;
    ALTER TABLE flash_sale_products ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0;
  `;
  const ok = await runMigration(sql);
  if (ok) console.log('Database schema migrated successfully.');
  else console.warn('Auto-migration not available (exec_sql RPC not found). Run supabase-complete-schema.sql in Supabase SQL editor if you see column errors.');
}

async function initDb() {
  const { count, error } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  if (error) {
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      console.error('Supabase tables not found. Please run the migration SQL in supabase-schema-full.sql first.');
      throw error;
    }
    throw error;
  }

  await migrateDb();

  if (count === 0) {
    console.log('Database empty — seeding with default data...');
    await seedData();
  }
}

async function seedData() {
  await supabase.from('hero').upsert({ id: 1, heading: 'Welcome to Aryal Store', subtext: 'Your one-stop destination for clothes, stationery, cosmetics, and cylinder refills at unbeatable prices. Discover the best shopping experience today.' }, { onConflict: 'id' });
  await supabase.from('about').upsert({ id: 1, title: 'About Us', heading: 'Why Choose Aryal Store?', desc1: 'At Aryal Store, we are committed to providing our customers with top-quality products and exceptional service.', desc2: 'We specialize in clothes, stationery, cosmetics, and LPG cylinder refills.', features: 'Quality Products, Fast Delivery, 24/7 Support, Secure Payment' }, { onConflict: 'id' });
  await supabase.from('contact').upsert({ id: 1, address: 'Satyawati 06, Ullikhola Bazar, Gulmi', phone: '+977 9867135403 / +977 9844758909', email: 'info@aryalstore.com', hours: 'Sun-Sat: 6:00 AM - 7:00 PM', lat: '28.0340872', lng: '83.4126681', whatsapp: '+9779867135403' }, { onConflict: 'id' });
  // Try full settings upsert; fall back to basic columns if extended columns don't exist yet
  const { error: settingsErr } = await supabase.from('settings').upsert({ id: 1, admin_password: 'admin123', store_name: 'Aryal Store', store_tagline: 'Your Trusted Shopping Destination', currency: 'Rs. ', free_shipping_threshold: 2000, shipping_fee: 100, whatsapp_number: '+9779867135403', store_email: '', smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '', notify_email: false, notify_whatsapp: false, whatsapp_api_token: '', whatsapp_phone_id: '' }, { onConflict: 'id' });
  if (settingsErr && settingsErr.message && settingsErr.message.includes('notify_email')) {
    await supabase.from('settings').upsert({ id: 1, store_name: 'Aryal Store', store_tagline: 'Your Trusted Shopping Destination', currency: 'Rs. ', free_shipping_threshold: 2000, shipping_fee: 100, whatsapp_number: '+9779867135403' }, { onConflict: 'id' });
  }

  const defaultProducts = [
    { name: "Men's T-Shirt", category: 'clothes', price: 'Rs. 899', image: '', stock_count: 100, is_featured: true, is_new: true, brand: 'Casual Wear', icon: 'fas fa-tshirt', gradient: 'linear-gradient(135deg, #e94560, #d63851)', sizes: 'S,M,L,XL', colors: 'Black,White,Grey,Navy', material: '100% Cotton', status: 'active' },
    { name: "Women's Kurti", category: 'clothes', price: 'Rs. 1299', image: '', stock_count: 80, is_featured: true, brand: 'Ethnic Wear', icon: 'fas fa-tshirt', gradient: 'linear-gradient(135deg, #d63851, #e94560)', sizes: 'S,M,L,XL', colors: 'Red,Blue,Green,Pink', material: 'Cotton Blend', status: 'active' },
    { name: 'Kids Wear', category: 'clothes', price: 'Rs. 699', image: '', stock_count: 120, brand: 'Kids Fashion', icon: 'fas fa-child', gradient: 'linear-gradient(135deg, #c0392b, #e74c3c)', sizes: '2Y,4Y,6Y,8Y,10Y', colors: 'Multi', material: 'Cotton', status: 'active' },
    { name: 'Gel Pens Set', category: 'stationery', price: 'Rs. 199', image: '', stock_count: 200, icon: 'fas fa-pen', gradient: 'linear-gradient(135deg, #2c3e50, #3498db)', colors: 'Assorted', material: 'Plastic, Ink', status: 'active' },
    { name: 'Spiral Notebooks', category: 'stationery', price: 'Rs. 249', image: '', stock_count: 150, icon: 'fas fa-book', gradient: 'linear-gradient(135deg, #2980b9, #3498db)', colors: 'Red,Blue,Green', material: 'Paper', status: 'active' },
    { name: 'Face Cream', category: 'cosmetics', price: 'Rs. 449', image: '', stock_count: 90, is_new: true, icon: 'fas fa-magic', gradient: 'linear-gradient(135deg, #8e44ad, #c39bd3)', sizes: '50ml,100ml', material: 'Natural ingredients', status: 'active' },
    { name: 'Matte Lipstick', category: 'cosmetics', price: 'Rs. 399', image: '', stock_count: 150, is_trending: true, icon: 'fas fa-lipstick', gradient: 'linear-gradient(135deg, #c0392b, #e74c3c)', colors: 'Red,Pink,Nude,Berry,Coral', material: 'Wax, Oils, Pigments', status: 'active' },
    { name: 'LPG Gas Cylinder (13.2kg)', category: 'cylinder', price: 'Rs. 1850', image: '', stock_count: 30, is_featured: true, icon: 'fas fa-fire', gradient: 'linear-gradient(135deg, #e74c3c, #c0392b)', status: 'active' },
  ];
  for (const p of defaultProducts) {
    await supabase.from('products').insert(p);
  }

  await supabase.from('testimonials').insert([
    { name: 'Ram Kumar', label: 'Regular Customer', text: 'Amazing quality and super fast delivery! Aryal Store never disappoints.', stars: 5 },
    { name: 'Sita Pokharel', label: 'Happy Shopper', text: 'Great prices and excellent customer service.', stars: 5 },
    { name: 'Anil Gurung', label: 'Verified Buyer', text: 'The products are exactly as described. High quality and affordable.', stars: 5 },
  ]);

  await supabase.from('categories').insert([
    { name: 'Clothes', slug: 'clothes', parent_id: 0, description: 'Fashion for men, women, and kids' },
    { name: 'Stationery', slug: 'stationery', parent_id: 0, description: 'Office and school supplies' },
    { name: 'Cosmetics', slug: 'cosmetics', parent_id: 0, description: 'Beauty and personal care' },
    { name: 'Cylinder', slug: 'cylinder', parent_id: 0, description: 'LPG gas cylinders and refills' },
  ]);

  await supabase.from('coupons').insert([
    { code: 'WELCOME10', description: '10% off on your first order', discount_type: 'percentage', discount_value: 10, min_order_amount: 0, max_discount_amount: 500, max_uses: 100, is_active: true },
    { code: 'SAVE20', description: 'Rs. 20 off on orders above Rs. 1000', discount_type: 'fixed', discount_value: 200, min_order_amount: 1000, max_discount_amount: 200, max_uses: 50, is_active: true },
    { code: 'FREESHIP', description: 'Free shipping on your order', discount_type: 'fixed', discount_value: 100, min_order_amount: 500, max_discount_amount: 100, max_uses: 200, is_active: true },
  ]);
}

module.exports = { supabase, initDb };
