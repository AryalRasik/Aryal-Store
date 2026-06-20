const { initDb, run, queryAll } = require('./db');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, 'uploads');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const filepath = path.join(UPLOADS_DIR, filename);
    const file = fs.createWriteStream(filepath);
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(filepath, () => {});
        downloadImage(res.headers.location, filename).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve('/uploads/' + filename); });
    });
    req.on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

async function importAll(closeOnFinish = true) {
  await initDb();

  const data = await fetchJson('https://kolzsticks.github.io/Free-Ecommerce-Products-Api/main/products.json');

  // === 1. CLOTHES - Fashion & Apparel ===
  const clothesItems = data.filter(p => p.category === 'Fashion & Apparel');
  const CLOTHES_ICONS = {
    'Men\'s Clothing': 'fas fa-male',
    'Women\'s Clothing': 'fas fa-female',
    'Footwear': 'fas fa-shoe-prints',
    'Accessories': 'fas fa-gem',
  };
  const CLOTHES_GRADIENTS = [
    'linear-gradient(135deg, #2c3e50, #3498db)',
    'linear-gradient(135deg, #e74c3c, #c0392b)',
    'linear-gradient(135deg, #8e44ad, #9b59b6)',
    'linear-gradient(135deg, #16a085, #1abc9c)',
    'linear-gradient(135deg, #f39c12, #e67e22)',
    'linear-gradient(135deg, #2980b9, #6dd5fa)',
    'linear-gradient(135deg, #c0392b, #f3726d)',
    'linear-gradient(135deg, #34495e, #95a5a6)',
  ];

  console.log('\n--- Importing Clothes ---');
  for (const [i, p] of clothesItems.entries()) {
    let imageUrl = '';
    try {
      const ext = path.extname(new URL(p.image).pathname) || '.jpg';
      const filename = 'clothes_' + Date.now() + '_' + i + ext;
      imageUrl = await downloadImage(p.image, filename);
      console.log('  Downloaded:', p.name);
    } catch (e) {
      console.log('  No image for:', p.name);
    }
    const icon = CLOTHES_ICONS[p.subCategory] || 'fas fa-tshirt';
    const gradient = CLOTHES_GRADIENTS[i % CLOTHES_GRADIENTS.length];
    const priceNPR = Math.round(p.priceCents * 1.3);
    run(
      'INSERT INTO products (name, category, desc, price, icon, gradient, image) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [p.name, 'clothes', p.description, 'Rs. ' + priceNPR, icon, gradient, imageUrl]
    );
    console.log('  Imported:', p.name);
  }

  // === 2. COSMETICS - Beauty & Personal Care ===
  const cosmeticsItems = data.filter(p => p.category === 'Beauty & Personal Care');
  const COSMETICS_ICONS = {
    'Skincare': 'fas fa-spa',
    'Hair Care': 'fas fa-cut',
    'Makeup': 'fas fa-paint-brush',
    'Fragrances': 'fas fa-tint',
    'Grooming': 'fas fa-razor',
    "Men's Grooming Products": 'fas fa-razor',
    'Bath & Body': 'fas fa-bath',
    'Nail Care': 'fas fa-hand-paper',
    'Health & Wellness Products': 'fas fa-heartbeat',
  };
  const COSMETICS_GRADIENTS = [
    'linear-gradient(135deg, #e91e63, #f06292)',
    'linear-gradient(135deg, #9c27b0, #ba68c8)',
    'linear-gradient(135deg, #ff5722, #ff8a65)',
    'linear-gradient(135deg, #009688, #4db6ac)',
    'linear-gradient(135deg, #795548, #a1887f)',
    'linear-gradient(135deg, #607d8b, #90a4ae)',
    'linear-gradient(135deg, #e94560, #ff6b81)',
    'linear-gradient(135deg, #673ab7, #9575cd)',
    'linear-gradient(135deg, #3f51b5, #7986cb)',
    'linear-gradient(135deg, #ff9800, #ffb74d)',
  ];

  console.log('\n--- Importing Cosmetics ---');
  for (const [i, p] of cosmeticsItems.entries()) {
    let imageUrl = '';
    try {
      const ext = path.extname(new URL(p.image).pathname) || '.jpg';
      const filename = 'cosmetics_' + Date.now() + '_' + i + ext;
      imageUrl = await downloadImage(p.image, filename);
      console.log('  Downloaded:', p.name);
    } catch (e) {
      console.log('  No image for:', p.name);
    }
    const icon = COSMETICS_ICONS[p.subCategory] || 'fas fa-spa';
    const gradient = COSMETICS_GRADIENTS[i % COSMETICS_GRADIENTS.length];
    const priceNPR = Math.round(p.priceCents * 1.3);
    run(
      'INSERT INTO products (name, category, desc, price, icon, gradient, image) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [p.name, 'cosmetics', p.description, 'Rs. ' + priceNPR, icon, gradient, imageUrl]
    );
    console.log('  Imported:', p.name);
  }

  // === 3. STATIONERY ===
  const stationeryProducts = [
    {
      name: 'Premium Notebook Set',
      desc: 'Pack of 3 high-quality A5 notebooks with lined pages and durable hardcover binding.',
      price: 450,
      icon: 'fas fa-book',
      image: 'https://images.pexels.com/photos/303532/pexels-photo-303532.jpeg'
    },
    {
      name: 'Colored Pencil Set - 24 Colors',
      desc: 'Vibrant colored pencils perfect for art, school projects, and creative activities.',
      price: 350,
      icon: 'fas fa-pencil-alt',
      image: 'https://images.pexels.com/photos/6952426/pexels-photo-6952426.jpeg'
    },
    {
      name: 'Complete Stationery Kit',
      desc: 'All-in-one stationery set with pens, pencils, eraser, sharpener, ruler, and sticky notes.',
      price: 550,
      icon: 'fas fa-pencil-ruler',
      image: 'https://images.pexels.com/photos/6193084/pexels-photo-6193084.jpeg'
    },
    {
      name: 'Art Marker Pens - 12 Pack',
      desc: 'Dual-tip art markers with fine and brush tips, ideal for drawing, lettering, and coloring.',
      price: 650,
      icon: 'fas fa-pen-fancy',
      image: 'https://images.pexels.com/photos/7054789/pexels-photo-7054789.jpeg'
    },
    {
      name: 'Desk Organizer Set',
      desc: 'Keep your study space tidy with this multi-compartment desk organizer for pens, clips, and notes.',
      price: 290,
      icon: 'fas fa-boxes',
      image: ''
    },
  ];

  const STATIONERY_GRADIENTS = [
    'linear-gradient(135deg, #1a5276, #2e86c1)',
    'linear-gradient(135deg, #7d3c98, #a569bd)',
    'linear-gradient(135deg, #1abc9c, #16a085)',
    'linear-gradient(135deg, #f39c12, #d35400)',
    'linear-gradient(135deg, #e74c3c, #e94560)',
  ];

  console.log('\n--- Importing Stationery ---');
  for (const [i, p] of stationeryProducts.entries()) {
    let imageUrl = '';
    if (p.image) {
      try {
        const filename = 'stationery_' + Date.now() + '_' + i + '.jpg';
        imageUrl = await downloadImage(p.image, filename);
        console.log('  Downloaded:', p.name);
      } catch (e) {
        console.log('  No image for:', p.name);
      }
    }
    run(
      'INSERT INTO products (name, category, desc, price, icon, gradient, image) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [p.name, 'stationery', p.desc, 'Rs. ' + p.price, p.icon, STATIONERY_GRADIENTS[i], imageUrl]
    );
    console.log('  Imported:', p.name);
  }

  // === 3. CYLINDER - Add missing LPG 5kg ===
  console.log('\n--- Fixing Cylinder ---');
  const existingCylinder = queryAll("SELECT id, name FROM products WHERE category = 'cylinder'");
  const cylinderNames = existingCylinder.map(c => c.name);

  if (!cylinderNames.includes('LPG Gas Cylinder (5kg)')) {
    run(
      "INSERT INTO products (name, category, desc, price, icon, gradient, image) VALUES (?, 'cylinder', ?, ?, ?, ?, '')",
      ['LPG Gas Cylinder (5kg)', 'Portable LPG cylinder ideal for small households and camping.', 'Rs. 950', 'fas fa-burn', 'linear-gradient(135deg, #d35400, #e67e22)']
    );
    console.log('  Added missing: LPG Gas Cylinder (5kg)');
  }

  if (!cylinderNames.includes('LPG Gas Stove (Single Burner)')) {
    run(
      "INSERT INTO products (name, category, desc, price, icon, gradient, image) VALUES (?, 'cylinder', ?, ?, ?, ?, '')",
      ['LPG Gas Stove (Single Burner)', 'Portable single burner gas stove, perfect for camping and backup cooking.', 'Rs. 1200', 'fas fa-fire', 'linear-gradient(135deg, #e74c3c, #c0392b)']
    );
    console.log('  Added: LPG Gas Stove (Single Burner)');
  }

  if (!cylinderNames.includes('Gas Stove Regulator')) {
    run(
      "INSERT INTO products (name, category, desc, price, icon, gradient, image) VALUES (?, 'cylinder', ?, ?, ?, ?, '')",
      ['Gas Stove Regulator', 'High-quality gas regulator with safety valve for secure LPG connections.', 'Rs. 450', 'fas fa-exchange-alt', 'linear-gradient(135deg, #a04000, #d35400)']
    );
    console.log('  Added: Gas Stove Regulator');
  }

  console.log('\n=== IMPORT COMPLETE ===');
  const all = queryAll('SELECT category, COUNT(*) as cnt FROM products GROUP BY category ORDER BY category');
  console.log('Products by category:');
  all.forEach(r => console.log(`  ${r.category}: ${r.cnt}`));
  if (closeOnFinish) process.exit(0);
}

module.exports = { importAll };

if (require.main === module) {
  importAll().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}
