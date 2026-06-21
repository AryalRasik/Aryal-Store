const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { initDb, queryAll, queryOne, run } = require('./db');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'product_' + Date.now() + '_' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp|mp4|webm|ogg)$/i;
    if (allowed.test(path.extname(file.originalname))) return cb(null, true);
    cb(new Error('Only image/video files (jpg, jpeg, png, gif, webp, bmp, mp4, webm) are allowed'));
  }
});

const app = express();
const PORT = 3000;
const JWT_SECRET = 'aryal-store-jwt-secret-2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(UPLOADS_DIR));

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function getSessionId(req) {
  return req.headers['x-session-id'] || 'anonymous_' + req.ip;
}

// ========== AUTH ==========
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password is required' });
  const setting = queryOne('SELECT admin_password FROM settings WHERE id = 1');
  if (!setting) return res.status(500).json({ error: 'Settings not found' });
  if (password === setting.admin_password) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid password' });
});

// ========== UPLOAD ==========
app.post('/api/upload', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: '/uploads/' + req.file.filename });
  });
});

app.post('/api/upload/multiple', authMiddleware, (req, res) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
    const urls = req.files.map(f => '/uploads/' + f.filename);
    res.json({ urls });
  });
});

// ========== HERO ==========
app.get('/api/hero', (req, res) => {
  const hero = queryOne('SELECT heading, subtext FROM hero WHERE id = 1');
  res.json(hero || { heading: '', subtext: '' });
});

app.put('/api/hero', authMiddleware, (req, res) => {
  const { heading, subtext } = req.body;
  run('UPDATE hero SET heading = ?, subtext = ? WHERE id = 1', [heading || '', subtext || '']);
  res.json({ success: true });
});

// ========== ABOUT ==========
app.get('/api/about', (req, res) => {
  const about = queryOne('SELECT title, heading, desc1, desc2, features FROM about WHERE id = 1');
  res.json(about || { title: '', heading: '', desc1: '', desc2: '', features: '' });
});

app.put('/api/about', authMiddleware, (req, res) => {
  const { title, heading, desc1, desc2, features } = req.body;
  run('UPDATE about SET title = ?, heading = ?, desc1 = ?, desc2 = ?, features = ? WHERE id = 1',
    [title || '', heading || '', desc1 || '', desc2 || '', features || '']);
  res.json({ success: true });
});

// ========== PRODUCTS ==========
app.get('/api/products', (req, res) => {
  const { category, sort, search, min_price, max_price, brand, color, size, material, page, limit } = req.query;
  let sql = 'SELECT * FROM products WHERE status = ?';
  let params = ['active'];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    sql += ' AND (name LIKE ? OR desc LIKE ?)';
    const like = '%' + search + '%';
    params.push(like, like);
  }

  if (min_price) {
    sql += ' AND CAST(REPLACE(REPLACE(price, \'Rs. \', \'\'), \',\', \'\') AS REAL) >= ?';
    params.push(parseFloat(min_price));
  }

  if (max_price) {
    sql += ' AND CAST(REPLACE(REPLACE(price, \'Rs. \', \'\'), \',\', \'\') AS REAL) <= ?';
    params.push(parseFloat(max_price));
  }

  if (brand) {
    sql += ' AND brand = ?';
    params.push(brand);
  }

  if (material) {
    sql += ' AND material LIKE ?';
    params.push('%' + material + '%');
  }

  if (sort === 'price_asc') sql += ' ORDER BY CAST(REPLACE(REPLACE(price, \'Rs. \', \'\'), \',\', \'\') AS REAL) ASC';
  else if (sort === 'price_desc') sql += ' ORDER BY CAST(REPLACE(REPLACE(price, \'Rs. \', \'\'), \',\', \'\') AS REAL) DESC';
  else if (sort === 'newest') sql += ' ORDER BY id DESC';
  else if (sort === 'popular') sql += ' ORDER BY sold_count DESC';
  else if (sort === 'rating') sql += ' ORDER BY rating DESC';
  else sql += ' ORDER BY id';

  const products = queryAll(sql, params);
  res.json(products);
});

app.get('/api/products/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const like = '%' + q + '%';
  const products = queryAll('SELECT id, name, price, image, category FROM products WHERE status = ? AND (name LIKE ? OR desc LIKE ? OR category LIKE ?) ORDER BY sold_count DESC LIMIT 10',
    ['active', like, like, like]);
  res.json(products);
});

app.get('/api/products/featured', (req, res) => {
  const products = queryAll('SELECT * FROM products WHERE status = ? AND is_featured = 1 ORDER BY id', ['active']);
  res.json(products);
});

app.get('/api/products/best-sellers', (req, res) => {
  const products = queryAll('SELECT * FROM products WHERE status = ? ORDER BY sold_count DESC LIMIT 8', ['active']);
  res.json(products);
});

app.get('/api/products/new-arrivals', (req, res) => {
  const products = queryAll('SELECT * FROM products WHERE status = ? ORDER BY id DESC LIMIT 8', ['active']);
  res.json(products);
});

