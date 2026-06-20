const https = require('https');

const API = 'https://aryal-store-backend-1.onrender.com';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'aryal-store-backend-1.onrender.com',
      path: path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(body); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Logging in...');
  const login = await req('POST', '/api/login', { password: 'admin123' });
  const token = login.token;
  if (!token) { console.error('Login failed:', login); return; }
  console.log('Token obtained');

  console.log('Fetching API data...');
  const apiData = await fetchJson('https://kolzsticks.github.io/Free-Ecommerce-Products-Api/main/products.json');

  const clothesItems = apiData.filter(p => p.category === 'Fashion & Apparel');
  const cosmeticsItems = apiData.filter(p => p.category === 'Beauty & Personal Care');

  const styleGradients = [
    'linear-gradient(135deg, #2c3e50, #3498db)', 'linear-gradient(135deg, #e74c3c, #c0392b)',
    'linear-gradient(135deg, #8e44ad, #9b59b6)', 'linear-gradient(135deg, #16a085, #1abc9c)',
    'linear-gradient(135deg, #f39c12, #e67e22)', 'linear-gradient(135deg, #2980b9, #6dd5fa)',
    'linear-gradient(135deg, #c0392b, #f3726d)', 'linear-gradient(135deg, #34495e, #95a5a6)',
  ];
  const styleIcons = { "Men's Clothing": 'fas fa-male', "Women's Clothing": 'fas fa-female', 'Footwear': 'fas fa-shoe-prints', 'Accessories': 'fas fa-gem' };

  const cosGradients = [
    'linear-gradient(135deg, #e91e63, #f06292)', 'linear-gradient(135deg, #9c27b0, #ba68c8)',
    'linear-gradient(135deg, #ff5722, #ff8a65)', 'linear-gradient(135deg, #009688, #4db6ac)',
    'linear-gradient(135deg, #795548, #a1887f)', 'linear-gradient(135deg, #607d8b, #90a4ae)',
    'linear-gradient(135deg, #e94560, #ff6b81)', 'linear-gradient(135deg, #673ab7, #9575cd)',
    'linear-gradient(135deg, #3f51b5, #7986cb)', 'linear-gradient(135deg, #ff9800, #ffb74d)',
  ];
  const cosIcons = {
    Skincare: 'fas fa-spa', 'Hair Care': 'fas fa-cut', Makeup: 'fas fa-paint-brush',
    Fragrances: 'fas fa-tint', Grooming: 'fas fa-razor', "Men's Grooming Products": 'fas fa-razor',
    'Bath & Body': 'fas fa-bath', 'Nail Care': 'fas fa-hand-paper', 'Health & Wellness Products': 'fas fa-heartbeat',
  };

  const statItems = [
    { n: 'Premium Notebook Set', d: 'Pack of 3 high-quality A5 notebooks with lined pages and durable hardcover binding.', p: 450, i: 'fas fa-book', g: 'linear-gradient(135deg, #1a5276, #2e86c1)' },
    { n: 'Colored Pencil Set - 24 Colors', d: 'Vibrant colored pencils perfect for art, school projects, and creative activities.', p: 350, i: 'fas fa-pencil-alt', g: 'linear-gradient(135deg, #7d3c98, #a569bd)' },
    { n: 'Complete Stationery Kit', d: 'All-in-one stationery set with pens, pencils, eraser, sharpener, ruler, and sticky notes.', p: 550, i: 'fas fa-pencil-ruler', g: 'linear-gradient(135deg, #1abc9c, #16a085)' },
    { n: 'Art Marker Pens - 12 Pack', d: 'Dual-tip art markers with fine and brush tips, ideal for drawing, lettering, and coloring.', p: 650, i: 'fas fa-pen-fancy', g: 'linear-gradient(135deg, #f39c12, #d35400)' },
    { n: 'Desk Organizer Set', d: 'Keep your study space tidy with this multi-compartment desk organizer for pens, clips, and notes.', p: 290, i: 'fas fa-boxes', g: 'linear-gradient(135deg, #e74c3c, #e94560)' },
  ];
  const cylItems = [
    { n: 'LPG Gas Cylinder (5kg)', d: 'Portable LPG cylinder ideal for small households and camping.', p: 950, i: 'fas fa-burn', g: 'linear-gradient(135deg, #d35400, #e67e22)' },
    { n: 'LPG Gas Stove (Single Burner)', d: 'Portable single burner gas stove, perfect for camping and backup cooking.', p: 1200, i: 'fas fa-fire', g: 'linear-gradient(135deg, #e74c3c, #c0392b)' },
    { n: 'Gas Stove Regulator', d: 'High-quality gas regulator with safety valve for secure LPG connections.', p: 450, i: 'fas fa-exchange-alt', g: 'linear-gradient(135deg, #a04000, #d35400)' },
  ];

  async function create(body) {
    const r = await req('POST', '/api/products', body, token);
    if (r.error) console.log('  Error:', r.error, 'for', body.name);
    else console.log('  OK:', body.name);
  }

  console.log('\n--- Clothes ---');
  for (const [i, p] of clothesItems.entries()) {
    const priceNPR = Math.round(p.priceCents * 1.3);
    await create({
      name: p.name, category: 'clothes', subcategory: p.subCategory,
      desc: p.description, price: 'Rs. ' + priceNPR,
      compare_price: 'Rs. ' + Math.round(priceNPR * 1.2),
      icon: styleIcons[p.subCategory] || 'fas fa-tshirt',
      gradient: styleGradients[i % styleGradients.length],
      image: p.image, stock_count: 100, sold_count: p.rating?.count || 0,
      rating: p.rating?.stars || 0, review_count: p.rating?.count || 0,
      is_featured: 1, is_new: 1, is_best_seller: 1, is_trending: 1, brand: 'Aryal'
    });
  }

  console.log('\n--- Cosmetics ---');
  for (const [i, p] of cosmeticsItems.entries()) {
    const priceNPR = Math.round(p.priceCents * 1.3);
    await create({
      name: p.name, category: 'cosmetics', subcategory: p.subCategory,
      desc: p.description, price: 'Rs. ' + priceNPR,
      compare_price: 'Rs. ' + Math.round(priceNPR * 1.2),
      icon: cosIcons[p.subCategory] || 'fas fa-spa',
      gradient: cosGradients[i % cosGradients.length],
      image: p.image, stock_count: 100, sold_count: p.rating?.count || 0,
      rating: p.rating?.stars || 0, review_count: p.rating?.count || 0,
      is_featured: 1, is_new: 1, is_best_seller: 1, is_trending: 1, brand: 'Aryal'
    });
  }

  console.log('\n--- Stationery ---');
  for (const s of statItems) {
    await create({ name: s.n, category: 'stationery', desc: s.d, price: 'Rs. ' + s.p, icon: s.i, gradient: s.g, stock_count: 50, is_featured: 1, is_new: 1 });
  }

  console.log('\n--- Cylinders ---');
  for (const c of cylItems) {
    await create({ name: c.n, category: 'cylinder', desc: c.d, price: 'Rs. ' + c.p, icon: c.i, gradient: c.g, stock_count: 30, is_featured: 1 });
  }

  console.log('\n=== DONE ===');
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
