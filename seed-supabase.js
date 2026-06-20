const { createClient } = require('@supabase/supabase-js');
const sup = createClient('https://srlejludttajosnrfkca.supabase.co', 'sb_publishable_AHMbtLciU-EznD3ASu0YSQ_sv2PhRoZ');

const products = [
  // --- CLOTHES (8) ---
  { name: 'Classic Cotton Kurta', description: 'Premium cotton kurta for men, comfortable and breathable fabric perfect for daily wear.', price: 1500, image_url: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400', category: 'clothes', stock: 50 },
  { name: 'Nepali Handloom Dhaka Topi', description: 'Traditional Nepali Dhaka topi, handwoven with authentic Nepali patterns.', price: 500, image_url: 'https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?w=400', category: 'clothes', stock: 100 },
  { name: 'Women\'s Pashmina Shawl', description: 'Luxurious pashmina shawl, soft and warm. Handcrafted in Nepal.', price: 3500, image_url: 'https://images.unsplash.com/photo-1601924994987-69e26d50fdc2?w=400', category: 'clothes', stock: 30 },
  { name: 'Cotton T-Shirt (Round Neck)', description: '100% organic cotton round neck t-shirt available in multiple colors.', price: 800, image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400', category: 'clothes', stock: 80 },
  { name: 'Men\'s Formal Shirt', description: 'Slim fit formal shirt, wrinkle-resistant fabric perfect for office wear.', price: 1800, image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400', category: 'clothes', stock: 40 },
  { name: 'Traditional Gunyo Cholo Set', description: 'Beautiful Nepali traditional gunyo cholo set for women, intricate embroidery.', price: 4500, image_url: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400', category: 'clothes', stock: 15 },
  { name: 'Denim Jacket', description: 'Classic blue denim jacket, unisex style with button closure.', price: 2800, image_url: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=400', category: 'clothes', stock: 25 },
  { name: 'Knit Sweater (V-Neck)', description: 'Warm knitted sweater with V-neck design, available in grey and navy.', price: 2200, image_url: 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400', category: 'clothes', stock: 35 },

  // --- COSMETICS (8) ---
  { name: 'Herbal Face Cream', description: 'Natural herbal face cream with aloe vera and vitamin E for glowing skin.', price: 650, image_url: 'https://images.unsplash.com/photo-1570194065650-d99fb4b38c34?w=400', category: 'cosmetics', stock: 60 },
  { name: 'Vitamin C Serum', description: 'Brightening vitamin C serum with hyaluronic acid for youthful skin.', price: 950, image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400', category: 'cosmetics', stock: 45 },
  { name: 'Natural Lip Balm Set', description: 'Set of 6 natural lip balms, mango and strawberry flavors.', price: 350, image_url: 'https://images.unsplash.com/photo-1617897903246-719242758050?w=400', category: 'cosmetics', stock: 90 },
  { name: 'Aloe Vera Gel', description: 'Pure aloe vera gel for sunburn relief and skin moisturizing.', price: 450, image_url: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400', category: 'cosmetics', stock: 70 },
  { name: 'Organic Shampoo', description: 'Sulfate-free organic shampoo with coconut and argan oil.', price: 750, image_url: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=400', category: 'cosmetics', stock: 55 },
  { name: 'Body Lotion (Cocoa Butter)', description: 'Rich cocoa butter body lotion for deep moisturization.', price: 550, image_url: 'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=400', category: 'cosmetics', stock: 65 },
  { name: 'Face Wash (Charcoal)', description: 'Activated charcoal face wash for deep pore cleansing.', price: 380, image_url: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400', category: 'cosmetics', stock: 75 },
  { name: 'Perfume (Jasmine)', description: 'Long-lasting jasmine perfume, floral and elegant fragrance.', price: 1200, image_url: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=400', category: 'cosmetics', stock: 40 },

  // --- STATIONERY (6) ---
  { name: 'Premium Notebook (A5)', description: 'Hardcover A5 notebook with 200 pages, ruled and dotted available.', price: 350, image_url: 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=400', category: 'stationery', stock: 120 },
  { name: 'Art Sketchbook', description: 'Spiral-bound sketchbook, 100 pages of acid-free paper for artists.', price: 450, image_url: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400', category: 'stationery', stock: 80 },
  { name: 'Gel Pen Set (12 Colors)', description: 'Smooth gel pen set with 12 vibrant colors, perfect for journaling.', price: 250, image_url: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400', category: 'stationery', stock: 150 },
  { name: 'Desk Organizer', description: 'Wooden desk organizer with compartments for pens and accessories.', price: 850, image_url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400', category: 'stationery', stock: 30 },
  { name: 'Academic Diary 2026', description: 'Yearly academic diary with month and week views, premium binding.', price: 550, image_url: 'https://images.unsplash.com/photo-1533749871417-f3ce8d3a80fc?w=400', category: 'stationery', stock: 60 },
  { name: 'Watercolor Paint Set', description: '24-color watercolor paint set with brush, ideal for beginners.', price: 650, image_url: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=400', category: 'stationery', stock: 40 },

  // --- CYLINDER/GAS (6) ---
  { name: 'LPG Gas Cylinder (14.2kg)', description: 'Standard household LPG cylinder, 14.2kg net weight with safety valve.', price: 2200, image_url: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=400', category: 'cylinder', stock: 25 },
  { name: 'LPG Gas Cylinder (5kg)', description: 'Compact LPG cylinder, ideal for small families and camping.', price: 1200, image_url: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=400', category: 'cylinder', stock: 40 },
  { name: 'Gas Stove (Single Burner)', description: 'Portable single burner gas stove with auto-ignition.', price: 1500, image_url: 'https://images.unsplash.com/photo-1583752028088-91e4e4e6b3ed?w=400', category: 'cylinder', stock: 35 },
  { name: 'Gas Stove (Double Burner)', description: 'Double burner gas stove with glass top and safety lock.', price: 3500, image_url: 'https://images.unsplash.com/photo-1583752028088-91e4e4e6b3ed?w=400', category: 'cylinder', stock: 20 },
  { name: 'Gas Regulator', description: 'ISI certified LPG gas regulator with safety shut-off.', price: 450, image_url: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=400', category: 'cylinder', stock: 60 },
  { name: 'Gas Pipe (1.5m)', description: 'Flexible LPG gas pipe with brass fittings, 1.5 meter length.', price: 250, image_url: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=400', category: 'cylinder', stock: 80 }
];

async function importProducts() {
  let success = 0;
  let fail = 0;
  for (const p of products) {
    const { error } = await sup.from('products').insert({
      name: p.name,
      description: p.description,
      price: p.price,
      image_url: p.image_url,
      category: p.category,
      stock: p.stock
    });
    if (error) { console.log('FAIL:', p.name, error.message); fail++; }
    else { console.log('OK:', p.name); success++; }
  }
  console.log(`\nDone. ${success} imported, ${fail} failed.`);
}

importProducts();