app.get('/api/products/trending', (req, res) => {
  const products = queryAll('SELECT * FROM products WHERE status = ? AND is_trending = 1 ORDER BY sold_count DESC LIMIT 8', ['active']);
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const product = queryOne('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  product.images_list = queryAll('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, is_primary DESC', [product.id]);
  product.reviews = queryAll('SELECT * FROM reviews WHERE product_id = ? AND status = ? ORDER BY created_at DESC LIMIT 10', [product.id, 'approved']);
  res.json(product);
});

app.post('/api/products', authMiddleware, (req, res) => {
  const {
    name, category, subcategory, desc, price, compare_price, icon, gradient,
    image, images, video_url, sizes, colors, material, care_instructions,
    fit_info, brand, sku, stock_count, is_featured, is_new, is_best_seller,
    is_trending
  } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'Name and category are required' });
  run(`INSERT INTO products (name, category, subcategory, desc, price, compare_price, icon, gradient, image, images, video_url, sizes, colors, material, care_instructions, fit_info, brand, sku, stock_count, is_featured, is_new, is_best_seller, is_trending)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, category, subcategory || '', desc || '', price || '', compare_price || '',
     icon || 'fas fa-box', gradient || 'linear-gradient(135deg, #e94560, #d63851)',
     image || '', images || '', video_url || '', sizes || '', colors || '',
     material || '', care_instructions || '', fit_info || '', brand || '', sku || '',
     stock_count || 100, is_featured ? 1 : 0, is_new ? 1 : 0, is_best_seller ? 1 : 0, is_trending ? 1 : 0]);
  const rows = queryAll('SELECT * FROM products ORDER BY id DESC LIMIT 1');
  res.json(rows[0] || { success: true });
});

app.put('/api/products/:id', authMiddleware, (req, res) => {
  const {
    name, category, subcategory, desc, price, compare_price, icon, gradient,
    image, images, video_url, sizes, colors, material, care_instructions,
    fit_info, brand, sku, stock_count, is_featured, is_new, is_best_seller,
    is_trending, status
  } = req.body;
  run(`UPDATE products SET name=?, category=?, subcategory=?, desc=?, price=?, compare_price=?, icon=?, gradient=?, image=?, images=?, video_url=?, sizes=?, colors=?, material=?, care_instructions=?, fit_info=?, brand=?, sku=?, stock_count=?, is_featured=?, is_new=?, is_best_seller=?, is_trending=?, status=? WHERE id=?`,
    [name, category, subcategory, desc, price, compare_price, icon, gradient,
     image, images, video_url, sizes, colors, material, care_instructions,
     fit_info, brand, sku, stock_count, is_featured, is_new, is_best_seller,
     is_trending, status, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/products/:id', authMiddleware, (req, res) => {
  const prod = queryOne('SELECT image FROM products WHERE id = ?', [req.params.id]);
  if (prod && prod.image) {
    const imgPath = path.join(__dirname, prod.image.replace(/^\//, ''));
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }
  run('DELETE FROM product_images WHERE product_id = ?', [req.params.id]);
  run('DELETE FROM wishlist WHERE product_id = ?', [req.params.id]);
  run('DELETE FROM recently_viewed WHERE product_id = ?', [req.params.id]);
  run('DELETE FROM reviews WHERE product_id = ?', [req.params.id]);
  run('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== CATEGORIES ==========
app.get('/api/categories', (req, res) => {
  const cats = queryAll('SELECT * FROM categories ORDER BY sort_order, name');
  res.json(cats);
});

app.post('/api/categories', authMiddleware, (req, res) => {
  const { name, slug, parent_id, description, image } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required' });
  run('INSERT INTO categories (name, slug, parent_id, description, image) VALUES (?, ?, ?, ?, ?)',
    [name, slug, parent_id || 0, description || '', image || '']);
  const rows = queryAll('SELECT * FROM categories ORDER BY id DESC LIMIT 1');
  res.json(rows[0]);
});

app.delete('/api/categories/:id', authMiddleware, (req, res) => {
  run('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== PRODUCT IMAGES ==========
app.post('/api/product-images', authMiddleware, (req, res) => {
  const { product_id, image_url, is_primary } = req.body;
  if (!product_id || !image_url) return res.status(400).json({ error: 'Product ID and image URL required' });
  run('INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)',
    [product_id, image_url, is_primary ? 1 : 0, 0]);
  res.json({ success: true });
});

app.delete('/api/product-images/:id', authMiddleware, (req, res) => {
  run('DELETE FROM product_images WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== TESTIMONIALS ==========
app.get('/api/testimonials', (req, res) => {
  const testimonials = queryAll('SELECT * FROM testimonials ORDER BY id');
  res.json(testimonials);
});

app.post('/api/testimonials', authMiddleware, (req, res) => {
  const { name, label, text, stars } = req.body;
  if (!name || !text) return res.status(400).json({ error: 'Name and text are required' });
  run('INSERT INTO testimonials (name, label, text, stars) VALUES (?, ?, ?, ?)',
    [name, label || 'Customer', text, stars || 5]);
  const rows = queryAll('SELECT * FROM testimonials ORDER BY id DESC LIMIT 1');
  res.json(rows[0] || { success: true });
});

app.delete('/api/testimonials/:id', authMiddleware, (req, res) => {
  run('DELETE FROM testimonials WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== CONTACT ==========
app.get('/api/contact', (req, res) => {
  const contact = queryOne('SELECT address, phone, email, hours, lat, lng, whatsapp FROM contact WHERE id = 1');
  res.json(contact || { address: '', phone: '', email: '', hours: '', lat: '28.0340872', lng: '83.4126681', whatsapp: '' });
});

app.put('/api/contact', authMiddleware, (req, res) => {
  const { address, phone, email, hours, lat, lng, whatsapp } = req.body;
  run('UPDATE contact SET address = ?, phone = ?, email = ?, hours = ?, lat = ?, lng = ?, whatsapp = ? WHERE id = 1',
    [address || '', phone || '', email || '', hours || '', lat || '28.0340872', lng || '83.4126681', whatsapp || '']);
  res.json({ success: true });
});

// ========== MESSAGES ==========
app.post('/api/messages', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }
  run('INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
    [name, email, subject || '', message]);
  res.json({ success: true });
});

app.get('/api/messages', authMiddleware, (req, res) => {
  const { is_read } = req.query;
  let sql = 'SELECT * FROM messages ORDER BY id DESC';
  if (is_read !== undefined) {
    sql = 'SELECT * FROM messages WHERE is_read = ? ORDER BY id DESC';
    return res.json(queryAll(sql, [parseInt(is_read)]));
  }
  const messages = queryAll(sql);
  res.json(messages);
});

app.put('/api/messages/:id/read', authMiddleware, (req, res) => {
  run('UPDATE messages SET is_read = 1 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.delete('/api/messages/:id', authMiddleware, (req, res) => {
  run('DELETE FROM messages WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== ORDERS ==========
app.post('/api/orders', (req, res) => {
  const { customer_name, customer_phone, customer_email, customer_address, payment_method, notes, items, total_amount, subtotal, discount, coupon_code, customer_id } = req.body;
  if (!customer_name || !customer_phone || !customer_address || !payment_method || !items || !items.length) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }
  run('INSERT INTO orders (customer_name, customer_phone, customer_email, customer_address, payment_method, notes, total_amount, subtotal, discount, coupon_code, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [customer_name, customer_phone, customer_email || '', customer_address, payment_method, notes || '', total_amount, subtotal || total_amount, discount || '0', coupon_code || '', 'pending']);
  const order = queryOne('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
  for (const item of items) {
    run('INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, size, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [order.id, item.product_id || null, item.product_name, item.quantity, item.unit_price, item.size || '', item.color || '']);
    run('UPDATE products SET sold_count = sold_count + 1 WHERE id = ?', [item.product_id]);
  }
  run('INSERT INTO order_tracking (order_id, status, note) VALUES (?, ?, ?)', [order.id, 'pending', 'Order placed successfully']);

  if (customer_phone) {
    const existing = queryOne('SELECT id FROM customers WHERE phone = ?', [customer_phone]);
    if (existing) {
      const c = queryOne('SELECT * FROM customers WHERE id = ?', [existing.id]);
      run('UPDATE customers SET total_orders = total_orders + 1, total_spent = ? WHERE id = ?',
        [String(parseFloat(String(c.total_spent || '').replace(/[^0-9]/g, '') || '0') + parseFloat(String(total_amount || '').replace(/[^0-9]/g, ''))), existing.id]);
    } else {
      run('INSERT INTO customers (name, email, phone, address, total_orders, total_spent) VALUES (?, ?, ?, ?, 1, ?)',
        [customer_name, customer_email || '', customer_phone, customer_address, total_amount]);
    }
  }

  res.json({ success: true, order_id: order.id });
});

app.get('/api/orders', authMiddleware, (req, res) => {
  const { status, phone } = req.query;
  let sql = 'SELECT * FROM orders';
  let params = [];
  const conditions = [];

  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (phone) {
    conditions.push('customer_phone = ?');
    params.push(phone);
  }

  if (conditions.length) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY id DESC';

  const orders = queryAll(sql, params);
  for (const order of orders) {
    order.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    order.tracking = queryAll('SELECT * FROM order_tracking WHERE order_id = ? ORDER BY created_at', [order.id]);
  }
  res.json(orders);
});

app.get('/api/orders/:id', (req, res) => {
  const order = queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  order.tracking = queryAll('SELECT * FROM order_tracking WHERE order_id = ? ORDER BY created_at', [order.id]);
  res.json(order);
});

app.put('/api/orders/:id/status', authMiddleware, (req, res) => {
  const { status, note } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });
  const validStatuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
  run('INSERT INTO order_tracking (order_id, status, note) VALUES (?, ?, ?)', [req.params.id, status, note || 'Status updated to ' + status]);
  res.json({ success: true });
});

app.delete('/api/orders/:id', authMiddleware, (req, res) => {
  run('DELETE FROM order_tracking WHERE order_id = ?', [req.params.id]);
  run('DELETE FROM order_items WHERE order_id = ?', [req.params.id]);
  run('DELETE FROM orders WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== ORDER TRACKING ==========
app.get('/api/orders/:id/tracking', (req, res) => {
  const tracking = queryAll('SELECT * FROM order_tracking WHERE order_id = ? ORDER BY created_at', [req.params.id]);
  res.json(tracking);
});

// ========== RETURN REQUESTS ==========
app.post('/api/return-requests', (req, res) => {
  const { order_id, customer_name, customer_phone, customer_email, reason, details } = req.body;
  if (!order_id || !customer_name || !customer_phone || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  run('INSERT INTO return_requests (order_id, customer_name, customer_phone, customer_email, reason, details) VALUES (?, ?, ?, ?, ?, ?)',
    [order_id, customer_name, customer_phone, customer_email || '', reason, details || '']);
  res.json({ success: true });
});

app.get('/api/return-requests', authMiddleware, (req, res) => {
  const requests = queryAll('SELECT * FROM return_requests ORDER BY id DESC');
  res.json(requests);
});

app.put('/api/return-requests/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });
  run('UPDATE return_requests SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/return-requests/:id', authMiddleware, (req, res) => {
  run('DELETE FROM return_requests WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== WISHLIST ==========
app.get('/api/wishlist', (req, res) => {
  const sessionId = getSessionId(req);
  const items = queryAll('SELECT p.* FROM wishlist w JOIN products p ON w.product_id = p.id WHERE w.session_id = ? ORDER BY w.created_at DESC', [sessionId]);
  res.json(items);
});

app.post('/api/wishlist', (req, res) => {
  const sessionId = getSessionId(req);
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ error: 'Product ID required' });
  const existing = queryOne('SELECT id FROM wishlist WHERE session_id = ? AND product_id = ?', [sessionId, product_id]);
  if (!existing) {
    run('INSERT INTO wishlist (session_id, product_id) VALUES (?, ?)', [sessionId, product_id]);
  }
  res.json({ success: true });
});

app.delete('/api/wishlist/:product_id', (req, res) => {
  const sessionId = getSessionId(req);
  run('DELETE FROM wishlist WHERE session_id = ? AND product_id = ?', [sessionId, req.params.product_id]);
  res.json({ success: true });
});

// ========== RECENTLY VIEWED ==========
app.get('/api/recently-viewed', (req, res) => {
  const sessionId = getSessionId(req);
  const items = queryAll('SELECT p.*, rv.viewed_at FROM recently_viewed rv JOIN products p ON rv.product_id = p.id WHERE rv.session_id = ? ORDER BY rv.viewed_at DESC LIMIT 10', [sessionId]);
  res.json(items);
});

app.post('/api/recently-viewed', (req, res) => {
  const sessionId = getSessionId(req);
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ error: 'Product ID required' });
  run('DELETE FROM recently_viewed WHERE session_id = ? AND product_id = ?', [sessionId, product_id]);
  run('INSERT INTO recently_viewed (session_id, product_id) VALUES (?, ?)', [sessionId, product_id]);
  run('DELETE FROM recently_viewed WHERE id NOT IN (SELECT id FROM (SELECT id FROM recently_viewed WHERE session_id = ? ORDER BY viewed_at DESC LIMIT 50))', [sessionId]);
  res.json({ success: true });
});

// ========== REVIEWS ==========
app.get('/api/products/:id/reviews', (req, res) => {
  const reviews = queryAll('SELECT * FROM reviews WHERE product_id = ? AND status = ? ORDER BY created_at DESC', [req.params.id, 'approved']);
  res.json(reviews);
});

app.post('/api/reviews', (req, res) => {
  const { product_id, customer_name, customer_email, rating, title, comment, size, color } = req.body;
  if (!product_id || !customer_name || !rating) {
    return res.status(400).json({ error: 'Product ID, name, and rating are required' });
  }
  run('INSERT INTO reviews (product_id, customer_name, customer_email, rating, title, comment, size, color, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [product_id, customer_name, customer_email || '', rating, title || '', comment || '', size || '', color || '', 'pending']);

  const stats = queryOne('SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ? AND status = ?', [product_id, 'approved']);
  if (stats && stats.cnt > 0) {
    run('UPDATE products SET rating = ?, review_count = ? WHERE id = ?', [Math.round(stats.avg_rating * 10) / 10, stats.cnt, product_id]);
  }
  res.json({ success: true });
});

app.get('/api/reviews/:id', (req, res) => {
  const review = queryOne('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  res.json(review);
});

app.put('/api/reviews/:id/update', (req, res) => {
  const { customer_name, customer_email, rating, title, comment, size, color } = req.body;
  if (!customer_name || !rating) return res.status(400).json({ error: 'Name and rating are required' });
  run("UPDATE reviews SET customer_name=?, customer_email=?, rating=?, title=?, comment=?, size=?, color=?, status='pending' WHERE id=?",
    [customer_name, customer_email || '', rating, title || '', comment || '', size || '', color || '', req.params.id]);
  res.json({ success: true });
});

app.delete('/api/reviews/:id/remove', (req, res) => {
  const review = queryOne('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  run('DELETE FROM reviews WHERE id = ?', [req.params.id]);
  const stats = queryOne('SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ? AND status = ?', [review.product_id, 'approved']);
  if (stats && stats.cnt > 0) {
    run('UPDATE products SET rating = ?, review_count = ? WHERE id = ?', [Math.round(stats.avg_rating * 10) / 10, stats.cnt, review.product_id]);
  } else {
    run('UPDATE products SET rating = 0, review_count = 0 WHERE id = ?', [review.product_id]);
  }
  res.json({ success: true });
});

app.get('/api/reviews', authMiddleware, (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT r.*, p.name as product_name FROM reviews r LEFT JOIN products p ON r.product_id = p.id';
  if (status) {
    sql += ' WHERE r.status = ?';
    return res.json(queryAll(sql + ' ORDER BY r.created_at DESC', [status]));
  }
  res.json(queryAll(sql + ' ORDER BY r.created_at DESC'));
});

app.put('/api/reviews/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });
  run('UPDATE reviews SET status = ? WHERE id = ?', [status, req.params.id]);
  const review = queryOne('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
  if (review) {
    const stats = queryOne('SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ? AND status = ?', [review.product_id, 'approved']);
    if (stats && stats.cnt > 0) {
      run('UPDATE products SET rating = ?, review_count = ? WHERE id = ?', [Math.round(stats.avg_rating * 10) / 10, stats.cnt, review.product_id]);
    }
  }
  res.json({ success: true });
});

app.delete('/api/reviews/:id', authMiddleware, (req, res) => {
  const review = queryOne('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
  run('DELETE FROM reviews WHERE id = ?', [req.params.id]);
  if (review) {
    const stats = queryOne('SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ? AND status = ?', [review.product_id, 'approved']);
    if (stats && stats.cnt > 0) {
      run('UPDATE products SET rating = ?, review_count = ? WHERE id = ?', [Math.round(stats.avg_rating * 10) / 10, stats.cnt, review.product_id]);
    } else {
      run('UPDATE products SET rating = 0, review_count = 0 WHERE id = ?', [review.product_id]);
    }
  }
  res.json({ success: true });
});

// ========== COUPONS ==========
app.get('/api/coupons', authMiddleware, (req, res) => {
  const coupons = queryAll('SELECT * FROM coupons ORDER BY id DESC');
  res.json(coupons);
});

app.post('/api/coupons', authMiddleware, (req, res) => {
  const { code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, expires_at } = req.body;
  if (!code || !discount_value) return res.status(400).json({ error: 'Code and discount value are required' });
  run('INSERT INTO coupons (code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [code.toUpperCase(), description || '', discount_type || 'percentage', discount_value, min_order_amount || 0, max_discount_amount || 0, max_uses || 100, expires_at || null]);
  const rows = queryAll('SELECT * FROM coupons ORDER BY id DESC LIMIT 1');
  res.json(rows[0]);
});

app.put('/api/coupons/:id', authMiddleware, (req, res) => {
  const { code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, is_active, expires_at } = req.body;
  run('UPDATE coupons SET code=?, description=?, discount_type=?, discount_value=?, min_order_amount=?, max_discount_amount=?, max_uses=?, is_active=?, expires_at=? WHERE id=?',
    [code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, is_active ? 1 : 0, expires_at, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/coupons/:id', authMiddleware, (req, res) => {
  run('DELETE FROM coupons WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/coupons/validate', (req, res) => {
  const { code, order_total } = req.body;
  if (!code) return res.status(400).json({ error: 'Coupon code is required' });
  const coupon = queryOne('SELECT * FROM coupons WHERE code = ? AND is_active = 1', [code.toUpperCase()]);
  if (!coupon) return res.status(404).json({ error: 'Invalid coupon code' });
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Coupon has expired' });
  }
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
    return res.status(400).json({ error: 'Coupon usage limit reached' });
  }
  const total = parseFloat((order_total || '0').replace(/[^0-9.]/g, ''));
  if (total < coupon.min_order_amount) {
    return res.status(400).json({ error: 'Minimum order amount is ' + coupon.min_order_amount });
  }
  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = total * (coupon.discount_value / 100);
    if (coupon.max_discount_amount > 0 && discount > coupon.max_discount_amount) {
      discount = coupon.max_discount_amount;
    }
  } else {
    discount = Math.min(coupon.discount_value, total);
  }
  res.json({ valid: true, discount, coupon: coupon.code });
});

// ========== SUBSCRIBERS ==========
app.post('/api/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const existing = queryOne('SELECT id FROM subscribers WHERE email = ?', [email]);
  if (existing) return res.json({ success: true, message: 'Already subscribed' });
  run('INSERT INTO subscribers (email) VALUES (?)', [email]);
  res.json({ success: true });
});

app.get('/api/subscribers', authMiddleware, (req, res) => {
  const subs = queryAll('SELECT * FROM subscribers ORDER BY subscribed_at DESC');
  res.json(subs);
});

app.delete('/api/subscribers/:id', authMiddleware, (req, res) => {
  run('DELETE FROM subscribers WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== CUSTOMERS ==========
app.get('/api/customers', authMiddleware, (req, res) => {
  const customers = queryAll('SELECT * FROM customers ORDER BY total_orders DESC');
  res.json(customers);
});

app.get('/api/customers/:phone/orders', (req, res) => {
  const orders = queryAll('SELECT * FROM orders WHERE customer_phone = ? ORDER BY id DESC', [req.params.phone]);
  for (const order of orders) {
    order.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    order.tracking = queryAll('SELECT * FROM order_tracking WHERE order_id = ? ORDER BY created_at', [order.id]);
  }
  res.json(orders);
});

// ========== SEARCH HISTORY & TRENDING ==========
app.post('/api/search-history', (req, res) => {
  const sessionId = getSessionId(req);
  const { query } = req.body;
  if (!query || !query.trim()) return res.json({ success: true });
  const q = query.trim().toLowerCase();
  run('INSERT INTO search_history (session_id, query) VALUES (?, ?)', [sessionId, q]);
  run('INSERT INTO trending_searches (query, count, last_searched) VALUES (?, 1, CURRENT_TIMESTAMP) ON CONFLICT(query) DO UPDATE SET count = count + 1, last_searched = CURRENT_TIMESTAMP', [q]);
  run('DELETE FROM search_history WHERE id NOT IN (SELECT id FROM (SELECT id FROM search_history WHERE session_id = ? ORDER BY created_at DESC LIMIT 20))', [sessionId]);
  res.json({ success: true });
});

app.get('/api/search-history', (req, res) => {
  const sessionId = getSessionId(req);
  const history = queryAll('SELECT query FROM search_history WHERE session_id = ? ORDER BY created_at DESC LIMIT 10', [sessionId]);
  res.json(history.map(h => h.query));
});

app.delete('/api/search-history', (req, res) => {
  const sessionId = getSessionId(req);
  const { query } = req.body;
  if (query) {
    run('DELETE FROM search_history WHERE session_id = ? AND query = ?', [sessionId, query]);
  } else {
    run('DELETE FROM search_history WHERE session_id = ?', [sessionId]);
  }
  res.json({ success: true });
});

app.get('/api/trending-searches', (req, res) => {
  const trending = queryAll('SELECT query, count FROM trending_searches ORDER BY count DESC LIMIT 10');
  res.json(trending);
});

app.get('/api/products/search/fuzzy', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 2) return res.json([]);
  // Typo-tolerant search using SQLite LIKE with character-level flexibility
  const products = queryAll(
    `SELECT id, name, price, image, category, stock_count FROM products 
     WHERE status = 'active' AND (
       LOWER(name) LIKE ? OR LOWER(name) LIKE ? OR LOWER(name) LIKE ? OR
       LOWER(desc) LIKE ? OR LOWER(category) LIKE ?
     ) ORDER BY sold_count DESC LIMIT 10`,
    [`%${q}%`, `%${q.slice(0,-1)}%`, `%${q}%`, `%${q}%`, `%${q}%`]
  );
  res.json(products);
});

// ========== FLASH SALES ==========
app.get('/api/flash-sales/active', (req, res) => {
  const sales = queryAll(
    `SELECT fs.*, fsp.product_id, fsp.sale_price, fsp.max_quantity, fsp.sold_count,
            p.name as product_name, p.price as original_price, p.image, p.stock_count
     FROM flash_sales fs
     JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
     JOIN products p ON fsp.product_id = p.id
     WHERE fs.is_active = 1 AND datetime('now') BETWEEN fs.start_time AND fs.end_time
     ORDER BY fs.end_time ASC`
  );
  res.json(sales);
});

app.get('/api/flash-sales', authMiddleware, (req, res) => {
  const sales = queryAll('SELECT * FROM flash_sales ORDER BY created_at DESC');
  for (const sale of sales) {
    sale.products = queryAll(
      'SELECT fsp.*, p.name as product_name, p.price as original_price, p.image FROM flash_sale_products fsp JOIN products p ON fsp.product_id = p.id WHERE fsp.flash_sale_id = ?',
      [sale.id]
    );
  }
  res.json(sales);
});

app.post('/api/flash-sales', authMiddleware, (req, res) => {
  const { title, description, start_time, end_time, discount_type, discount_value, product_ids } = req.body;
  if (!title || !start_time || !end_time) return res.status(400).json({ error: 'Title, start and end time required' });
  run('INSERT INTO flash_sales (title, description, start_time, end_time, discount_type, discount_value) VALUES (?, ?, ?, ?, ?, ?)',
    [title, description || '', start_time, end_time, discount_type || 'percentage', discount_value || 0]);
  const sale = queryOne('SELECT * FROM flash_sales ORDER BY id DESC LIMIT 1');
  if (product_ids && product_ids.length) {
    for (const pid of product_ids) {
      const p = queryOne('SELECT price FROM products WHERE id = ?', [pid]);
      if (p) {
        const origPrice = parseFloat(p.price.replace(/[^0-9.]/g, ''));
        let salePrice = origPrice;
        if (discount_type === 'percentage') salePrice = origPrice * (1 - discount_value / 100);
        else salePrice = Math.max(0, origPrice - discount_value);
        run('INSERT INTO flash_sale_products (flash_sale_id, product_id, sale_price) VALUES (?, ?, ?)',
          [sale.id, pid, 'Rs. ' + salePrice.toFixed(0)]);
      }
    }
  }
  res.json(sale);
});

app.put('/api/flash-sales/:id', authMiddleware, (req, res) => {
  const { title, description, start_time, end_time, discount_type, discount_value, is_active } = req.body;
  run('UPDATE flash_sales SET title=?, description=?, start_time=?, end_time=?, discount_type=?, discount_value=?, is_active=? WHERE id=?',
    [title, description, start_time, end_time, discount_type, discount_value, is_active ? 1 : 0, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/flash-sales/:id', authMiddleware, (req, res) => {
  run('DELETE FROM flash_sale_products WHERE flash_sale_id = ?', [req.params.id]);
  run('DELETE FROM flash_sales WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== NOTIFICATIONS ==========
app.get('/api/notifications', (req, res) => {
  const sessionId = getSessionId(req);
  const notifs = queryAll('SELECT * FROM notifications WHERE session_id = ? ORDER BY created_at DESC LIMIT 50', [sessionId]);
  res.json(notifs);
});

app.post('/api/notifications', (req, res) => {
  const sessionId = getSessionId(req);
  const { type, title, message, link } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message required' });
  run('INSERT INTO notifications (session_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)',
    [sessionId, type || 'order', title, message, link || '']);
  res.json({ success: true });
});

app.post('/api/notifications/read-all', (req, res) => {
  const sessionId = getSessionId(req);
  run('UPDATE notifications SET is_read = 1 WHERE session_id = ?', [sessionId]);
  res.json({ success: true });
});

app.put('/api/notifications/:id/read', (req, res) => {
  run('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.delete('/api/notifications/:id', (req, res) => {
  run('DELETE FROM notifications WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== SAVED ADDRESSES ==========
app.get('/api/addresses', (req, res) => {
  const sessionId = getSessionId(req);
  const addresses = queryAll('SELECT * FROM saved_addresses WHERE session_id = ? ORDER BY is_default DESC, created_at DESC', [sessionId]);
  res.json(addresses);
});

app.post('/api/addresses', (req, res) => {
  const sessionId = getSessionId(req);
  const { label, full_name, phone, address, city, state, zip_code, country, is_default } = req.body;
  if (!full_name || !phone || !address) return res.status(400).json({ error: 'Name, phone and address required' });
  if (is_default) {
    run('UPDATE saved_addresses SET is_default = 0 WHERE session_id = ?', [sessionId]);
  }
  run('INSERT INTO saved_addresses (session_id, label, full_name, phone, address, city, state, zip_code, country, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [sessionId, label || 'Home', full_name, phone, address, city || '', state || '', zip_code || '', country || 'Nepal', is_default ? 1 : 0]);
  res.json({ success: true });
});

app.put('/api/addresses/:id', (req, res) => {
  const sessionId = getSessionId(req);
  const { label, full_name, phone, address, city, state, zip_code, country, is_default } = req.body;
  if (is_default) {
    run('UPDATE saved_addresses SET is_default = 0 WHERE session_id = ?', [sessionId]);
  }
  run('UPDATE saved_addresses SET label=?, full_name=?, phone=?, address=?, city=?, state=?, zip_code=?, country=?, is_default=? WHERE id=? AND session_id=?',
    [label, full_name, phone, address, city, state, zip_code, country, is_default ? 1 : 0, req.params.id, sessionId]);
  res.json({ success: true });
});

app.delete('/api/addresses/:id', (req, res) => {
  const sessionId = getSessionId(req);
  run('DELETE FROM saved_addresses WHERE id = ? AND session_id = ?', [req.params.id, sessionId]);
  res.json({ success: true });
});

// ========== ORDER HISTORY & REORDER ==========
app.get('/api/orders/by-phone/:phone', (req, res) => {
  const orders = queryAll('SELECT * FROM orders WHERE customer_phone = ? ORDER BY id DESC', [req.params.phone]);
  for (const order of orders) {
    order.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    order.tracking = queryAll('SELECT * FROM order_tracking WHERE order_id = ? ORDER BY created_at', [order.id]);
  }
  res.json(orders);
});

app.post('/api/orders/reorder/:id', (req, res) => {
  const order = queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
  res.json({ items, order });
});

// ========== PRODUCT VIEWS ==========
app.post('/api/product-views', (req, res) => {
  const sessionId = getSessionId(req);
  const { product_id } = req.body;
  if (!product_id) return res.json({ success: true });
  run('INSERT INTO product_views (session_id, product_id) VALUES (?, ?)', [sessionId, product_id]);
  res.json({ success: true });
});

app.get('/api/products/recommended', (req, res) => {
  const sessionId = getSessionId(req);
  // Get categories from user's viewed products
  const viewed = queryAll(
    `SELECT DISTINCT p.category FROM product_views pv 
     JOIN products p ON pv.product_id = p.id 
     WHERE pv.session_id = ? AND p.status = 'active' 
     ORDER BY pv.viewed_at DESC LIMIT 3`,
    [sessionId]
  );
  if (!viewed.length) {
    // Fallback to trending products
    const trending = queryAll('SELECT * FROM products WHERE status = ? ORDER BY sold_count DESC LIMIT 8', ['active']);
    return res.json(trending);
  }
  const categories = viewed.map(v => v.category).filter(Boolean);
  const placeholders = categories.map(() => '?').join(',');
  const recs = queryAll(
    `SELECT * FROM products WHERE status = 'active' AND category IN (${placeholders}) ORDER BY rating DESC, sold_count DESC LIMIT 8`,
    categories
  );
  if (recs.length < 8) {
    const extra = queryAll(
      `SELECT * FROM products WHERE status = 'active' AND category NOT IN (${placeholders}) ORDER BY sold_count DESC LIMIT ?`,
      [...categories, 8 - recs.length]
    );
    recs.push(...extra);
  }
  res.json(recs.slice(0, 8));
});

app.get('/api/products/also-bought/:id', (req, res) => {
  // Find products that were bought together with this product
  const alsoBought = queryAll(
    `SELECT DISTINCT p.* FROM order_items oi1
     JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi2.product_id != ?
     JOIN products p ON oi2.product_id = p.id
     WHERE oi1.product_id = ? AND p.status = 'active'
     GROUP BY p.id ORDER BY COUNT(*) DESC LIMIT 6`,
    [req.params.id, req.params.id]
  );
  if (!alsoBought.length) {
    // Fallback: same category
    const prod = queryOne('SELECT category FROM products WHERE id = ?', [req.params.id]);
    if (prod) {
      const related = queryAll('SELECT * FROM products WHERE category = ? AND id != ? AND status = ? ORDER BY sold_count DESC LIMIT 6',
        [prod.category, req.params.id, 'active']);
      return res.json(related);
    }
  }
  res.json(alsoBought);
});

// ========== SIZE CHART ==========
app.get('/api/size-chart/:category', (req, res) => {
  const sizes = queryAll('SELECT * FROM size_chart WHERE category = ?', [req.params.category]);
  res.json(sizes);
});

app.post('/api/size-chart', authMiddleware, (req, res) => {
  const { category, size, measurements } = req.body;
  if (!category || !size) return res.status(400).json({ error: 'Category and size required' });
  const existing = queryOne('SELECT id FROM size_chart WHERE category = ? AND size = ?', [category, size]);
  if (existing) {
    run('UPDATE size_chart SET measurements = ? WHERE id = ?', [JSON.stringify(measurements), existing.id]);
  } else {
    run('INSERT INTO size_chart (category, size, measurements) VALUES (?, ?, ?)', [category, size, JSON.stringify(measurements)]);
  }
  res.json({ success: true });
});

app.delete('/api/size-chart/:id', authMiddleware, (req, res) => {
  run('DELETE FROM size_chart WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== SETTINGS ==========
app.get('/api/settings', authMiddleware, (req, res) => {
  const setting = queryOne('SELECT admin_password, store_name, store_tagline, currency, free_shipping_threshold, shipping_fee, whatsapp_number FROM settings WHERE id = 1');
  res.json(setting || { admin_password: 'admin123' });
});

app.put('/api/settings', authMiddleware, (req, res) => {
  const { admin_password, store_name, store_tagline, currency, free_shipping_threshold, shipping_fee, whatsapp_number } = req.body;
  if (admin_password && admin_password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  run('UPDATE settings SET admin_password=?, store_name=?, store_tagline=?, currency=?, free_shipping_threshold=?, shipping_fee=?, whatsapp_number=? WHERE id = 1',
    [admin_password || 'admin123', store_name || 'Aryal Store', store_tagline || '', currency || 'Rs. ',
     parseFloat(free_shipping_threshold) || 2000, parseFloat(shipping_fee) || 100, whatsapp_number || '']);
  res.json({ success: true });
});

// ========== ANALYTICS ==========
app.post('/api/analytics', (req, res) => {
  const { page_url, page_title, session_id, event_type, product_id } = req.body;
  run('INSERT INTO site_analytics (page_url, page_title, session_id, event_type, product_id) VALUES (?, ?, ?, ?, ?)',
    [page_url || '', page_title || '', session_id || '', event_type || 'pageview', product_id || 0]);
  res.json({ success: true });
});

app.get('/api/analytics/summary', authMiddleware, (req, res) => {
  const totalViews = queryOne('SELECT COUNT(*) as count FROM site_analytics') || { count: 0 };
  const todayViews = queryOne("SELECT COUNT(*) as count FROM site_analytics WHERE date(created_at) = date('now')") || { count: 0 };
  const totalOrders = queryOne('SELECT COUNT(*) as count FROM orders') || { count: 0 };
  const todayOrders = queryOne("SELECT COUNT(*) as count FROM orders WHERE date(created_at) = date('now')") || { count: 0 };
  const totalRevenue = queryOne('SELECT SUM(CAST(REPLACE(REPLACE(total_amount, \'Rs. \', \'\'), \',\', \'\') AS REAL)) as total FROM orders WHERE status != \'cancelled\'') || { total: 0 };
  const todayRevenue = queryOne("SELECT SUM(CAST(REPLACE(REPLACE(total_amount, 'Rs. ', ''), ',', '') AS REAL)) as total FROM orders WHERE status != 'cancelled' AND date(created_at) = date('now')") || { total: 0 };
  const totalProducts = queryOne('SELECT COUNT(*) as count FROM products WHERE status = ?', ['active']) || { count: 0 };
  const totalCustomers = queryAll('SELECT COUNT(*) as count FROM customers')[0] || { count: 0 };
  const totalSubscribers = queryAll('SELECT COUNT(*) as count FROM subscribers')[0] || { count: 0 };
  const totalMessages = queryAll('SELECT COUNT(*) as count FROM messages')[0] || { count: 0 };
  const ordersByStatus = queryAll('SELECT status, COUNT(*) as count FROM orders GROUP BY status');
  const topProducts = queryAll('SELECT id, name, sold_count, price, rating FROM products WHERE status = ? ORDER BY sold_count DESC LIMIT 10', ['active']);
  const recentOrders = queryAll('SELECT id, customer_name, total_amount, status, created_at FROM orders ORDER BY id DESC LIMIT 5');
  const lowStock = queryAll('SELECT id, name, stock_count FROM products WHERE status = ? AND stock_count < 10 ORDER BY stock_count LIMIT 10', ['active']);

  // Sales by category
  const salesByCategory = queryAll(
    `SELECT p.category, SUM(oi.quantity) as total_sold, SUM(CAST(REPLACE(REPLACE(oi.unit_price, 'Rs. ', ''), ',', '') AS REAL) * oi.quantity) as revenue
     FROM order_items oi JOIN products p ON oi.product_id = p.id
     GROUP BY p.category ORDER BY revenue DESC`
  );

  // Monthly sales
  const monthlySales = queryAll(
    `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as orders, SUM(CAST(REPLACE(REPLACE(total_amount, 'Rs. ', ''), ',', '') AS REAL)) as revenue
     FROM orders WHERE status != 'cancelled' GROUP BY month ORDER BY month DESC LIMIT 12`
  );

  // Low stock count
  const lowStockCount = queryOne("SELECT COUNT(*) as count FROM products WHERE status = 'active' AND stock_count < 10") || { count: 0 };

  res.json({
    totalViews: totalViews.count,
    todayViews: todayViews.count,
    totalOrders: totalOrders.count,
    todayOrders: todayOrders.count,
    totalRevenue: totalRevenue.total || 0,
    todayRevenue: todayRevenue.total || 0,
    totalProducts: totalProducts.count,
    totalCustomers: totalCustomers.count,
    totalSubscribers: totalSubscribers.count,
    totalMessages: totalMessages.count,
    ordersByStatus,
    topProducts,
    recentOrders,
    lowStock,
    salesByCategory,
    monthlySales,
    lowStockCount: lowStockCount.count
  });
});

// ========== ORDER REORDER ==========
app.post('/api/orders/:id/reorder', (req, res) => {
  const order = queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  run('INSERT INTO orders (customer_name, customer_phone, customer_email, customer_address, payment_method, notes, total_amount, subtotal, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [order.customer_name, order.customer_phone, order.customer_email, order.customer_address, order.payment_method, 'Reorder from #' + order.id, order.total_amount, order.subtotal, 'pending']);
  const newOrder = queryOne('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
  for (const item of items) {
    run('INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, size, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newOrder.id, item.product_id, item.product_name, item.quantity, item.unit_price, item.size, item.color]);
  }
  run('INSERT INTO order_tracking (order_id, status, note) VALUES (?, ?, ?)', [newOrder.id, 'pending', 'Reorder placed']);
  res.json({ success: true, order_id: newOrder.id });
});

// ========== INVENTORY ==========
app.get('/api/inventory/alerts', authMiddleware, (req, res) => {
  const critical = queryAll('SELECT * FROM products WHERE status = ? AND stock_count <= 0 ORDER BY name', ['active']);
  const low = queryAll('SELECT * FROM products WHERE status = ? AND stock_count > 0 AND stock_count < 20 ORDER BY stock_count ASC', ['active']);
  const normal = queryAll('SELECT * FROM products WHERE status = ? AND stock_count >= 20 ORDER BY name', ['active']);
  res.json({ critical, low, normal });
});

app.put('/api/products/:id/stock', authMiddleware, (req, res) => {
  const { stock_count } = req.body;
  if (stock_count === undefined || stock_count < 0) return res.status(400).json({ error: 'Valid stock count required' });
  run('UPDATE products SET stock_count = ? WHERE id = ?', [stock_count, req.params.id]);
  if (stock_count === 0) {
    run('UPDATE products SET status = ? WHERE id = ?', ['out_of_stock', req.params.id]);
  } else if (stock_count > 0) {
    const p = queryOne('SELECT status FROM products WHERE id = ?', [req.params.id]);
    if (p && p.status === 'out_of_stock') {
      run('UPDATE products SET status = ? WHERE id = ?', ['active', req.params.id]);
    }
  }
  res.json({ success: true });
});

app.post('/api/inventory/bulk-update', authMiddleware, (req, res) => {
  const { updates } = req.body;
  if (!updates || !updates.length) return res.status(400).json({ error: 'No updates provided' });
  for (const u of updates) {
    run('UPDATE products SET stock_count = ? WHERE id = ?', [u.stock_count, u.product_id]);
  }
  res.json({ success: true, updated: updates.length });
});

// ========== DATA MANAGEMENT ==========
app.post('/api/data/export', authMiddleware, (req, res) => {
  const data = {
    hero: queryOne('SELECT * FROM hero WHERE id = 1'),
    about: queryOne('SELECT * FROM about WHERE id = 1'),
    products: queryAll('SELECT * FROM products ORDER BY id'),
    categories: queryAll('SELECT * FROM categories ORDER BY id'),
    testimonials: queryAll('SELECT * FROM testimonials ORDER BY id'),
    contact: queryOne('SELECT * FROM contact WHERE id = 1'),
    settings: queryOne('SELECT * FROM settings WHERE id = 1'),
    messages: queryAll('SELECT * FROM messages ORDER BY id DESC'),
    orders: queryAll('SELECT * FROM orders ORDER BY id DESC'),
    coupons: queryAll('SELECT * FROM coupons ORDER BY id DESC'),
    customers: queryAll('SELECT * FROM customers ORDER BY id DESC'),
    subscribers: queryAll('SELECT * FROM subscribers ORDER BY id DESC')
  };
  res.json(data);
});

app.post('/api/data/reset', authMiddleware, (req, res) => {
  const { initDb: reinit } = require('./db');
  run('DELETE FROM order_tracking');
  run('DELETE FROM order_items');
  run('DELETE FROM orders');
  run('DELETE FROM return_requests');
  run('DELETE FROM product_images');
  run('DELETE FROM products');
  run('DELETE FROM categories');
  run('DELETE FROM testimonials');
  run('DELETE FROM messages');
  run('DELETE FROM wishlist');
  run('DELETE FROM recently_viewed');
  run('DELETE FROM reviews');
  run('DELETE FROM coupons');
  run('DELETE FROM customers');
  run('DELETE FROM subscribers');
  run('DELETE FROM site_analytics');
  run('DELETE FROM size_chart');
  run('UPDATE hero SET heading = \'Welcome to Aryal Store\', subtext = \'Your one-stop destination for clothes, stationery, cosmetics, and cylinder refills at unbeatable prices. Discover the best shopping experience today.\' WHERE id = 1');
  run('UPDATE about SET title = \'About Us\', heading = \'Why Choose Aryal Store?\', desc1 = \'At Aryal Store, we are committed to providing our customers with top-quality products and exceptional service. Founded with a passion for excellence, we have grown to become a trusted name in the community.\', desc2 = \'We specialize in clothes, stationery, cosmetics, and LPG cylinder refills. We carefully curate every product in our collection to ensure you get nothing but the best. Your satisfaction is our top priority.\', features = \'Quality Products, Fast Delivery, 24/7 Support, Secure Payment\' WHERE id = 1');
  run('UPDATE contact SET address = \'Satyawati 06, Ullikhola Bazar, Gulmi\', phone = \'+977 9867135403 / +977 9844758909\', email = \'info@aryalstore.com\', hours = \'Sun-Sat: 6:00 AM - 7:00 PM\', lat = \'28.0340872\', lng = \'83.4126681\' WHERE id = 1');

  // Helper: convert JSON product object to array format for INSERT
  function toProductArray(p) {
    return [
      p.name,                           // name
      p.category || 'clothes',          // category
      '',                               // subcategory
      p.description || p.name,          // desc
      p.price ? 'Rs. ' + p.price : '',  // price
      p.compare_price ? 'Rs. ' + p.compare_price : '', // compare_price
      'fas fa-tshirt',                  // icon
      'linear-gradient(135deg, #e94560, #d63851)', // gradient
      p.image_url || '',                // image
      '',                               // images (JSON array)
      '',                               // video_url
      '',                               // sizes
      '',                               // colors
      '',                               // material
      '',                               // care_instructions
      '',                               // fit_info
      'Daraz Fashion',                  // brand
      '',                               // sku
      p.stock || 50,                    // stock_count
      0,                                // sold_count
      0,                                // is_featured
      0,                                // is_new
      0,                                // is_best_seller
      0                                 // is_trending
    ];
  }

  // Load products from all-products.json if it exists
  let jsonProducts = [];
  try {
    jsonProducts = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'all-products.json'), 'utf8'));
    console.log(`Loaded ${jsonProducts.length} products from data/all-products.json for reset`);
  } catch (e) {
    console.log('data/all-products.json not found, using only inline defaults');
  }

  const defaultProducts = [
    ["Men's T-Shirt", 'clothes', '', 'Premium cotton t-shirts in various sizes and colors.', 'Rs. 899', '', 'fas fa-tshirt', 'linear-gradient(135deg, #e94560, #d63851)', '', '', '', 'S,M,L,XL', 'Black,White,Grey,Navy', '100% Cotton', 'Machine wash cold. Tumble dry low.', 'Regular fit. Model wears size M.', 'Casual Wear', 'TSH-001', 100, 0, 1, 1, 0],
    ["Women's Kurti", 'clothes', '', 'Trendy and comfortable kurtis for everyday wear.', 'Rs. 1299', '', 'fas fa-tshirt', 'linear-gradient(135deg, #d63851, #e94560)', '', '', '', 'S,M,L,XL', 'Red,Blue,Green,Pink', 'Cotton Blend', 'Hand wash recommended.', 'Regular fit. Model height 5\'6" wears size M.', 'Ethnic Wear', 'KUR-001', 80, 0, 1, 0, 0],
    ['Kids Wear', 'clothes', '', 'Colorful and durable outfits for children of all ages.', 'Rs. 699', '', 'fas fa-child', 'linear-gradient(135deg, #c0392b, #e74c3c)', '', '', '', '2Y,4Y,6Y,8Y,10Y', 'Multi', 'Cotton', 'Machine wash gentle.', 'Comfortable fit for active kids.', 'Kids Fashion', 'KID-001', 120, 0, 0, 0, 0],
    ['Gel Pens Set', 'stationery', '', 'Pack of 12 smooth writing gel pens in assorted colors.', 'Rs. 199', '', 'fas fa-pen', 'linear-gradient(135deg, #2c3e50, #3498db)', '', '', '', '', 'Assorted', 'Plastic, Ink', 'Store in cool place.', '', 'Stationery Brands', 'PEN-001', 200, 0, 0, 0, 0],
    ['Spiral Notebooks', 'stationery', '', 'High-quality A4 notebooks with 200 pages each.', 'Rs. 249', '', 'fas fa-book', 'linear-gradient(135deg, #2980b9, #3498db)', '', '', '', '', 'Red,Blue,Green', 'Paper', 'Keep dry.', '', 'Office Supplies', 'NBK-001', 150, 0, 0, 0, 0],
    ['Pencil Box Set', 'stationery', '', 'Complete stationery kit with pencils, eraser, sharpener & ruler.', 'Rs. 349', '', 'fas fa-pencil-alt', 'linear-gradient(135deg, #1a5276, #2e86c1)', '', '', '', '', 'Blue,Pink', 'Wood, Plastic, Metal', '', '', 'School Supplies', 'PEN-002', 100, 0, 0, 0, 0],
    ['Face Cream', 'cosmetics', '', 'Moisturizing face cream with vitamin E for glowing skin.', 'Rs. 449', '', 'fas fa-magic', 'linear-gradient(135deg, #8e44ad, #c39bd3)', '', '', '', '', '50ml,100ml', '', 'Natural ingredients', 'Apply twice daily.', 'Suitable for all skin types.', 'Beauty Brands', 'CRM-001', 90, 0, 0, 1, 0],
    ['Matte Lipstick', 'cosmetics', '', 'Long-lasting matte lipstick available in 10 stunning shades.', 'Rs. 399', '', 'fas fa-lipstick', 'linear-gradient(135deg, #c0392b, #e74c3c)', '', '', '', '', 'Red,Pink,Nude,Berry,Coral', 'Wax, Oils, Pigments', 'Store in cool dry place.', '', '', 'Beauty Brands', 'LIP-001', 150, 0, 0, 0, 1],
    ['Perfume Spray', 'cosmetics', '', 'Premium long-lasting fragrance for men and women.', 'Rs. 799', '', 'fas fa-spa', 'linear-gradient(135deg, #e67e22, #f39c12)', '', '', '', '', '30ml,50ml,100ml', '', 'Alcohol-based fragrance', 'Spray on pulse points.', '', 'Luxury Scents', 'PER-001', 60, 0, 0, 0, 0],
    ['LPG Gas Cylinder (13.2kg)', 'cylinder', '', 'Standard household LPG cylinder with safety seal.', 'Rs. 1850', '', 'fas fa-fire', 'linear-gradient(135deg, #e74c3c, #c0392b)', '', '', '', '', '', '', 'Steel with safety valve', 'Keep upright. Store in ventilated area.', '', 'Gas Corp', 'CYL-001', 30, 0, 1, 0, 0],
    ['LPG Gas Cylinder (5kg)', 'cylinder', '', 'Portable LPG cylinder ideal for small households & camping.', 'Rs. 950', '', 'fas fa-burn', 'linear-gradient(135deg, #d35400, #e67e22)', '', '', '', '', '', '', 'Steel', 'Keep upright.', '', 'Gas Corp', 'CYL-002', 25, 0, 0, 0, 0],
    ['Cylinder Refill Service', 'cylinder', '', 'Fast and safe cylinder refill with doorstep delivery.', 'Rs. 1650', '', 'fas fa-exchange-alt', 'linear-gradient(135deg, #a04000, #d35400)', '', '', '', '', '', '', '', 'Schedule delivery.', '', 'Gas Corp', 'REF-001', 50, 0, 0, 0, 0],

    // --- CSV: KIDS (3) ---
    ['Plastic School Shoes', 'kids', '', 'Durable plastic school shoes for kids, black color. Comfortable and easy to clean.', 'Rs. 250', 'Rs. 350', 'fas fa-child', 'linear-gradient(135deg, #e67e22, #f39c12)', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400', '', '', 'Small,Large', 'Black', 'Plastic, Rubber', 'Wipe clean with damp cloth.', 'Standard fit.', 'Kids Footwear', 'KSH-001', 10, 0, 0, 0, 0],
    ['Leather School Shoes', 'kids', '', 'Premium leather school shoes for kids, black. Sturdy build with comfortable sole.', 'Rs. 550', 'Rs. 600', 'fas fa-child', 'linear-gradient(135deg, #e74c3c, #c0392b)', 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400', '', '', 'Small,Large', 'Black', 'Leather', 'Polish regularly. Keep away from water.', 'Standard fit.', 'Kids Footwear', 'KSH-002', 10, 0, 0, 0, 0],
    ['Kids Slipper', 'kids', '', 'Soft and comfortable slippers for kids, small size. Perfect for everyday wear.', 'Rs. 250', 'Rs. 300', 'fas fa-child', 'linear-gradient(135deg, #27ae60, #2ecc71)', 'https://images.unsplash.com/photo-1603487742138-4c4aad71fef0?w=400', '', '', 'Small', '', 'Rubber', 'Wipe clean.', 'Regular fit.', 'Kids Footwear', 'KSL-001', 5, 0, 0, 0, 0],

    // --- CSV: MEN (1) ---
    ["Men's Slipper", 'men', '', "Comfortable slippers for men, large size. Lightweight and durable for daily use.", 'Rs. 350', 'Rs. 370', 'fas fa-male', 'linear-gradient(135deg, #2980b9, #3498db)', 'https://images.unsplash.com/photo-1603487742138-4c4aad71fef0?w=400', '', '', 'Large', '', 'Rubber', 'Wipe clean.', 'Regular fit.', 'Men Footwear', 'MSL-001', 10, 0, 0, 0, 0],

    // --- CSV: STATIONERY (11) ---
    ['Small Copy', 'stationery', '', 'Small sized notebook, perfect for quick notes and school work.', 'Rs. 50', '', 'fas fa-book', 'linear-gradient(135deg, #1a5276, #2e86c1)', 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=400', '', '', '', '', 'Paper', 'Keep dry.', '', 'School Supplies', 'CPY-001', 100, 0, 0, 0, 0],
    ['Copy Notebook (80 Pages)', 'stationery', '', 'Standard 80-page notebook for school and office use. Ruled pages.', 'Rs. 80', '', 'fas fa-book', 'linear-gradient(135deg, #2c3e50, #3498db)', 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=400', '', '', '', '', 'Paper', 'Keep dry.', '', 'School Supplies', 'CPY-002', 20, 0, 0, 0, 0],
    ['Copy Notebook (100 Pages)', 'stationery', '', '100-page ruled notebook, ideal for extensive note-taking.', 'Rs. 100', '', 'fas fa-book', 'linear-gradient(135deg, #2471a3, #5dade2)', 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=400', '', '', '', '', 'Paper', 'Keep dry.', '', 'School Supplies', 'CPY-003', 20, 0, 0, 0, 0],
    ['Small Drawing Copy', 'stationery', '', 'Small drawing book for sketching and art practice. 20 pages.', 'Rs. 20', '', 'fas fa-paint-brush', 'linear-gradient(135deg, #8e44ad, #9b59b6)', 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400', '', '', '', '', 'Paper', 'Keep dry.', '', 'Art Supplies', 'DRW-001', 20, 0, 0, 0, 0],
    ['Large Drawing Copy', 'stationery', '', 'Large size drawing book for artists and students. 20 pages.', 'Rs. 50', '', 'fas fa-paint-brush', 'linear-gradient(135deg, #6c3483, #af7ac5)', 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400', '', '', '', '', 'Paper', 'Keep dry.', '', 'Art Supplies', 'DRW-002', 20, 0, 0, 0, 0],
    ['Ball Pen (Black)', 'stationery', '', 'Smooth writing ball pen with black ink. Reliable for daily use.', 'Rs. 10', '', 'fas fa-pen', 'linear-gradient(135deg, #17202a, #2c3e50)', 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400', '', '', '', 'Black', 'Plastic, Ink', '', '', 'Stationery Brands', 'PEN-003', 20, 0, 0, 0, 0],
    ['Ball Pen (Blue)', 'stationery', '', 'Smooth writing ball pen with blue ink. Ideal for office and school.', 'Rs. 10', '', 'fas fa-pen', 'linear-gradient(135deg, #1a5276, #2e86c1)', 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400', '', '', '', 'Blue', 'Plastic, Ink', '', '', 'Stationery Brands', 'PEN-004', 20, 0, 0, 0, 0],
    ['Gel Pen (Blue)', 'stationery', '', 'Premium gel pen with smooth blue ink flow. Comfortable grip.', 'Rs. 10', '', 'fas fa-pen', 'linear-gradient(135deg, #1b4f72, #3498db)', 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400', '', '', '', 'Blue', 'Plastic, Ink, Gel', '', '', 'Stationery Brands', 'PEN-005', 20, 0, 0, 0, 0],
    ['White Chart Paper (Big)', 'stationery', '', 'Large white chart paper for projects and presentations.', 'Rs. 20', '', 'fas fa-sticky-note', 'linear-gradient(135deg, #797d7f, #bdc3c7)', 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400', '', '', 'Big', 'White', 'Paper', 'Keep flat and dry.', '', 'Art Supplies', 'CHT-001', 20, 0, 0, 0, 0],
    ['Colorful Chart Paper (Small)', 'stationery', '', 'Assorted colorful chart paper sheets, small size. Perfect for crafts.', 'Rs. 5', '', 'fas fa-sticky-note', 'linear-gradient(135deg, #e74c3c, #f1c40f)', 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400', '', '', 'Small', 'Assorted', 'Paper', 'Keep flat and dry.', '', 'Art Supplies', 'CHT-002', 20, 0, 0, 0, 0],
    ['Graph Copy Notebook', 'stationery', '', 'Graph ruled notebook for mathematics and technical drawing.', 'Rs. 20', '', 'fas fa-th', 'linear-gradient(135deg, #1a5276, #2e86c1)', 'https://images.unsplash.com/photo-1533749871417-f3ce8d3a80fc?w=400', '', '', 'Small', '', 'Paper', 'Keep dry.', '', 'School Supplies', 'GRF-001', 20, 0, 0, 0, 0],

    // --- CSV: COSMETICS (2) ---
    ['Lipstick', 'cosmetics', '', 'Long-lasting lipstick with smooth texture. Available in multiple shades.', 'Rs. 100', '', 'fas fa-lipstick', 'linear-gradient(135deg, #c0392b, #e74c3c)', 'https://images.unsplash.com/photo-1617897903246-719242758050?w=400', '', '', '', '', 'Wax, Oils, Pigments', 'Store in cool dry place.', '', 'Beauty Brands', 'LIP-002', 20, 0, 0, 0, 0],
    ['Bindi', 'cosmetics', '', 'Colorful traditional bindi pack. Perfect for cultural and daily wear.', 'Rs. 10', '', 'fas fa-dot-circle', 'linear-gradient(135deg, #e91e63, #f06292)', 'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=400', '', '', '', 'Assorted', 'Adhesive, Foam', 'Keep dry.', '', 'Ethnic Accessories', 'BIN-001', 20, 0, 0, 0, 0],

    // --- DARAZ CLOTHES (40) ---
    ["Dollar Bigboss Sleevless Derby Cotton Gym Vest For Men","clothes","","Dollar Bigboss Sleevless Derby Cotton Gym Vest For Men","Rs. 281","Rs. 351","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/8669017fb7d491778d5f1d401f872be0.jpg_400x400q75.avif","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Men's Waterproof Bike/Scooter Solid Rain Coat with Jacket and Pants - Ultimate Protection and Comfort, Adjustable Hood, Elastic Waist","clothes","","Men's Waterproof Bike/Scooter Solid Rain Coat with Jacket and Pants - Ultimate Protection and Com...","Rs. 876","Rs. 1390","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/4bef45eaeccff08e9b0a150ae6dd0871.jpg_400x400q75.avif","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["T-Shirt For Women Summer Mixed Cotton Sleeveless Casual Style Multiple Color","clothes","","T-Shirt For Women Summer Mixed Cotton Sleeveless Casual Style Multiple Color","Rs. 247","Rs. 1300","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/collect/sg/p/b5213ca51b37ca48c570dfd5c4c945ad.png_400x400q75.avif","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Super Comfortable Running Gym Shorts For Men","clothes","","Super Comfortable Running Gym Shorts For Men","Rs. 641","Rs. 1781","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/collect/sg/p/125e60e10ca9311b61511ecfa295f8cc.png_400x400q75.avif","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Men's Summer Stretchable Lightweight Loose Fit Trouser.","clothes","","Men's Summer Stretchable Lightweight Loose Fit Trouser.","Rs. 598","Rs. 997","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/Sf1f11c4e6d0d466da7c89b621f76c0c3F.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Men's Half_sleeve Shirt &Shorts Suits","clothes","","Men's Half_sleeve Shirt &Shorts Suits","Rs. 1104","Rs. 2509","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/Sc3f9255aad034cdd93745769c2c540b2n.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Men's Summer Stylish Ice Silk Fabric Polo T-shirt.","clothes","","Men's Summer Stylish Ice Silk Fabric Polo T-shirt.","Rs. 699","Rs. 1092","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/S3187dc3648a749cab2c034ddf923808dB.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Palazo Sarwal Crape Size Free","clothes","","Palazo Sarwal Crape Size Free","Rs. 299","Rs. 498","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/S1c35c4ec94604554acda0039d62ae036b.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["3 in 1 combo waterproof Rain Coat, Shoes Cover & Mobile Pouch for Women, Men, Kids, Camping, Hiking, Fishing, Outdoor Activities","clothes","","3 in 1 combo waterproof Rain Coat, Shoes Cover & Mobile Pouch for Women, Men, Kids, Camping, Hiki...","Rs. 345","Rs. 605","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/5d107a6b5291c713fcb1f2ecdd40db98.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Cotton Denim Slim Fit Half Sleeves Casual Jacket For Men - Blue And Black  Fashion Half Denim Jacket For Men","clothes","","Cotton Denim Slim Fit Half Sleeves Casual Jacket For Men - Blue And Black  Fashion Half Denim Jac...","Rs. 1715","Rs. 3500","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/0f4d75026d2a668bd02cdfb4b95b1c0f.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Men's Summer Bomber Windproof Jacket.","clothes","","Men's Summer Bomber Windproof Jacket.","Rs. 770","Rs. 1305","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/Scd5898e0fc444e9bbd0226de60560c068.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["New Men's Cotton Soft Sleeveless Workout Hoodie","clothes","","New Men's Cotton Soft Sleeveless Workout Hoodie","Rs. 396","Rs. 747","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/S6a10f147661649a9bc1985525fdf269ak.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Maria Top For Women All-Season Rib Spandex Off Shoulder Full Sleeve Casual Style Multiple Colors","clothes","","Maria Top For Women All-Season Rib Spandex Off Shoulder Full Sleeve Casual Style Multiple Colors","Rs. 650","Rs. 2031","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/47604519720438924d56b5c62a23420e.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Sporty Swimming Trunk For Men Black/Blue - Fashion  Swimming Trunks For Men  Men'S Innerwear  Swimming Wear","clothes","","Sporty Swimming Trunk For Men Black/Blue - Fashion  Swimming Trunks For Men  Men'S Innerwear  Swi...","Rs. 309","Rs. 483","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/aba470dd1093068311e1a64146d72571.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Black And Wash Ice Color Light Blue  Loose Fit Jeans Fashion Pant for Men  Multicolor  Baggy Pants Men","clothes","","Black And Wash Ice Color Light Blue  Loose Fit Jeans Fashion Pant for Men  Multicolor  Baggy Pant...","Rs. 1499","Rs. 1897","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/Sfc223374bcaa4d23bfeb9906034393d9I.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Black/Red Elastic Sporty Swimming Trunk For Men","clothes","","Black/Red Elastic Sporty Swimming Trunk For Men","Rs. 299","Rs. 399","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/335f949742869370fbdea34a83dd223d.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Ladies Stretchable Light Jacket Windcheater For Women - Fashion  Single Layer  Women's Wear  Multi color","clothes","","Ladies Stretchable Light Jacket Windcheater For Women - Fashion  Single Layer  Women's Wear  Mult...","Rs. 449","Rs. 1247","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/S290997ec9fe04200961dd02ab800bb56V.png_720x720q80.png_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Men's Premium Gym Tank Top  Sleeveless Workout Muscle Tee  Stretchable Quick-Dry Sports T-Shirt For Summer","clothes","","Men's Premium Gym Tank Top  Sleeveless Workout Muscle Tee  Stretchable Quick-Dry Sports T-Shirt F...","Rs. 459","Rs. 2550","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/8829a4de0eceef58d19436160969a498.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Summer Age Of Steam Oversized Printed Design Multicolor T-shirt  For Women","clothes","","Summer Age Of Steam Oversized Printed Design Multicolor T-shirt  For Women","Rs. 458","Rs. 996","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/Scd238b42a48944869901c0c5964d4ac7i.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Sky Blue Baggy Pants For Men'S By Maxzone - Multisize  Fashion  Baggy Pants  Pants For Men  Men'S Wear","clothes","","Sky Blue Baggy Pants For Men'S By Maxzone - Multisize  Fashion  Baggy Pants  Pants For Men  Men'S...","Rs. 1209","Rs. 2198","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/8ae6f3bc00d76fd6378d3c6b7a56bc93.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Shirt For Men Summer Cotton Style Casual 3 Button Placket Multiple Colors","clothes","","Shirt For Men Summer Cotton Style Casual 3 Button Placket Multiple Colors","Rs. 720","Rs. 1895","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/21b1341587bfb73828359358c17333bd.png_720x720q80.png_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Men's Summer Windcheater Jacket  Lightweight Windproof Casual Outdoor Sports Wear - Multiple Colors","clothes","","Men's Summer Windcheater Jacket  Lightweight Windproof Casual Outdoor Sports Wear - Multiple Colors","Rs. 586","Rs. 2021","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/a133c418b8cedae53698913911fe5c09.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Embroidered Semi Stitched Lehenga Choli For Women (Purple) - Women's Partywear Lehenga Choli  Dresses For Women","clothes","","Embroidered Semi Stitched Lehenga Choli For Women (Purple) - Women's Partywear Lehenga Choli  Dre...","Rs. 1624","Rs. 3530","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/51af5e022ec5275a0169abd3c2e697e3.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Suit For Women All-Season Viscose Rayon Solid Straight Casual Ethnic Style Multiple Colors Model PLDI-021","clothes","","Suit For Women All-Season Viscose Rayon Solid Straight Casual Ethnic Style Multiple Colors Model ...","Rs. 1872","Rs. 4800","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/S517edbdd0953471a8b1be17fcca0b1aaD.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Nyptra Black Solid Premium Denim Jacket For Women - Fashion  Denim Jackets  Jackets For Women  Women's Wear","clothes","","Nyptra Black Solid Premium Denim Jacket For Women - Fashion  Denim Jackets  Jackets For Women  Wo...","Rs. 1272","Rs. 3634","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/6d01af2c007b7fa25f3c8f1ddd72cc93.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Men's Quick Dry  Swimming Shorts and Beach wear for Swimming Trunk \\ Underwear","clothes","","Men's Quick Dry  Swimming Shorts and Beach wear for Swimming Trunk \\ Underwear","Rs. 599","Rs. 856","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/dc9e6eade339c5ca5bc64919911239c1.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Bamboo Knot Dragon Pattern New Summer Vest Sleeveless Ice Silk T-Shirt Men's Stylish Trendy Tank Top Sports Shirt Casual Outerwear","clothes","","Bamboo Knot Dragon Pattern New Summer Vest Sleeveless Ice Silk T-Shirt Men's Stylish Trendy Tank ...","Rs. 1330","Rs. 2558","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/lk/p/52555df6eb23f11234546c136dfa9359.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Dollar Big Boss Men Cotton Sando Vest","clothes","","Dollar Big Boss Men Cotton Sando Vest","Rs. 352","Rs. 424","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/79f7372538ede138589c32542b474a42.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Black/Blue Fashionice Print Swimming Trunk For Men","clothes","","Black/Blue Fashionice Print Swimming Trunk For Men","Rs. 585","Rs. 616","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/8615c71fc663328b30e999ece3396d2b.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Off Shoulder Full Sleeve Long Dress For Women","clothes","","Off Shoulder Full Sleeve Long Dress For Women","Rs. 903","Rs. 3010","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/c148f6efbb17e02a14a003b5450af5c7.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Classic Fit Summer Jacket, Tshirt And Jogger Set For Men","clothes","","Classic Fit Summer Jacket, Tshirt And Jogger Set For Men","Rs. 1242","Rs. 2300","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/7b43b215a6ff0293cc422d17a593038a.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["White Gagan Cotton Sando For Men -Pack Of 5","clothes","","White Gagan Cotton Sando For Men -Pack Of 5","Rs. 649","","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/6d26a601a98bb77ac903567fe84b9e76.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Wraon Light Grey Blash Stretchable Premium Straight Fit Jeans For Men - Fashion  Pants For Men  Men's Wear  Jeans","clothes","","Wraon Light Grey Blash Stretchable Premium Straight Fit Jeans For Men - Fashion  Pants For Men  M...","Rs. 1641","Rs. 2984","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/3247bfae9b84d264c454e6a23be5f08a.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Winter Sleeveless Half Jacket For Men With 300 Gsm Holofill Material","clothes","","Winter Sleeveless Half Jacket For Men With 300 Gsm Holofill Material","Rs. 649","Rs. 1202","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://laz-img-sg.alicdn.com/p/6b93bf4e8617b321a85af894df06b83c.png","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Summer Strainght Catpenter Denim Half","clothes","","Summer Strainght Catpenter Denim Half","Rs. 1125","Rs. 1355","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/Sdfaa3c9a4605413eb6c5d8014cbb93eav.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Synthetic leather jacket for men and girls","clothes","","Synthetic leather jacket for men and girls","Rs. 1800","","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/S4a2385f15386412c9297e73dc46571afw.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Grunge Asymmetrical Rib Top For Women","clothes","","Grunge Asymmetrical Rib Top For Women","Rs. 725","Rs. 1510","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://laz-img-sg.alicdn.com/p/686cf56bea1e249bc5bbfa25f86441db.png","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Korean Chic Letter Print Short Design Light Padded Tank Top Camisole","clothes","","Korean Chic Letter Print Short Design Light Padded Tank Top Camisole","Rs. 391","Rs. 698","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/static/np/p/7d5db065aa6860c92b91c1bf93ea1eae.jpg_720x720q80.jpg_.webp","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Men Cotton Hoodies Sleeveless Muscle Gym Sport Slim Vest Bodybuilding Hooded Hip Hop Streetwear Workout T-shirt","clothes","","Men Cotton Hoodies Sleeveless Muscle Gym Sport Slim Vest Bodybuilding Hooded Hip Hop Streetwear W...","Rs. 380","Rs. 704","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://laz-img-sg.alicdn.com/p/731af1c042bc9b3050f360d93a3f9097.png","","","","","","","","Daraz Fashion","",50,0,0,0,0,0],
    ["Men's Summer Single Layer Lightweight Windcheater Jacket .","clothes","","Men's Summer Single Layer Lightweight Windcheater Jacket .","Rs. 418","Rs. 995","fas fa-tshirt","linear-gradient(135deg, #e94560, #d63851)","https://img.drz.lazcdn.com/g/kf/Sb776987c6789453bb4ced4503b96ef5b4.jpg_720x720q80.jpg","","","","","","","","Daraz Fashion","",50,0,0,0,0,0]
  ];
  // Append JSON-loaded products
  for (const p of jsonProducts) {
    defaultProducts.push(toProductArray(p));
  }
  for (const p of defaultProducts) {
    run(`INSERT INTO products (name, category, subcategory, desc, price, compare_price, icon, gradient, image, images, video_url, sizes, colors, material, care_instructions, fit_info, brand, sku, stock_count, sold_count, is_featured, is_new, is_best_seller, is_trending)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, p);
  }

  const defaultTestimonials = [
    ['Ram Kumar', 'Regular Customer', 'Amazing quality and super fast delivery! Aryal Store never disappoints. I recommend them to everyone I know.', 5],
    ['Sita Pokharel', 'Happy Shopper', 'Great prices and excellent customer service. The team went above and beyond to help me with my order.', 5],
    ['Anil Gurung', 'Verified Buyer', 'The products are exactly as described. High quality and affordable. My go-to store for everything I need.', 5]
  ];
  for (const t of defaultTestimonials) {
    run('INSERT INTO testimonials (name, label, text, stars) VALUES (?, ?, ?, ?)', t);
  }

  const defaultCategories = [
    ['Clothes', 'clothes', 0, 'Fashion for men, women, and kids', ''],
    ['Men', 'men', 1, 'Men\'s fashion collection', ''],
    ['Women', 'women', 1, 'Women\'s fashion collection', ''],
    ['Kids', 'kids', 1, 'Kids fashion collection', ''],
    ['Accessories', 'accessories', 0, 'Fashion accessories', ''],
    ['Stationery', 'stationery', 0, 'Office and school supplies', ''],
    ['Cosmetics', 'cosmetics', 0, 'Beauty and personal care', ''],
    ['Cylinder', 'cylinder', 0, 'LPG gas cylinders and refills', '']
  ];
  for (const c of defaultCategories) {
    run('INSERT OR IGNORE INTO categories (name, slug, parent_id, description, image) VALUES (?, ?, ?, ?, ?)', c);
  }

  const sizeChartData = {
    clothes: {
      XS: { chest: '32-34', waist: '26-28', hips: '34-36' },
      S: { chest: '34-36', waist: '28-30', hips: '36-38' },
      M: { chest: '36-38', waist: '30-32', hips: '38-40' },
      L: { chest: '38-40', waist: '32-34', hips: '40-42' },
      XL: { chest: '40-42', waist: '34-36', hips: '42-44' },
      XXL: { chest: '42-44', waist: '36-38', hips: '44-46' }
    }
  };
  for (const [cat, sizes] of Object.entries(sizeChartData)) {
    for (const [size, measurements] of Object.entries(sizes)) {
      run('INSERT INTO size_chart (category, size, measurements) VALUES (?, ?, ?)',
        [cat, size, JSON.stringify(measurements)]);
    }
  }

  run('INSERT INTO coupons (code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['WELCOME10', '10% off on your first order', 'percentage', 10, 0, 500, 100, 1]);
  run('INSERT INTO coupons (code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['SAVE20', 'Rs. 20 off on orders above Rs. 1000', 'fixed', 200, 1000, 200, 50, 1]);
  run('INSERT INTO coupons (code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['FREESHIP', 'Free shipping on your order', 'fixed', 100, 500, 100, 200, 1]);

  res.json({ success: true });
});

// ========== RECOMMENDATIONS ==========
app.get('/api/recommendations/:product_id', (req, res) => {
  const product = queryOne('SELECT * FROM products WHERE id = ?', [req.params.product_id]);
  if (!product) return res.json([]);
  const sameCategory = queryAll('SELECT * FROM products WHERE category = ? AND id != ? AND status = ? ORDER BY sold_count DESC LIMIT 4',
    [product.category, req.params.product_id, 'active']);
  if (sameCategory.length >= 4) return res.json(sameCategory);
  const alsoBought = queryAll(`SELECT p.* FROM products p
    WHERE p.id IN (
      SELECT DISTINCT oi.product_id FROM order_items oi
      WHERE oi.order_id IN (
        SELECT DISTINCT oi2.order_id FROM order_items oi2 WHERE oi2.product_id = ?
      ) AND oi.product_id != ?
    ) AND p.status = ? ORDER BY sold_count DESC LIMIT 4`,
    [req.params.product_id, req.params.product_id, 'active']);
  const combined = [...sameCategory, ...alsoBought.filter(p => !sameCategory.find(sp => sp.id === p.id))];
  res.json(combined.slice(0, 4));
});

// ========== SEED DATABASE ==========
app.post('/api/seed', authMiddleware, async (req, res) => {
  try {
    const { importAll } = require('./import-products');
    await importAll(false);
    const products = queryAll('SELECT category, COUNT(*) as cnt FROM products GROUP BY category ORDER BY category');
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

initDb().then(async () => {
  const count = queryOne('SELECT COUNT(*) as cnt FROM products');
  if (!count || count.cnt === 0) {
    console.log('Database empty — seeding with default products...');
    try {
      const { importAll } = require('./import-products');
      await importAll(false);
    } catch (err) {
      console.error('Auto-seed failed:', err.message);
    }
  }
  app.listen(PORT, () => {
    console.log(`Aryal Store backend running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
