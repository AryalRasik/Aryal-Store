const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { supabase, initDb } = require('./db');

const UPLOADS_DIR = process.env.VERCEL
  ? '/tmp/uploads'
  : path.join(__dirname, 'uploads');
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

app.get('/', (req, res) => {
  res.send('Aryal Store Backend is running successfully!');
});

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

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, function(err) {
    if (err) return next(err);
    if (req.user && req.user.role === 'admin') return next();
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  });
}

function getSessionId(req) {
  return req.headers['x-session-id'] || 'anonymous_' + req.ip;
}

// ========== AUTH ==========
app.post('/api/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required' });
    const { data: setting } = await supabase.from('settings').select('admin_password').eq('id', 1).maybeSingle();
    if (!setting) return res.status(500).json({ error: 'Settings not found' });
    if (password === setting.admin_password) {
      const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ token });
    }
    res.status(401).json({ error: 'Invalid password' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== USER AUTH ==========
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {}
  return [];
}
function saveUsers(users) {
  try {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch {}
}

app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const users = loadUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9),
      name, email: email.toLowerCase(), password: hashedPassword, phone: phone || '', facebook_id: '', created_at: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);
    const token = jwt.sign({ role: 'user', id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email, phone: newUser.phone } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const users = loadUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'No account found with this email' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ role: 'user', id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone || '' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/profile', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.json({ id: 'admin', name: 'Admin', email: 'admin@aryalstore.com' });
    }
    const users = loadUsers();
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/facebook', async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token) return res.status(400).json({ error: 'Facebook access token is required' });
    // Verify token with Facebook Graph API
    const fbRes = await axios.get('https://graph.facebook.com/v18.0/me', {
      params: { fields: 'id,name,email', access_token }
    });
    const fbData = fbRes.data;
    if (!fbData || !fbData.id) return res.status(400).json({ error: 'Invalid Facebook token' });
    const users = loadUsers();
    let user = users.find(u => u.facebook_id === fbData.id || u.email.toLowerCase() === (fbData.email || '').toLowerCase());
    if (user) {
      // Update facebook_id if not set
      if (!user.facebook_id) {
        user.facebook_id = fbData.id;
        saveUsers(users);
      }
    } else {
      // Create new user from Facebook data
      user = {
        id: Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9),
        name: fbData.name || 'Facebook User',
        email: (fbData.email || fbData.id + '@facebook.com').toLowerCase(),
        password: '',
        phone: '',
        facebook_id: fbData.id,
        created_at: new Date().toISOString()
      };
      users.push(user);
      saveUsers(users);
    }
    const token = jwt.sign({ role: 'user', id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone || '' } });
  } catch (err) {
    res.status(500).json({ error: 'Facebook authentication failed: ' + (err.response?.data?.error?.message || err.message) });
  }
});

// ========== UPLOAD ==========
app.post('/api/upload', adminMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: '/uploads/' + req.file.filename });
  });
});

app.post('/api/upload/multiple', adminMiddleware, (req, res) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
    const urls = req.files.map(f => '/uploads/' + f.filename);
    res.json({ urls });
  });
});

