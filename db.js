const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Render persistent disks attach folders at the root level (e.g., /data)
// If running on Render, use '/data/aryal_store.db', otherwise use the local folder
const DB_PATH = process.env.RENDER
  ? '/data/aryal_store.db'
  : path.join(__dirname, 'aryal_store.db');

// Ensure the /data directory exists if we are running live on Render
if (process.env.RENDER && !fs.existsSync('/data')) {
  fs.mkdirSync('/data', { recursive: true });
}
let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

async function initDb() {
  const d = await getDb();

  d.run(`CREATE TABLE IF NOT EXISTS hero (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    heading TEXT DEFAULT 'Welcome to Aryal Store',
    subtext TEXT DEFAULT 'Your one-stop destination for clothes, stationery, cosmetics, and cylinder refills at unbeatable prices. Discover the best shopping experience today.'
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS about (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT DEFAULT 'About Us',
    heading TEXT DEFAULT 'Why Choose Aryal Store?',
    desc1 TEXT DEFAULT 'At Aryal Store, we are committed to providing our customers with top-quality products and exceptional service. Founded with a passion for excellence, we have grown to become a trusted name in the community.',
    desc2 TEXT DEFAULT 'We specialize in clothes, stationery, cosmetics, and LPG cylinder refills. We carefully curate every product in our collection to ensure you get nothing but the best. Your satisfaction is our top priority.',
    features TEXT DEFAULT 'Quality Products, Fast Delivery, 24/7 Support, Secure Payment'
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    rating REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    is_new INTEGER DEFAULT 0,
    is_best_seller INTEGER DEFAULT 0,
    is_trending INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    is_primary INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    parent_id INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    image TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    label TEXT DEFAULT 'Customer',
    text TEXT,
    stars INTEGER DEFAULT 5
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS contact (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    address TEXT DEFAULT 'Satyawati 06, Ullikhola Bazar, Gulmi',
    phone TEXT DEFAULT '+977 9867135403 / +977 9844758909',
    email TEXT DEFAULT 'info@aryalstore.com',
    hours TEXT DEFAULT 'Sun-Sat: 6:00 AM - 7:00 PM',
    lat TEXT DEFAULT '28.0340872',
    lng TEXT DEFAULT '83.4126681',
    whatsapp TEXT DEFAULT '+9779867135403'
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT DEFAULT '',
    customer_address TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    notes TEXT,
    total_amount TEXT NOT NULL,
    subtotal TEXT DEFAULT '0',
    discount TEXT DEFAULT '0',
    coupon_code TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price TEXT NOT NULL,
    size TEXT DEFAULT '',
    color TEXT DEFAULT '',
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS order_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS return_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT DEFAULT '',
    reason TEXT NOT NULL,
    details TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    admin_password TEXT DEFAULT 'admin123',
    store_name TEXT DEFAULT 'Aryal Store',
    store_tagline TEXT DEFAULT 'Your Trusted Shopping Destination',
    currency TEXT DEFAULT 'Rs. ',
    free_shipping_threshold REAL DEFAULT 2000,
    shipping_fee REAL DEFAULT 100,
    whatsapp_number TEXT DEFAULT '+9779867135403'
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS recently_viewed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT DEFAULT '',
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    title TEXT DEFAULT '',
    comment TEXT DEFAULT '',
    size TEXT DEFAULT '',
    color TEXT DEFAULT '',
    is_verified INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK(discount_type IN ('percentage','fixed')),
    discount_value REAL NOT NULL DEFAULT 0,
    min_order_amount REAL DEFAULT 0,
    max_discount_amount REAL DEFAULT 0,
    max_uses INTEGER DEFAULT 100,
    used_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    starts_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    total_orders INTEGER DEFAULT 0,
    total_spent TEXT DEFAULT '0',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS site_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_url TEXT DEFAULT '',
    page_title TEXT DEFAULT '',
    session_id TEXT DEFAULT '',
    event_type TEXT DEFAULT 'pageview',
    product_id INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS size_chart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    size TEXT NOT NULL,
    measurements TEXT DEFAULT '{}'
  )`);

  // Ensure hero row
  const heroRow = d.exec('SELECT COUNT(*) as cnt FROM hero');
  if (!heroRow.length || !heroRow[0].values.length || heroRow[0].values[0][0] === 0) {
    d.run('INSERT INTO hero (id, heading, subtext) VALUES (1, \'Welcome to Aryal Store\', \'Your one-stop destination for clothes, stationery, cosmetics, and cylinder refills at unbeatable prices. Discover the best shopping experience today.\')');
  }

  // Ensure about row
  const aboutRow = d.exec('SELECT COUNT(*) as cnt FROM about');
  if (!aboutRow.length || !aboutRow[0].values.length || aboutRow[0].values[0][0] === 0) {
    d.run("INSERT INTO about (id, title, heading, desc1, desc2, features) VALUES (1, 'About Us', 'Why Choose Aryal Store?', 'At Aryal Store, we are committed to providing our customers with top-quality products and exceptional service. Founded with a passion for excellence, we have grown to become a trusted name in the community.', 'We specialize in clothes, stationery, cosmetics, and LPG cylinder refills. We carefully curate every product in our collection to ensure you get nothing but the best. Your satisfaction is our top priority.', 'Quality Products, Fast Delivery, 24/7 Support, Secure Payment')");
  }

  // Ensure contact row
  const contactRow = d.exec('SELECT COUNT(*) as cnt FROM contact');
  if (!contactRow.length || !contactRow[0].values.length || contactRow[0].values[0][0] === 0) {
    d.run("INSERT INTO contact (id, address, phone, email, hours, lat, lng, whatsapp) VALUES (1, 'Satyawati 06, Ullikhola Bazar, Gulmi', '+977 9867135403 / +977 9844758909', 'info@aryalstore.com', 'Sun-Sat: 6:00 AM - 7:00 PM', '28.0340872', '83.4126681', '+9779867135403')");
  }

  // Ensure settings row
  const settingsRow = d.exec('SELECT COUNT(*) as cnt FROM settings');
  if (!settingsRow.length || !settingsRow[0].values.length || settingsRow[0].values[0][0] === 0) {
    d.run("INSERT INTO settings (id, admin_password, store_name, store_tagline, currency, free_shipping_threshold, shipping_fee, whatsapp_number) VALUES (1, 'admin123', 'Aryal Store', 'Your Trusted Shopping Destination', 'Rs. ', 2000, 100, '+9779867135403')");
  }

  saveDb();
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

module.exports = { initDb, getDb, queryAll, queryOne, run };