// ========== HERO ==========
app.get('/api/hero', async (req, res) => {
  try {
    const { data: hero } = await supabase.from('hero').select('heading, subtext').eq('id', 1).maybeSingle();
    res.json(hero || { heading: '', subtext: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/hero', adminMiddleware, async (req, res) => {
  try {
    const { heading, subtext } = req.body;
    const { error } = await supabase.from('hero').update({ heading: heading || '', subtext: subtext || '' }).eq('id', 1);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ABOUT ==========
app.get('/api/about', async (req, res) => {
  try {
    const { data: about } = await supabase.from('about').select('title, heading, desc1, desc2, features').eq('id', 1).maybeSingle();
    res.json(about || { title: '', heading: '', desc1: '', desc2: '', features: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/about', adminMiddleware, async (req, res) => {
  try {
    const { title, heading, desc1, desc2, features } = req.body;
    const { error } = await supabase.from('about').update({
      title: title || '', heading: heading || '', desc1: desc1 || '', desc2: desc2 || '', features: features || ''
    }).eq('id', 1);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== PRODUCTS ==========
function parsePrice(priceStr) {
  if (!priceStr) return NaN;
  return parseFloat(String(priceStr).replace(/[^0-9.]/g, ''));
}

app.get('/api/products', async (req, res) => {
  try {
    const { category, sort, search, min_price, max_price, brand, color, size, material, page, limit } = req.query;
    let query = supabase.from('products').select('*').eq('status', 'active');

    if (category) query = query.eq('category', category);
    if (brand) query = query.eq('brand', brand);
    if (material) query = query.ilike('material', '%' + material + '%');
    if (search) query = query.or('name.ilike.%' + search + '%,desc.ilike.%' + search + '%');

    let { data: products, error } = await query;
    if (error && error.message && error.message.includes('Could not find') && search) {
      // Fallback: search without desc column
      query = supabase.from('products').select('*').eq('status', 'active');
      if (category) query = query.eq('category', category);
      if (brand) query = query.eq('brand', brand);
      if (material) query = query.ilike('material', '%' + material + '%');
      if (search) query = query.or('name.ilike.%' + search + '%');
      const fallback = await query;
      if (fallback.error) throw fallback.error;
      products = fallback.data;
    } else if (error) {
      throw error;
    }
    if (!products) products = [];

    if (color) products = products.filter(p => p.colors && p.colors.toLowerCase().includes(color.toLowerCase()));
    if (size) products = products.filter(p => p.sizes && p.sizes.split(',').map(s => s.trim().toLowerCase()).includes(size.toLowerCase()));
    if (min_price) products = products.filter(p => { const v = parsePrice(p.price); return !isNaN(v) && v >= parseFloat(min_price); });
    if (max_price) products = products.filter(p => { const v = parsePrice(p.price); return !isNaN(v) && v <= parseFloat(max_price); });

    if (sort === 'price_asc') products.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    else if (sort === 'price_desc') products.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    else if (sort === 'newest') products.sort((a, b) => b.id - a.id);
    else if (sort === 'popular') products.sort((a, b) => (b.sold_count || 0) - (a.sold_count || 0));
    else if (sort === 'rating') products.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else products.sort((a, b) => a.id - b.id);

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    let products;
    try {
      const result = await supabase
        .from('products')
        .select('id, name, price, image, category')
        .eq('status', 'active')
        .or('name.ilike.%' + q + '%,desc.ilike.%' + q + '%,category.ilike.%' + q + '%')
        .order('sold_count', { ascending: false })
        .limit(10);
      if (result.error) throw result.error;
      products = result.data;
    } catch {
      // Fallback: search without desc column if it doesn't exist
      const result = await supabase
        .from('products')
        .select('id, name, price, image, category')
        .eq('status', 'active')
        .or('name.ilike.%' + q + '%,category.ilike.%' + q + '%')
        .order('sold_count', { ascending: false })
        .limit(10);
      if (result.error) throw result.error;
      products = result.data;
    }
    res.json(products || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/featured', async (req, res) => {
  try {
    const { data: products, error } = await supabase.from('products').select('*').eq('status', 'active').eq('is_featured', true).order('id');
    if (error) throw error;
    res.json(products || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/best-sellers', async (req, res) => {
  try {
    const { data: products, error } = await supabase.from('products').select('*').eq('status', 'active').order('sold_count', { ascending: false }).limit(8);
    if (error) throw error;
    res.json(products || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/new-arrivals', async (req, res) => {
  try {
    const { data: products, error } = await supabase.from('products').select('*').eq('status', 'active').order('id', { ascending: false }).limit(8);
    if (error) throw error;
    res.json(products || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/trending', async (req, res) => {
  try {
    const { data: products, error } = await supabase.from('products').select('*').eq('status', 'active').eq('is_trending', true).order('sold_count', { ascending: false }).limit(8);
    if (error) throw error;
    res.json(products || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { data: product, error } = await supabase.from('products').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { data: images } = await supabase.from('product_images').select('*').eq('product_id', product.id).order('sort_order').order('is_primary', { ascending: false });
    product.images_list = images || [];
    const { data: reviews } = await supabase.from('reviews').select('*').eq('product_id', product.id).eq('status', 'approved').order('created_at', { ascending: false }).limit(10);
    product.reviews = reviews || [];
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', adminMiddleware, async (req, res) => {
  try {
    const { name, category, subcategory, desc, price, compare_price, icon, gradient, image, images, video_url, sizes, colors, material, care_instructions, fit_info, brand, sku, stock_count, is_featured, is_new, is_best_seller, is_trending } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'Name and category are required' });
    const { data, error } = await supabase.from('products').insert({
      name, category, subcategory: subcategory || '', desc: desc || '', price: price || '',
      compare_price: compare_price || '', icon: icon || 'fas fa-box',
      gradient: gradient || 'linear-gradient(135deg, #e94560, #d63851)',
      image: image || '', images: images || '', video_url: video_url || '',
      sizes: sizes || '', colors: colors || '', material: material || '',
      care_instructions: care_instructions || '', fit_info: fit_info || '',
      brand: brand || '', sku: sku || '', stock_count: stock_count || 100,
      is_featured: is_featured || false, is_new: is_new || false,
      is_best_seller: is_best_seller || false, is_trending: is_trending || false
    }).select();
    if (error) throw error;
    res.json(data && data[0] ? data[0] : { success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', adminMiddleware, async (req, res) => {
  try {
    const { name, category, subcategory, desc, price, compare_price, icon, gradient, image, images, video_url, sizes, colors, material, care_instructions, fit_info, brand, sku, stock_count, is_featured, is_new, is_best_seller, is_trending, status } = req.body;
    const { error } = await supabase.from('products').update({
      name, category, subcategory, desc, price, compare_price, icon, gradient,
      image, images, video_url, sizes, colors, material, care_instructions,
      fit_info, brand, sku, stock_count, is_featured, is_new, is_best_seller,
      is_trending, status
    }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', adminMiddleware, async (req, res) => {
  try {
    const { data: prod } = await supabase.from('products').select('image').eq('id', req.params.id).maybeSingle();
    if (prod && prod.image) {
      const imgPath = path.join(__dirname, prod.image.replace(/^\//, ''));
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    await supabase.from('product_images').delete().eq('product_id', req.params.id);
    await supabase.from('wishlist').delete().eq('product_id', req.params.id);
    await supabase.from('recently_viewed').delete().eq('product_id', req.params.id);
    await supabase.from('reviews').delete().eq('product_id', req.params.id);
    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CATEGORIES ==========
app.get('/api/categories', async (req, res) => {
  try {
    const { data: cats, error } = await supabase.from('categories').select('*').order('sort_order').order('name');
    if (error) throw error;
    res.json(cats || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', adminMiddleware, async (req, res) => {
  try {
    const { name, slug, parent_id, description, image } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required' });
    const { data, error } = await supabase.from('categories').insert({
      name, slug, parent_id: parent_id || 0, description: description || '', image: image || ''
    }).select();
    if (error) throw error;
    res.json(data && data[0] ? data[0] : { success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('categories').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== PRODUCT IMAGES ==========
app.post('/api/product-images', adminMiddleware, async (req, res) => {
  try {
    const { product_id, image_url, is_primary } = req.body;
    if (!product_id || !image_url) return res.status(400).json({ error: 'Product ID and image URL required' });
    const { error } = await supabase.from('product_images').insert({
      product_id, image_url, is_primary: is_primary || false, sort_order: 0
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/product-images/:id', adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('product_images').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== TESTIMONIALS ==========
app.get('/api/testimonials', async (req, res) => {
  try {
    const { data: testimonials, error } = await supabase.from('testimonials').select('*').order('id');
    if (error) throw error;
    res.json(testimonials || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/testimonials', adminMiddleware, async (req, res) => {
  try {
    const { name, label, text, stars } = req.body;
    if (!name || !text) return res.status(400).json({ error: 'Name and text are required' });
    const { data, error } = await supabase.from('testimonials').insert({
      name, label: label || 'Customer', text, stars: stars || 5
    }).select();
    if (error) throw error;
    res.json(data && data[0] ? data[0] : { success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/testimonials/:id', adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('testimonials').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CONTACT ==========
app.get('/api/contact', async (req, res) => {
  try {
    const { data: contact } = await supabase.from('contact').select('*').eq('id', 1).maybeSingle();
    res.json(contact || { address: '', phone: '', email: '', hours: '', lat: '28.0340872', lng: '83.4126681', whatsapp: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/contact', adminMiddleware, async (req, res) => {
  try {
    const { address, phone, email, hours, lat, lng, whatsapp } = req.body;
    const { error } = await supabase.from('contact').update({
      address: address || '', phone: phone || '', email: email || '', hours: hours || '',
      lat: lat || '28.0340872', lng: lng || '83.4126681', whatsapp: whatsapp || ''
    }).eq('id', 1);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== MESSAGES ==========
app.post('/api/messages', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, and message are required' });
    const { error } = await supabase.from('messages').insert({ name, email, subject: subject || '', message });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', adminMiddleware, async (req, res) => {
  try {
    const { is_read } = req.query;
    let query = supabase.from('messages').select('*').order('id', { ascending: false });
    if (is_read !== undefined) query = query.eq('is_read', parseInt(is_read));
    const { data: messages, error } = await query;
    if (error) throw error;
    res.json(messages || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/messages/:id/read', adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('messages').update({ is_read: 1 }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/messages/:id', adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('messages').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== NOTIFICATIONS ==========
function sendOrderEmail(order, items, settings) {
  if (!settings.notify_email || !settings.store_email || !settings.smtp_host) return;
  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port || 587,
      secure: (settings.smtp_port || 587) === 465,
      auth: { user: settings.smtp_user, pass: settings.smtp_pass }
    });
    const itemsHtml = items.map(i =>
      '<tr><td style="padding:6px;border-bottom:1px solid #eee;">' + i.product_name + '</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:center;">' + i.quantity + '</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">' + i.unit_price + '</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">Rs. ' + (parseInt(i.unit_price.replace(/[^0-9]/g,'')) * i.quantity).toLocaleString() + '</td></tr>'
    ).join('');
    const mailOptions = {
      from: settings.smtp_user,
      to: settings.store_email,
      subject: 'New Order #' + order.id + ' - ' + order.customer_name,
      html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="background:#e94560;color:#fff;padding:16px;border-radius:8px 8px 0 0;margin:0;">New Order Received</h2><div style="border:1px solid #ddd;border-top:0;padding:20px;border-radius:0 0 8px 8px;"><p><strong>Order #:</strong> ' + order.id + '</p><p><strong>Date:</strong> ' + new Date(order.created_at).toLocaleString() + '</p><p><strong>Customer:</strong> ' + order.customer_name + '</p><p><strong>Phone:</strong> ' + order.customer_phone + '</p><p><strong>Email:</strong> ' + (order.customer_email || 'N/A') + '</p><p><strong>Address:</strong> ' + order.customer_address + '</p><p><strong>Payment:</strong> ' + order.payment_method + '</p><p><strong>Notes:</strong> ' + (order.notes || 'N/A') + '</p><table style="width:100%;border-collapse:collapse;margin-top:12px;"><thead><tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;">Item</th><th style="padding:8px;text-align:center;">Qty</th><th style="padding:8px;text-align:right;">Price</th><th style="padding:8px;text-align:right;">Total</th></tr></thead><tbody>' + itemsHtml + '</tbody></table><hr style="border:none;border-top:2px solid #eee;margin:12px 0;"><p style="font-size:1.1rem;text-align:right;"><strong>Total: Rs. ' + (parseInt(order.total_amount.replace(/[^0-9]/g,'')) || 0).toLocaleString() + '</strong></p><p style="font-size:1.1rem;text-align:right;"><strong>Status: Pending</strong></p><hr style="border:none;border-top:2px solid #eee;margin:12px 0;"><p style="font-size:0.85rem;color:#888;text-align:center;">This is an automated notification from ' + (settings.store_name || 'Aryal Store') + '.</p></div></div>'
    };
    transporter.sendMail(mailOptions).catch(function() {});
  } catch(e) {}
}

function sendOrderWhatsApp(order, items, settings) {
  if (!settings.notify_whatsapp || !settings.whatsapp_number) return;
  try {
    const itemsStr = items.map(function(i) { return '  ' + i.product_name + ' x' + (i.quantity || i.qty) + ' = Rs. ' + (parseInt((i.unit_price || i.price || '0').replace(/[^0-9]/g,'')) * (i.quantity || i.qty || 1)).toLocaleString(); }).join('\n');
    const total = (parseInt(order.total_amount.replace(/[^0-9]/g,'')) || 0).toLocaleString();
    const message = 'New Order #' + order.id + '\n\nCustomer: ' + order.customer_name + '\nPhone: ' + order.customer_phone + '\nEmail: ' + (order.customer_email || 'N/A') + '\nAddress: ' + order.customer_address + '\nPayment: ' + order.payment_method + '\nNotes: ' + (order.notes || 'N/A') + '\n\nItems:\n' + itemsStr + '\n\nTotal: Rs. ' + total + '\nStatus: Pending';
    const waUrl = 'https://wa.me/' + settings.whatsapp_number.replace(/[^0-9]/g,'') + '?text=' + encodeURIComponent(message);
    console.log('WhatsApp notification URL:', waUrl);

    if (settings.whatsapp_api_token && settings.whatsapp_phone_id) {
      axios.post('https://graph.facebook.com/v18.0/' + settings.whatsapp_phone_id + '/messages', {
        messaging_product: 'whatsapp',
        to: settings.whatsapp_number.replace(/[^0-9]/g,''),
        type: 'text',
        text: { body: message }
      }, {
        headers: { 'Authorization': 'Bearer ' + settings.whatsapp_api_token, 'Content-Type': 'application/json' }
      }).catch(function() {});
    }
  } catch(e) {}
}

// ========== ORDERS ==========
app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, customer_phone, customer_email, customer_address, payment_method, notes, items, total_amount, subtotal, discount, coupon_code, customer_id } = req.body;
    if (!customer_name || !customer_phone || !customer_address || !payment_method || !items || !items.length) {
      return res.status(400).json({ error: 'Missing required order fields' });
    }
    const { data: orderData, error: orderError } = await supabase.from('orders').insert({
      customer_name, customer_phone, customer_email: customer_email || '',
      customer_address, payment_method, notes: notes || '',
      total_amount, subtotal: subtotal || total_amount, discount: discount || '0',
      coupon_code: coupon_code || '', status: 'pending'
    }).select();
    if (orderError) throw orderError;
    const order = orderData[0];
    for (const item of items) {
      await supabase.from('order_items').insert({
        order_id: order.id, product_id: item.product_id || null,
        product_name: item.product_name, quantity: item.quantity,
        unit_price: item.unit_price, size: item.size || '', color: item.color || ''
      });
      const { data: prod } = await supabase.from('products').select('sold_count').eq('id', item.product_id).maybeSingle();
      if (prod) {
        await supabase.from('products').update({ sold_count: (prod.sold_count || 0) + 1 }).eq('id', item.product_id);
      }
    }
    await supabase.from('order_tracking').insert({ order_id: order.id, status: 'pending', note: 'Order placed successfully' });

    if (customer_phone) {
      const { data: existing } = await supabase.from('customers').select('id').eq('phone', customer_phone).maybeSingle();
      if (existing) {
        const { data: c } = await supabase.from('customers').select('*').eq('id', existing.id).maybeSingle();
        if (c) {
          const currentSpent = parseFloat(String(c.total_spent || '').replace(/[^0-9]/g, '') || '0');
          const orderAmt = parseFloat(String(total_amount || '').replace(/[^0-9]/g, ''));
          await supabase.from('customers').update({
            total_orders: (c.total_orders || 0) + 1,
            total_spent: String(currentSpent + orderAmt)
          }).eq('id', existing.id);
        }
      } else {
        await supabase.from('customers').insert({
          name: customer_name, email: customer_email || '', phone: customer_phone,
          address: customer_address, total_orders: 1, total_spent: total_amount
        });
      }
    }

    try {
      const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (settings) {
        const { data: orderItems } = await supabase.from('order_items').select('*').eq('order_id', order.id);
        sendOrderEmail(order, orderItems || [], settings);
        sendOrderWhatsApp(order, orderItems || [], settings);
      }
    } catch(e) {}

    res.json({ success: true, order_id: order.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders', adminMiddleware, async (req, res) => {
  try {
    const { status, phone } = req.query;
    let query = supabase.from('orders').select('*').order('id', { ascending: false });
    if (status && status !== 'all') query = query.eq('status', status);
    if (phone) query = query.eq('customer_phone', phone);
    const { data: orders, error } = await query;
    if (error) throw error;
    for (const order of orders || []) {
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
      order.items = items || [];
      const { data: tracking } = await supabase.from('order_tracking').select('*').eq('order_id', order.id).order('created_at');
      order.tracking = tracking || [];
    }
    res.json(orders || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
    order.items = items || [];
    const { data: tracking } = await supabase.from('order_tracking').select('*').eq('order_id', order.id).order('created_at');
    order.tracking = tracking || [];
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/status', adminMiddleware, async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const validStatuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await supabase.from('orders').update({ status }).eq('id', req.params.id);
    await supabase.from('order_tracking').insert({ order_id: req.params.id, status, note: note || 'Status updated to ' + status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', adminMiddleware, async (req, res) => {
  try {
    await supabase.from('order_tracking').delete().eq('order_id', req.params.id);
    await supabase.from('order_items').delete().eq('order_id', req.params.id);
    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ORDER TRACKING ==========
app.get('/api/orders/:id/tracking', async (req, res) => {
  try {
    const { data: tracking, error } = await supabase.from('order_tracking').select('*').eq('order_id', req.params.id).order('created_at');
    if (error) throw error;
    res.json(tracking || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== RETURN REQUESTS ==========
app.post('/api/return-requests', async (req, res) => {
  try {
    const { order_id, customer_name, customer_phone, customer_email, reason, details } = req.body;
    if (!order_id || !customer_name || !customer_phone || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const { error } = await supabase.from('return_requests').insert({
      order_id, customer_name, customer_phone, customer_email: customer_email || '',
      reason, details: details || ''
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/return-requests', adminMiddleware, async (req, res) => {
  try {
    const { data: requests, error } = await supabase.from('return_requests').select('*').order('id', { ascending: false });
    if (error) throw error;
    res.json(requests || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/return-requests/:id/status', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const { error } = await supabase.from('return_requests').update({ status }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/return-requests/:id', adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('return_requests').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== WISHLIST ==========
app.get('/api/wishlist', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { data: items, error } = await supabase
      .from('wishlist')
      .select('*, products!inner(*)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const mapped = (items || []).map(function(w) { return w.products; });
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/wishlist', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ error: 'Product ID required' });
    const { data: existing } = await supabase.from('wishlist').select('id').eq('session_id', sessionId).eq('product_id', product_id).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from('wishlist').insert({ session_id: sessionId, product_id });
      if (error) throw error;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/wishlist/:product_id', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { error } = await supabase.from('wishlist').delete().eq('session_id', sessionId).eq('product_id', req.params.product_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== RECENTLY VIEWED ==========
app.get('/api/recently-viewed', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { data: items, error } = await supabase
      .from('recently_viewed')
      .select('*, products!inner(*)')
      .eq('session_id', sessionId)
      .order('viewed_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    const mapped = (items || []).map(function(rv) { return Object.assign({}, rv.products, { viewed_at: rv.viewed_at }); });
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recently-viewed', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ error: 'Product ID required' });
    await supabase.from('recently_viewed').delete().eq('session_id', sessionId).eq('product_id', product_id);
    await supabase.from('recently_viewed').insert({ session_id: sessionId, product_id });
    const { data: all } = await supabase.from('recently_viewed').select('id').eq('session_id', sessionId).order('viewed_at', { ascending: false });
    if (all && all.length > 50) {
      const toDelete = all.slice(50).map(function(r) { return r.id; });
      await supabase.from('recently_viewed').delete().in('id', toDelete);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== REVIEWS ==========
app.get('/api/products/:id/reviews', async (req, res) => {
  try {
    const { data: reviews, error } = await supabase.from('reviews').select('*').eq('product_id', req.params.id).eq('status', 'approved').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(reviews || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { product_id, customer_name, customer_email, rating, title, comment, size, color } = req.body;
    if (!product_id || !customer_name || !rating) {
      return res.status(400).json({ error: 'Product ID, name, and rating are required' });
    }
    await supabase.from('reviews').insert({
      product_id, customer_name, customer_email: customer_email || '',
      rating, title: title || '', comment: comment || '',
      size: size || '', color: color || '', status: 'pending'
    });

    const { data: approved } = await supabase.from('reviews').select('rating').eq('product_id', product_id).eq('status', 'approved');
    if (approved && approved.length > 0) {
      const avg = approved.reduce(function(sum, r) { return sum + r.rating; }, 0) / approved.length;
      await supabase.from('products').update({
        rating: Math.round(avg * 10) / 10,
        review_count: approved.length
      }).eq('id', product_id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reviews/:id', async (req, res) => {
  try {
    const { data: review, error } = await supabase.from('reviews').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/reviews/:id/update', async (req, res) => {
  try {
    const { customer_name, customer_email, rating, title, comment, size, color } = req.body;
    if (!customer_name || !rating) return res.status(400).json({ error: 'Name and rating are required' });
    await supabase.from('reviews').update({
      customer_name, customer_email: customer_email || '', rating,
      title: title || '', comment: comment || '', size: size || '',
      color: color || '', status: 'pending'
    }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reviews/:id/remove', async (req, res) => {
  try {
    const { data: review, error: findError } = await supabase.from('reviews').select('*').eq('id', req.params.id).maybeSingle();
    if (findError) throw findError;
    if (!review) return res.status(404).json({ error: 'Review not found' });
    await supabase.from('reviews').delete().eq('id', req.params.id);
    const { data: approved } = await supabase.from('reviews').select('rating').eq('product_id', review.product_id).eq('status', 'approved');
    if (approved && approved.length > 0) {
      const avg = approved.reduce(function(sum, r) { return sum + r.rating; }, 0) / approved.length;
      await supabase.from('products').update({
        rating: Math.round(avg * 10) / 10,
        review_count: approved.length
      }).eq('id', review.product_id);
    } else {
      await supabase.from('products').update({ rating: 0, review_count: 0 }).eq('id', review.product_id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reviews', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data: reviews, error } = await query;
    if (error) throw error;
    const productIds = [...new Set((reviews || []).map(function(r) { return r.product_id; }).filter(Boolean))];
    const { data: products } = await supabase.from('products').select('id, name').in('id', productIds);
    var productMap = {};
    if (products) products.forEach(function(p) { productMap[p.id] = p.name; });
    const result = (reviews || []).map(function(r) { return Object.assign({}, r, { product_name: productMap[r.product_id] || '' }); });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/reviews/:id/status', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    await supabase.from('reviews').update({ status }).eq('id', req.params.id);
    const { data: review } = await supabase.from('reviews').select('*').eq('id', req.params.id).maybeSingle();
    if (review) {
      const { data: approved } = await supabase.from('reviews').select('rating').eq('product_id', review.product_id).eq('status', 'approved');
      if (approved && approved.length > 0) {
        const avg = approved.reduce(function(sum, r) { return sum + r.rating; }, 0) / approved.length;
        await supabase.from('products').update({
          rating: Math.round(avg * 10) / 10,
          review_count: approved.length
        }).eq('id', review.product_id);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reviews/:id', adminMiddleware, async (req, res) => {
  try {
    const { data: review } = await supabase.from('reviews').select('*').eq('id', req.params.id).maybeSingle();
    await supabase.from('reviews').delete().eq('id', req.params.id);
    if (review) {
      const { data: approved } = await supabase.from('reviews').select('rating').eq('product_id', review.product_id).eq('status', 'approved');
      if (approved && approved.length > 0) {
        const avg = approved.reduce(function(sum, r) { return sum + r.rating; }, 0) / approved.length;
        await supabase.from('products').update({
          rating: Math.round(avg * 10) / 10,
          review_count: approved.length
        }).eq('id', review.product_id);
      } else {
        await supabase.from('products').update({ rating: 0, review_count: 0 }).eq('id', review.product_id);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== COUPONS ==========
app.get('/api/coupons', adminMiddleware, async (req, res) => {
  try {
    const { data: coupons, error } = await supabase.from('coupons').select('*').order('id', { ascending: false });
    if (error) throw error;
    res.json(coupons || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coupons', adminMiddleware, async (req, res) => {
  try {
    const { code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, expires_at } = req.body;
    if (!code || !discount_value) return res.status(400).json({ error: 'Code and discount value are required' });
    const { data, error } = await supabase.from('coupons').insert({
      code: code.toUpperCase(), description: description || '',
      discount_type: discount_type || 'percentage', discount_value,
      min_order_amount: min_order_amount || 0,
      max_discount_amount: max_discount_amount || 0,
      max_uses: max_uses || 100, expires_at: expires_at || null,
      is_active: true
    }).select();
    if (error) throw error;
    res.json(data && data[0] ? data[0] : { success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/coupons/:id', adminMiddleware, async (req, res) => {
  try {
    const { code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, is_active, expires_at } = req.body;
    const { error } = await supabase.from('coupons').update({
      code, description, discount_type, discount_value,
      min_order_amount, max_discount_amount, max_uses,
      is_active: is_active || false, expires_at
    }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/coupons/:id', adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('coupons').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coupons/validate', async (req, res) => {
  try {
    const { code, order_total } = req.body;
    if (!code) return res.status(400).json({ error: 'Coupon code is required' });
    const { data: coupon } = await supabase.from('coupons').select('*').eq('code', code.toUpperCase()).eq('is_active', true).maybeSingle();
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SUBSCRIBERS ==========
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const { data: existing } = await supabase.from('subscribers').select('id').eq('email', email).maybeSingle();
    if (existing) return res.json({ success: true, message: 'Already subscribed' });
    const { error } = await supabase.from('subscribers').insert({ email });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subscribers', adminMiddleware, async (req, res) => {
  try {
    const { data: subs, error } = await supabase.from('subscribers').select('*').order('subscribed_at', { ascending: false });
    if (error) throw error;
    res.json(subs || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/subscribers/:id', adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('subscribers').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CUSTOMERS ==========
app.get('/api/customers', adminMiddleware, async (req, res) => {
  try {
    const { data: customers, error } = await supabase.from('customers').select('*').order('total_orders', { ascending: false });
    if (error) throw error;
    res.json(customers || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/:phone/orders', async (req, res) => {
  try {
    const { data: orders, error } = await supabase.from('orders').select('*').eq('customer_phone', req.params.phone).order('id', { ascending: false });
    if (error) throw error;
    for (const order of orders || []) {
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
      order.items = items || [];
      const { data: tracking } = await supabase.from('order_tracking').select('*').eq('order_id', order.id).order('created_at');
      order.tracking = tracking || [];
    }
    res.json(orders || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SEARCH HISTORY & TRENDING ==========
app.post('/api/search-history', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { query } = req.body;
    if (!query || !query.trim()) return res.json({ success: true });
    const q = query.trim().toLowerCase();
    await supabase.from('search_history').insert({ session_id: sessionId, query: q });

    const { data: existingTS } = await supabase.from('trending_searches').select('id, count').eq('query', q).maybeSingle();
    if (existingTS) {
      await supabase.from('trending_searches').update({ count: (existingTS.count || 0) + 1, last_searched: new Date().toISOString() }).eq('id', existingTS.id);
    } else {
      await supabase.from('trending_searches').insert({ query: q, count: 1, last_searched: new Date().toISOString() });
    }

    const { data: allHistory } = await supabase.from('search_history').select('id').eq('session_id', sessionId).order('created_at', { ascending: false });
    if (allHistory && allHistory.length > 20) {
      const toDelete = allHistory.slice(20).map(function(h) { return h.id; });
      await supabase.from('search_history').delete().in('id', toDelete);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search-history', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { data: history, error } = await supabase.from('search_history').select('query').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    res.json((history || []).map(function(h) { return h.query; }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/search-history', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { query } = req.body;
    if (query) {
      await supabase.from('search_history').delete().eq('session_id', sessionId).eq('query', query);
    } else {
      await supabase.from('search_history').delete().eq('session_id', sessionId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trending-searches', async (req, res) => {
  try {
    const { data: trending, error } = await supabase.from('trending_searches').select('query, count').order('count', { ascending: false }).limit(10);
    if (error) throw error;
    res.json(trending || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/search/fuzzy', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q || q.length < 2) return res.json([]);
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, price, image, category, stock_count')
      .eq('status', 'active')
      .or('name.ilike.%' + q + '%,name.ilike.%' + q.slice(0, -1) + '%,desc.ilike.%' + q + '%,category.ilike.%' + q + '%')
      .order('sold_count', { ascending: false })
      .limit(10);
    if (error) throw error;
    res.json(products || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== FLASH SALES ==========
app.get('/api/flash-sales/active', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data: sales, error } = await supabase
      .from('flash_sales')
      .select('*')
      .eq('is_active', true)
      .lte('start_time', now)
      .gte('end_time', now)
      .order('end_time');
    if (error) throw error;
    const result = [];
    for (const sale of sales || []) {
      const { data: fsp } = await supabase.from('flash_sale_products').select('*').eq('flash_sale_id', sale.id);
      for (const fp of fsp || []) {
        const { data: product } = await supabase.from('products').select('name, price, image, stock_count').eq('id', fp.product_id).maybeSingle();
        if (product) {
          result.push({
            ...sale,
            product_id: fp.product_id,
            sale_price: fp.sale_price,
            max_quantity: fp.max_quantity,
            sold_count: fp.sold_count,
            product_name: product.name,
            original_price: product.price,
            image: product.image,
            stock_count: product.stock_count
          });
        }
      }
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/flash-sales', adminMiddleware, async (req, res) => {
  try {
    const { data: sales, error } = await supabase.from('flash_sales').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    for (const sale of sales || []) {
      const { data: products } = await supabase.from('flash_sale_products').select('*').eq('flash_sale_id', sale.id);
      const withNames = [];
      for (const fp of products || []) {
        const { data: prod } = await supabase.from('products').select('name, price, image').eq('id', fp.product_id).maybeSingle();
        withNames.push(Object.assign({}, fp, { product_name: (prod && prod.name) || '', original_price: (prod && prod.price) || '', image: (prod && prod.image) || '' }));
      }
      sale.products = withNames;
    }
    res.json(sales || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/flash-sales', adminMiddleware, async (req, res) => {
  try {
    const { title, description, start_time, end_time, discount_type, discount_value, product_ids } = req.body;
    if (!title || !start_time || !end_time) return res.status(400).json({ error: 'Title, start and end time required' });
    const { data: saleData, error } = await supabase.from('flash_sales').insert({
      title, description: description || '', start_time, end_time,
      discount_type: discount_type || 'percentage', discount_value: discount_value || 0
    }).select();
    if (error) throw error;
    const sale = saleData[0];
    if (product_ids && product_ids.length) {
      for (const pid of product_ids) {
        const { data: p } = await supabase.from('products').select('price').eq('id', pid).maybeSingle();
        if (p) {
          const origPrice = parseFloat(String(p.price).replace(/[^0-9.]/g, ''));
          let salePrice = origPrice;
          if (discount_type === 'percentage') salePrice = origPrice * (1 - discount_value / 100);
          else salePrice = Math.max(0, origPrice - discount_value);
          await supabase.from('flash_sale_products').insert({
            flash_sale_id: sale.id, product_id: pid, sale_price: 'Rs. ' + salePrice.toFixed(0)
          });
        }
      }
    }
    res.json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/flash-sales/:id', adminMiddleware, async (req, res) => {
  try {
    const { title, description, start_time, end_time, discount_type, discount_value, is_active } = req.body;
    const { error } = await supabase.from('flash_sales').update({
      title, description, start_time, end_time, discount_type, discount_value,
      is_active: is_active || false
    }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/flash-sales/:id', adminMiddleware, async (req, res) => {
  try {
    await supabase.from('flash_sale_products').delete().eq('flash_sale_id', req.params.id);
    const { error } = await supabase.from('flash_sales').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== NOTIFICATIONS ==========
app.get('/api/notifications', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { data: notifs, error } = await supabase.from('notifications').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(notifs || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { type, title, message, link } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Title and message required' });
    const { error } = await supabase.from('notifications').insert({
      session_id: sessionId, type: type || 'order', title, message, link: link || ''
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/read-all', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { error } = await supabase.from('notifications').update({ is_read: 1 }).eq('session_id', sessionId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const { error } = await supabase.from('notifications').update({ is_read: 1 }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('notifications').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SAVED ADDRESSES ==========
app.get('/api/addresses', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { data: addresses, error } = await supabase.from('saved_addresses').select('*').eq('session_id', sessionId).order('is_default', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(addresses || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/addresses', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { label, full_name, phone, address, city, state, zip_code, country, is_default } = req.body;
    if (!full_name || !phone || !address) return res.status(400).json({ error: 'Name, phone and address required' });
    if (is_default) {
      await supabase.from('saved_addresses').update({ is_default: false }).eq('session_id', sessionId);
    }
    const { error } = await supabase.from('saved_addresses').insert({
      session_id: sessionId, label: label || 'Home', full_name, phone, address,
      city: city || '', state: state || '', zip_code: zip_code || '',
      country: country || 'Nepal', is_default: is_default || false
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/addresses/:id', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { label, full_name, phone, address, city, state, zip_code, country, is_default } = req.body;
    if (is_default) {
      await supabase.from('saved_addresses').update({ is_default: false }).eq('session_id', sessionId);
    }
    const { error } = await supabase.from('saved_addresses').update({
      label, full_name, phone, address, city, state, zip_code, country, is_default: is_default || false
    }).eq('id', req.params.id).eq('session_id', sessionId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/addresses/:id', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { error } = await supabase.from('saved_addresses').delete().eq('id', req.params.id).eq('session_id', sessionId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ORDER HISTORY & REORDER ==========
app.get('/api/orders/by-phone/:phone', async (req, res) => {
  try {
    const { data: orders, error } = await supabase.from('orders').select('*').eq('customer_phone', req.params.phone).order('id', { ascending: false });
    if (error) throw error;
    for (const order of orders || []) {
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
      order.items = items || [];
      const { data: tracking } = await supabase.from('order_tracking').select('*').eq('order_id', order.id).order('created_at');
      order.tracking = tracking || [];
    }
    res.json(orders || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/reorder/:id', async (req, res) => {
  try {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', req.params.id);
    res.json({ items: items || [], order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== PRODUCT VIEWS ==========
app.post('/api/product-views', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { product_id } = req.body;
    if (!product_id) return res.json({ success: true });
    const { error } = await supabase.from('product_views').insert({ session_id: sessionId, product_id });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/recommended', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { data: viewed } = await supabase
      .from('product_views')
      .select('product_id')
      .eq('session_id', sessionId)
      .order('viewed_at', { ascending: false })
      .limit(3);
    if (!viewed || !viewed.length) {
      const { data: trending } = await supabase.from('products').select('*').eq('status', 'active').order('sold_count', { ascending: false }).limit(8);
      return res.json(trending || []);
    }
    const viewedProductIds = viewed.map(function(v) { return v.product_id; });
    const { data: viewedProducts } = await supabase.from('products').select('category').in('id', viewedProductIds).eq('status', 'active');
    const categories = [...new Set((viewedProducts || []).map(function(p) { return p.category; }).filter(Boolean))];
    const seenIds = new Set();
    const recs = [];
    for (const cat of categories) {
      const { data: catProducts } = await supabase
        .from('products')
        .select('*')
        .eq('category', cat)
        .eq('status', 'active')
        .order('rating', { ascending: false })
        .order('sold_count', { ascending: false })
        .limit(8);
      for (const p of catProducts || []) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          recs.push(p);
        }
      }
    }
    if (recs.length < 8) {
      const remaining = 8 - recs.length;
      const { data: fill } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'active')
        .order('sold_count', { ascending: false })
        .limit(remaining + 10);
      for (const p of fill || []) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          recs.push(p);
        }
        if (recs.length >= 8) break;
      }
    }
    res.json(recs.slice(0, 8));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/also-bought/:id', async (req, res) => {
  try {
    const { data: orderItems } = await supabase.from('order_items').select('order_id').eq('product_id', req.params.id);
    let alsoBought = [];
    if (orderItems && orderItems.length) {
      const orderIds = orderItems.map(function(o) { return o.order_id; });
      const { data: otherItems } = await supabase
        .from('order_items')
        .select('product_id')
        .in('order_id', orderIds)
        .neq('product_id', req.params.id);
      if (otherItems && otherItems.length) {
        const productIds = [...new Set(otherItems.map(function(i) { return i.product_id; }))];
        const { data: products } = await supabase
          .from('products')
          .select('*')
          .in('id', productIds)
          .eq('status', 'active')
          .order('sold_count', { ascending: false })
          .limit(6);
        alsoBought = products || [];
      }
    }
    if (!alsoBought.length) {
      const { data: prod } = await supabase.from('products').select('category').eq('id', req.params.id).maybeSingle();
      if (prod) {
        const { data: related } = await supabase
          .from('products')
          .select('*')
          .eq('category', prod.category)
          .neq('id', req.params.id)
          .eq('status', 'active')
          .order('sold_count', { ascending: false })
          .limit(6);
        return res.json(related || []);
      }
    }
    res.json(alsoBought);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SIZE CHART ==========
app.get('/api/size-chart/:category', async (req, res) => {
  try {
    const { data: sizes, error } = await supabase.from('size_chart').select('*').eq('category', req.params.category);
    if (error) throw error;
    res.json(sizes || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/size-chart', adminMiddleware, async (req, res) => {
  try {
    const { category, size, measurements } = req.body;
    if (!category || !size) return res.status(400).json({ error: 'Category and size required' });
    const { data: existing } = await supabase.from('size_chart').select('id').eq('category', category).eq('size', size).maybeSingle();
    if (existing) {
      await supabase.from('size_chart').update({ measurements: JSON.stringify(measurements) }).eq('id', existing.id);
    } else {
      await supabase.from('size_chart').insert({ category, size, measurements: JSON.stringify(measurements) });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/size-chart/:id', adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('size_chart').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SETTINGS ==========
app.get('/api/settings', adminMiddleware, async (req, res) => {
  try {
    const { data: setting } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    res.json(setting || { admin_password: 'admin123' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', adminMiddleware, async (req, res) => {
  try {
    const { admin_password, store_name, store_tagline, currency, free_shipping_threshold, shipping_fee, whatsapp_number, store_email, smtp_host, smtp_port, smtp_user, smtp_pass, notify_email, notify_whatsapp, whatsapp_api_token, whatsapp_phone_id } = req.body;
    if (admin_password && admin_password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const payload = {
      admin_password: admin_password || 'admin123',
      store_name: store_name || 'Aryal Store',
      store_tagline: store_tagline || '',
      currency: currency || 'Rs. ',
      free_shipping_threshold: parseFloat(free_shipping_threshold) || 2000,
      shipping_fee: parseFloat(shipping_fee) || 100,
      whatsapp_number: whatsapp_number || '',
      store_email: store_email || '',
      smtp_host: smtp_host || '',
      smtp_port: parseInt(smtp_port) || 587,
      smtp_user: smtp_user || '',
      smtp_pass: smtp_pass || '',
      notify_email: notify_email || false,
      notify_whatsapp: notify_whatsapp || false,
      whatsapp_api_token: whatsapp_api_token || '',
      whatsapp_phone_id: whatsapp_phone_id || ''
    };
    let { error } = await supabase.from('settings').update(payload).eq('id', 1);
    // If extended columns don't exist, retry with only base columns
    if (error && error.message && error.message.includes('Could not find')) {
      const base = { id: 1, admin_password: payload.admin_password, store_name: payload.store_name, store_tagline: payload.store_tagline, currency: payload.currency, free_shipping_threshold: payload.free_shipping_threshold, shipping_fee: payload.shipping_fee, whatsapp_number: payload.whatsapp_number };
      const { error: err2 } = await supabase.from('settings').update(base).eq('id', 1);
      if (err2) throw err2;
    } else if (error) {
      throw error;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ANALYTICS ==========
app.post('/api/analytics', async (req, res) => {
  try {
    const { page_url, page_title, session_id, event_type, product_id } = req.body;
    const { error } = await supabase.from('site_analytics').insert({
      page_url: page_url || '', page_title: page_title || '',
      session_id: session_id || '', event_type: event_type || 'pageview',
      product_id: product_id || 0
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/summary', adminMiddleware, async (req, res) => {
  try {
    const { count: totalViews } = await supabase.from('site_analytics').select('*', { count: 'exact', head: true });
    const todayStr = new Date().toISOString().split('T')[0];
    const { count: todayViews } = await supabase.from('site_analytics').select('*', { count: 'exact', head: true }).gte('created_at', todayStr);
    const { count: totalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true });
    const { count: todayOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayStr);

    const { data: allOrders } = await supabase.from('orders').select('total_amount, status, created_at');
    const nonCancelled = (allOrders || []).filter(function(o) { return o.status !== 'cancelled'; });
    const totalRevenue = nonCancelled.reduce(function(sum, o) {
      return sum + (parseFloat(String(o.total_amount || '0').replace(/[^0-9.]/g, '')) || 0);
    }, 0);
    const todayOrdersList = nonCancelled.filter(function(o) {
      return new Date(o.created_at).toISOString().split('T')[0] === todayStr;
    });
    const todayRevenue = todayOrdersList.reduce(function(sum, o) {
      return sum + (parseFloat(String(o.total_amount || '0').replace(/[^0-9.]/g, '')) || 0);
    }, 0);

    const { count: totalProducts } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'active');
    const { count: totalCustomers } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    const { count: totalSubscribers } = await supabase.from('subscribers').select('*', { count: 'exact', head: true });
    const { count: totalMessages } = await supabase.from('messages').select('*', { count: 'exact', head: true });

    const { data: ordersByStatusData } = await supabase.from('orders').select('status');
    const statusCounts = {};
    for (const o of ordersByStatusData || []) {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    }
    const ordersByStatus = Object.entries(statusCounts).map(function(e) { return { status: e[0], count: e[1] }; });

    const { data: topProducts } = await supabase.from('products').select('id, name, sold_count, price, rating').eq('status', 'active').order('sold_count', { ascending: false }).limit(10);

    const { data: recentOrders } = await supabase.from('orders').select('id, customer_name, total_amount, status, created_at').order('id', { ascending: false }).limit(5);

    const { data: lowStock } = await supabase.from('products').select('id, name, stock_count').eq('status', 'active').lt('stock_count', 10).order('stock_count').limit(10);
    const lowStockCount = (lowStock || []).length;

    const { data: allOrderItems } = await supabase.from('order_items').select('product_id, quantity, unit_price');
    const { data: allProducts } = await supabase.from('products').select('id, category');
    const prodCategory = {};
    if (allProducts) allProducts.forEach(function(p) { prodCategory[p.id] = p.category; });
    const catStats = {};
    for (const oi of allOrderItems || []) {
      const cat = prodCategory[oi.product_id] || 'unknown';
      if (!catStats[cat]) catStats[cat] = { total_sold: 0, revenue: 0 };
      catStats[cat].total_sold += oi.quantity || 0;
      catStats[cat].revenue += (parseFloat(String(oi.unit_price || '0').replace(/[^0-9.]/g, '')) || 0) * (oi.quantity || 0);
    }
    const salesByCategory = Object.entries(catStats).map(function(e) {
      return { category: e[0], total_sold: e[1].total_sold, revenue: e[1].revenue };
    }).sort(function(a, b) { return b.revenue - a.revenue; });

    const monthMap = {};
    for (const o of nonCancelled) {
      const d = new Date(o.created_at);
      const month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!monthMap[month]) monthMap[month] = { orders: 0, revenue: 0 };
      monthMap[month].orders++;
      monthMap[month].revenue += (parseFloat(String(o.total_amount || '0').replace(/[^0-9.]/g, '')) || 0);
    }
    const monthlySales = Object.entries(monthMap).map(function(e) {
      return { month: e[0], orders: e[1].orders, revenue: e[1].revenue };
    }).sort(function(a, b) { return b.month.localeCompare(a.month); }).slice(0, 12);

    res.json({
      totalViews: totalViews || 0,
      todayViews: todayViews || 0,
      totalOrders: totalOrders || 0,
      todayOrders: todayOrders || 0,
      totalRevenue,
      todayRevenue,
      totalProducts: totalProducts || 0,
      totalCustomers: totalCustomers || 0,
      totalSubscribers: totalSubscribers || 0,
      totalMessages: totalMessages || 0,
      ordersByStatus,
      topProducts: topProducts || [],
      recentOrders: recentOrders || [],
      lowStock: lowStock || [],
      salesByCategory,
      monthlySales,
      lowStockCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ORDER REORDER ==========
app.post('/api/orders/:id/reorder', async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabase.from('orders').select('*').eq('id', req.params.id).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', req.params.id);
    const { data: newOrderData, error: insertError } = await supabase.from('orders').insert({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email,
      customer_address: order.customer_address,
      payment_method: order.payment_method,
      notes: 'Reorder from #' + order.id,
      total_amount: order.total_amount,
      subtotal: order.subtotal,
      status: 'pending'
    }).select();
    if (insertError) throw insertError;
    const newOrder = newOrderData[0];
    for (const item of items || []) {
      await supabase.from('order_items').insert({
        order_id: newOrder.id, product_id: item.product_id,
        product_name: item.product_name, quantity: item.quantity,
        unit_price: item.unit_price, size: item.size, color: item.color
      });
    }
    await supabase.from('order_tracking').insert({ order_id: newOrder.id, status: 'pending', note: 'Reorder placed' });
    res.json({ success: true, order_id: newOrder.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== INVENTORY ==========
app.get('/api/inventory/alerts', adminMiddleware, async (req, res) => {
  try {
    const { data: allActive } = await supabase.from('products').select('*').eq('status', 'active').order('name');
    const critical = (allActive || []).filter(function(p) { return p.stock_count <= 0; });
    const low = (allActive || []).filter(function(p) { return p.stock_count > 0 && p.stock_count < 20; }).sort(function(a, b) { return a.stock_count - b.stock_count; });
    const normal = (allActive || []).filter(function(p) { return p.stock_count >= 20; });
    res.json({ critical, low, normal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id/stock', adminMiddleware, async (req, res) => {
  try {
    const { stock_count } = req.body;
    if (stock_count === undefined || stock_count < 0) return res.status(400).json({ error: 'Valid stock count required' });
    await supabase.from('products').update({ stock_count }).eq('id', req.params.id);
    if (stock_count === 0) {
      await supabase.from('products').update({ status: 'out_of_stock' }).eq('id', req.params.id);
    } else if (stock_count > 0) {
      const { data: p } = await supabase.from('products').select('status').eq('id', req.params.id).maybeSingle();
      if (p && p.status === 'out_of_stock') {
        await supabase.from('products').update({ status: 'active' }).eq('id', req.params.id);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory/bulk-update', adminMiddleware, async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !updates.length) return res.status(400).json({ error: 'No updates provided' });
    for (const u of updates) {
      await supabase.from('products').update({ stock_count: u.stock_count }).eq('id', u.product_id);
    }
    res.json({ success: true, updated: updates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== DATA MANAGEMENT ==========
app.post('/api/data/export', adminMiddleware, async (req, res) => {
  try {
    const { data: hero } = await supabase.from('hero').select('*').eq('id', 1).maybeSingle();
    const { data: about } = await supabase.from('about').select('*').eq('id', 1).maybeSingle();
    const { data: products } = await supabase.from('products').select('*').order('id');
    const { data: categories } = await supabase.from('categories').select('*').order('id');
    const { data: testimonials } = await supabase.from('testimonials').select('*').order('id');
    const { data: contact } = await supabase.from('contact').select('*').eq('id', 1).maybeSingle();
    const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    const { data: messages } = await supabase.from('messages').select('*').order('id', { ascending: false });
    const { data: orders } = await supabase.from('orders').select('*').order('id', { ascending: false });
    const { data: coupons } = await supabase.from('coupons').select('*').order('id', { ascending: false });
    const { data: customers } = await supabase.from('customers').select('*').order('id', { ascending: false });
    const { data: subscribers } = await supabase.from('subscribers').select('*').order('id', { ascending: false });

    res.json({
      hero, about, products: products || [], categories: categories || [],
      testimonials: testimonials || [], contact, settings,
      messages: messages || [], orders: orders || [],
      coupons: coupons || [], customers: customers || [],
      subscribers: subscribers || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/data/reset', adminMiddleware, async (req, res) => {
  try {
    await supabase.from('order_tracking').delete().gte('id', 0);
    await supabase.from('order_items').delete().gte('id', 0);
    await supabase.from('orders').delete().gte('id', 0);
    await supabase.from('return_requests').delete().gte('id', 0);
    await supabase.from('product_images').delete().gte('id', 0);
    await supabase.from('products').delete().gte('id', 0);
    await supabase.from('categories').delete().gte('id', 0);
    await supabase.from('testimonials').delete().gte('id', 0);
    await supabase.from('messages').delete().gte('id', 0);
    await supabase.from('wishlist').delete().gte('id', 0);
    await supabase.from('recently_viewed').delete().gte('id', 0);
    await supabase.from('reviews').delete().gte('id', 0);
    await supabase.from('coupons').delete().gte('id', 0);
    await supabase.from('customers').delete().gte('id', 0);
    await supabase.from('subscribers').delete().gte('id', 0);
    await supabase.from('site_analytics').delete().gte('id', 0);
    await supabase.from('size_chart').delete().gte('id', 0);

    await supabase.from('hero').upsert({
      id: 1, heading: 'Welcome to Aryal Store',
      subtext: 'Your one-stop destination for clothes, stationery, cosmetics, and cylinder refills at unbeatable prices.'
    }, { onConflict: 'id' });

    await supabase.from('about').upsert({
      id: 1, title: 'About Us', heading: 'Why Choose Aryal Store?',
      desc1: 'At Aryal Store, we are committed to providing our customers with top-quality products and exceptional service. Founded with a passion for excellence, we have grown to become a trusted name in the community.',
      desc2: 'We specialize in clothes, stationery, cosmetics, and LPG cylinder refills. We carefully curate every product in our collection to ensure you get nothing but the best. Your satisfaction is our top priority.',
      features: 'Quality Products, Fast Delivery, 24/7 Support, Secure Payment'
    }, { onConflict: 'id' });

    await supabase.from('contact').upsert({
      id: 1, address: 'Satyawati 06, Ullikhola Bazar, Gulmi',
      phone: '+977 9867135403 / +977 9844758909',
      email: 'info@aryalstore.com', hours: 'Sun-Sat: 6:00 AM - 7:00 PM',
      lat: '28.0340872', lng: '83.4126681'
    }, { onConflict: 'id' });

    let jsonProducts = [];
    try {
      jsonProducts = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'all-products.json'), 'utf8'));
      console.log('Loaded ' + jsonProducts.length + ' products from data/all-products.json for reset');
    } catch (e) {
      console.log('data/all-products.json not found, using only inline defaults');
    }

    const defaultProducts = [
      { name: "Men's T-Shirt", category: 'clothes', desc: 'Premium cotton t-shirts in various sizes and colors.', price: 'Rs. 899', stock_count: 100, is_featured: true, is_new: true, sizes: 'S,M,L,XL', colors: 'Black,White,Grey,Navy', material: '100% Cotton', care_instructions: 'Machine wash cold. Tumble dry low.', fit_info: 'Regular fit. Model wears size M.', brand: 'Casual Wear', sku: 'TSH-001' },
      { name: "Women's Kurti", category: 'clothes', desc: 'Trendy and comfortable kurtis for everyday wear.', price: 'Rs. 1299', stock_count: 80, is_featured: true, sizes: 'S,M,L,XL', colors: 'Red,Blue,Green,Pink', material: 'Cotton Blend', care_instructions: 'Hand wash recommended.', fit_info: 'Regular fit. Model height 5\'6" wears size M.', brand: 'Ethnic Wear', sku: 'KUR-001' },
      { name: 'Kids Wear', category: 'clothes', desc: 'Colorful and durable outfits for children of all ages.', price: 'Rs. 699', stock_count: 120, sizes: '2Y,4Y,6Y,8Y,10Y', colors: 'Multi', material: 'Cotton', care_instructions: 'Machine wash gentle.', fit_info: 'Comfortable fit for active kids.', brand: 'Kids Fashion', sku: 'KID-001' },
      { name: 'Gel Pens Set', category: 'stationery', desc: 'Pack of 12 smooth writing gel pens in assorted colors.', price: 'Rs. 199', stock_count: 200, colors: 'Assorted', material: 'Plastic, Ink', brand: 'Stationery Brands', sku: 'PEN-001' },
      { name: 'Spiral Notebooks', category: 'stationery', desc: 'High-quality A4 notebooks with 200 pages each.', price: 'Rs. 249', stock_count: 150, colors: 'Red,Blue,Green', material: 'Paper', brand: 'Office Supplies', sku: 'NBK-001' },
      { name: 'Pencil Box Set', category: 'stationery', desc: 'Complete stationery kit with pencils, eraser, sharpener & ruler.', price: 'Rs. 349', stock_count: 100, colors: 'Blue,Pink', material: 'Wood, Plastic, Metal', brand: 'School Supplies', sku: 'PEN-002' },
      { name: 'Face Cream', category: 'cosmetics', desc: 'Moisturizing face cream with vitamin E for glowing skin.', price: 'Rs. 449', stock_count: 90, is_new: true, sizes: '50ml,100ml', material: 'Natural ingredients', care_instructions: 'Apply twice daily.', fit_info: 'Suitable for all skin types.', brand: 'Beauty Brands', sku: 'CRM-001' },
      { name: 'Matte Lipstick', category: 'cosmetics', desc: 'Long-lasting matte lipstick available in 10 stunning shades.', price: 'Rs. 399', stock_count: 150, is_trending: true, colors: 'Red,Pink,Nude,Berry,Coral', material: 'Wax, Oils, Pigments', care_instructions: 'Store in cool dry place.', brand: 'Beauty Brands', sku: 'LIP-001' },
      { name: 'Perfume Spray', category: 'cosmetics', desc: 'Premium long-lasting fragrance for men and women.', price: 'Rs. 799', stock_count: 60, sizes: '30ml,50ml,100ml', material: 'Alcohol-based fragrance', care_instructions: 'Spray on pulse points.', brand: 'Luxury Scents', sku: 'PER-001' },
      { name: 'LPG Gas Cylinder (13.2kg)', category: 'cylinder', desc: 'Standard household LPG cylinder with safety seal.', price: 'Rs. 1850', stock_count: 30, is_featured: true, material: 'Steel with safety valve', care_instructions: 'Keep upright. Store in ventilated area.', brand: 'Gas Corp', sku: 'CYL-001' },
      { name: 'LPG Gas Cylinder (5kg)', category: 'cylinder', desc: 'Portable LPG cylinder ideal for small households & camping.', price: 'Rs. 950', stock_count: 25, material: 'Steel', care_instructions: 'Keep upright.', brand: 'Gas Corp', sku: 'CYL-002' },
      { name: 'Cylinder Refill Service', category: 'cylinder', desc: 'Fast and safe cylinder refill with doorstep delivery.', price: 'Rs. 1650', stock_count: 50, care_instructions: 'Schedule delivery.', brand: 'Gas Corp', sku: 'REF-001' },
      { name: 'Plastic School Shoes', category: 'kids', desc: 'Durable plastic school shoes for kids, black color. Comfortable and easy to clean.', price: 'Rs. 250', compare_price: 'Rs. 350', stock_count: 10, sizes: 'Small,Large', colors: 'Black', material: 'Plastic, Rubber', care_instructions: 'Wipe clean with damp cloth.', fit_info: 'Standard fit.', brand: 'Kids Footwear', sku: 'KSH-001', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400' },
      { name: 'Leather School Shoes', category: 'kids', desc: 'Premium leather school shoes for kids, black. Sturdy build with comfortable sole.', price: 'Rs. 550', compare_price: 'Rs. 600', stock_count: 10, sizes: 'Small,Large', colors: 'Black', material: 'Leather', care_instructions: 'Polish regularly. Keep away from water.', fit_info: 'Standard fit.', brand: 'Kids Footwear', sku: 'KSH-002', image: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400' },
      { name: 'Kids Slipper', category: 'kids', desc: 'Soft and comfortable slippers for kids, small size. Perfect for everyday wear.', price: 'Rs. 250', compare_price: 'Rs. 300', stock_count: 5, sizes: 'Small', material: 'Rubber', care_instructions: 'Wipe clean.', fit_info: 'Regular fit.', brand: 'Kids Footwear', sku: 'KSL-001', image: 'https://images.unsplash.com/photo-1603487742138-4c4aad71fef0?w=400' },
      { name: "Men's Slipper", category: 'men', desc: 'Comfortable slippers for men, large size. Lightweight and durable for daily use.', price: 'Rs. 350', compare_price: 'Rs. 370', stock_count: 10, sizes: 'Large', material: 'Rubber', care_instructions: 'Wipe clean.', fit_info: 'Regular fit.', brand: 'Men Footwear', sku: 'MSL-001', image: 'https://images.unsplash.com/photo-1603487742138-4c4aad71fef0?w=400' },
      { name: 'Small Copy', category: 'stationery', desc: 'Small sized notebook, perfect for quick notes and school work.', price: 'Rs. 50', stock_count: 100, material: 'Paper', brand: 'School Supplies', sku: 'CPY-001', image: 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=400' },
      { name: 'Copy Notebook (80 Pages)', category: 'stationery', desc: 'Standard 80-page notebook for school and office use. Ruled pages.', price: 'Rs. 80', stock_count: 20, material: 'Paper', brand: 'School Supplies', sku: 'CPY-002', image: 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=400' },
      { name: 'Copy Notebook (100 Pages)', category: 'stationery', desc: '100-page ruled notebook, ideal for extensive note-taking.', price: 'Rs. 100', stock_count: 20, material: 'Paper', brand: 'School Supplies', sku: 'CPY-003', image: 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=400' },
      { name: 'Small Drawing Copy', category: 'stationery', desc: 'Small drawing book for sketching and art practice. 20 pages.', price: 'Rs. 20', stock_count: 20, material: 'Paper', brand: 'Art Supplies', sku: 'DRW-001', image: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400' },
      { name: 'Large Drawing Copy', category: 'stationery', desc: 'Large size drawing book for artists and students. 20 pages.', price: 'Rs. 50', stock_count: 20, material: 'Paper', brand: 'Art Supplies', sku: 'DRW-002', image: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400' },
      { name: 'Ball Pen (Black)', category: 'stationery', desc: 'Smooth writing ball pen with black ink. Reliable for daily use.', price: 'Rs. 10', stock_count: 20, colors: 'Black', material: 'Plastic, Ink', brand: 'Stationery Brands', sku: 'PEN-003', image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400' },
      { name: 'Ball Pen (Blue)', category: 'stationery', desc: 'Smooth writing ball pen with blue ink. Ideal for office and school.', price: 'Rs. 10', stock_count: 20, colors: 'Blue', material: 'Plastic, Ink', brand: 'Stationery Brands', sku: 'PEN-004', image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400' },
      { name: 'Gel Pen (Blue)', category: 'stationery', desc: 'Premium gel pen with smooth blue ink flow. Comfortable grip.', price: 'Rs. 10', stock_count: 20, colors: 'Blue', material: 'Plastic, Ink, Gel', brand: 'Stationery Brands', sku: 'PEN-005', image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400' },
      { name: 'White Chart Paper (Big)', category: 'stationery', desc: 'Large white chart paper for projects and presentations.', price: 'Rs. 20', stock_count: 20, sizes: 'Big', colors: 'White', material: 'Paper', care_instructions: 'Keep flat and dry.', brand: 'Art Supplies', sku: 'CHT-001', image: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400' },
      { name: 'Colorful Chart Paper (Small)', category: 'stationery', desc: 'Assorted colorful chart paper sheets, small size. Perfect for crafts.', price: 'Rs. 5', stock_count: 20, sizes: 'Small', colors: 'Assorted', material: 'Paper', care_instructions: 'Keep flat and dry.', brand: 'Art Supplies', sku: 'CHT-002', image: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400' },
      { name: 'Graph Copy Notebook', category: 'stationery', desc: 'Graph ruled notebook for mathematics and technical drawing.', price: 'Rs. 20', stock_count: 20, sizes: 'Small', material: 'Paper', care_instructions: 'Keep dry.', brand: 'School Supplies', sku: 'GRF-001', image: 'https://images.unsplash.com/photo-1533749871417-f3ce8d3a80fc?w=400' },
      { name: 'Lipstick', category: 'cosmetics', desc: 'Long-lasting lipstick with smooth texture. Available in multiple shades.', price: 'Rs. 100', stock_count: 20, material: 'Wax, Oils, Pigments', care_instructions: 'Store in cool dry place.', brand: 'Beauty Brands', sku: 'LIP-002', image: 'https://images.unsplash.com/photo-1617897903246-719242758050?w=400' },
      { name: 'Bindi', category: 'cosmetics', desc: 'Colorful traditional bindi pack. Perfect for cultural and daily wear.', price: 'Rs. 10', stock_count: 20, colors: 'Assorted', material: 'Adhesive, Foam', care_instructions: 'Keep dry.', brand: 'Ethnic Accessories', sku: 'BIN-001', image: 'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=400' }
    ];
    for (const p of jsonProducts) {
      defaultProducts.push({
        name: p.name, category: p.category || 'clothes', desc: p.description || p.name,
        price: p.price ? 'Rs. ' + p.price : '', compare_price: p.compare_price ? 'Rs. ' + p.compare_price : '',
        stock_count: p.stock || 50, image: p.image_url || '', brand: 'Daraz Fashion',
        icon: 'fas fa-tshirt', gradient: 'linear-gradient(135deg, #e94560, #d63851)'
      });
    }
    const batchSize = 50;
    for (let i = 0; i < defaultProducts.length; i += batchSize) {
      const batch = defaultProducts.slice(i, i + batchSize).map(function(p) {
        return Object.assign({ status: 'active', sold_count: 0, is_featured: false, is_new: false, is_best_seller: false, is_trending: false, subcategory: '', images: '', video_url: '', care_instructions: p.care_instructions || '', fit_info: p.fit_info || '', icon: p.icon || 'fas fa-tshirt', gradient: p.gradient || 'linear-gradient(135deg, #e94560, #d63851)' }, p);
      });
      const { error } = await supabase.from('products').insert(batch);
      if (error) console.error('Batch insert error:', error.message);
    }

    await supabase.from('testimonials').insert([
      { name: 'Ram Kumar', label: 'Regular Customer', text: 'Amazing quality and super fast delivery! Aryal Store never disappoints. I recommend them to everyone I know.', stars: 5 },
      { name: 'Sita Pokharel', label: 'Happy Shopper', text: 'Great prices and excellent customer service. The team went above and beyond to help me with my order.', stars: 5 },
      { name: 'Anil Gurung', label: 'Verified Buyer', text: 'The products are exactly as described. High quality and affordable. My go-to store for everything I need.', stars: 5 }
    ]);

    await supabase.from('categories').upsert([
      { name: 'Clothes', slug: 'clothes', parent_id: 0, description: 'Fashion for men, women, and kids', image: '' },
      { name: 'Men', slug: 'men', parent_id: 1, description: "Men's fashion collection", image: '' },
      { name: 'Women', slug: 'women', parent_id: 1, description: "Women's fashion collection", image: '' },
      { name: 'Kids', slug: 'kids', parent_id: 1, description: 'Kids fashion collection', image: '' },
      { name: 'Accessories', slug: 'accessories', parent_id: 0, description: 'Fashion accessories', image: '' },
      { name: 'Stationery', slug: 'stationery', parent_id: 0, description: 'Office and school supplies', image: '' },
      { name: 'Cosmetics', slug: 'cosmetics', parent_id: 0, description: 'Beauty and personal care', image: '' },
      { name: 'Cylinder', slug: 'cylinder', parent_id: 0, description: 'LPG gas cylinders and refills', image: '' }
    ], { onConflict: 'slug', ignoreDuplicates: true });

    const sizeChartData = {
      clothes: { XS: { chest: '32-34', waist: '26-28', hips: '34-36' }, S: { chest: '34-36', waist: '28-30', hips: '36-38' }, M: { chest: '36-38', waist: '30-32', hips: '38-40' }, L: { chest: '38-40', waist: '32-34', hips: '40-42' }, XL: { chest: '40-42', waist: '34-36', hips: '42-44' }, XXL: { chest: '42-44', waist: '36-38', hips: '44-46' } }
    };
    for (const cat of Object.keys(sizeChartData)) {
      const sizes = sizeChartData[cat];
      for (const size of Object.keys(sizes)) {
        await supabase.from('size_chart').insert({ category: cat, size: size, measurements: JSON.stringify(sizes[size]) });
      }
    }

    await supabase.from('coupons').insert([
      { code: 'WELCOME10', description: '10% off on your first order', discount_type: 'percentage', discount_value: 10, min_order_amount: 0, max_discount_amount: 500, max_uses: 100, is_active: true },
      { code: 'SAVE20', description: 'Rs. 20 off on orders above Rs. 1000', discount_type: 'fixed', discount_value: 200, min_order_amount: 1000, max_discount_amount: 200, max_uses: 50, is_active: true },
      { code: 'FREESHIP', description: 'Free shipping on your order', discount_type: 'fixed', discount_value: 100, min_order_amount: 500, max_discount_amount: 100, max_uses: 200, is_active: true }
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== RECOMMENDATIONS ==========
app.get('/api/recommendations/:product_id', async (req, res) => {
  try {
    const { data: product } = await supabase.from('products').select('*').eq('id', req.params.product_id).maybeSingle();
    if (!product) return res.json([]);
    const { data: sameCategory } = await supabase
      .from('products')
      .select('*')
      .eq('category', product.category)
      .neq('id', req.params.product_id)
      .eq('status', 'active')
      .order('sold_count', { ascending: false })
      .limit(4);
    if (sameCategory.length >= 4) return res.json(sameCategory);
    const { data: orderItems } = await supabase.from('order_items').select('order_id').eq('product_id', req.params.product_id);
    let alsoBought = [];
    if (orderItems && orderItems.length) {
      const orderIds = orderItems.map(function(o) { return o.order_id; });
      const { data: otherItems } = await supabase.from('order_items').select('product_id').in('order_id', orderIds).neq('product_id', req.params.product_id);
      if (otherItems && otherItems.length) {
        const productIds = [...new Set(otherItems.map(function(i) { return i.product_id; }))];
        const { data: products } = await supabase.from('products').select('*').in('id', productIds).eq('status', 'active').order('sold_count', { ascending: false }).limit(4);
        alsoBought = products || [];
      }
    }
    const combined = sameCategory.concat(alsoBought.filter(function(p) { return !sameCategory.find(function(sp) { return String(sp.id) === String(p.id); }); }));
    res.json(combined.slice(0, 4));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SEED DATABASE ==========
app.post('/api/seed', adminMiddleware, async (req, res) => {
  try {
    const { importAll } = require('./import-products');
    await importAll(false);
    const { data: products } = await supabase.from('products').select('category');
    const counts = {};
    for (const p of products || []) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    const result = Object.entries(counts).map(function(e) { return { category: e[0], cnt: e[1] }; }).sort(function(a, b) { return a.category.localeCompare(b.category); });
    res.json({ success: true, products: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  initDb().then(async function() {
    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true });
    if (!count || count === 0) {
      console.log('Database empty � seeding with default products...');
      try {
        const { importAll } = require('./import-products');
        await importAll(false);
      } catch (err) {
        console.error('Auto-seed failed:', err.message);
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      app.listen(PORT, function() {
        console.log('Aryal Store backend running at http://localhost:' + PORT);
      });
    }
  }).catch(function(err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
}

module.exports = app;
