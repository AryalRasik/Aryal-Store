const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const sup = createClient('https://srlejludttajosnrfkca.supabase.co', 'sb_publishable_AHMbtLciU-EznD3ASu0YSQ_sv2PhRoZ');

const existingProducts = [
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
  { name: 'Gas Pipe (1.5m)', description: 'Flexible LPG gas pipe with brass fittings, 1.5 meter length.', price: 250, image_url: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=400', category: 'cylinder', stock: 80 },

  // --- CSV: KIDS (3) ---
  { name: 'Plastic School Shoes', description: 'Durable plastic school shoes for kids, black color.', price: 250, compare_price: 350, image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400', category: 'kids', stock: 10 },
  { name: 'Leather School Shoes', description: 'Premium leather school shoes for kids, black.', price: 550, compare_price: 600, image_url: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400', category: 'kids', stock: 10 },
  { name: 'Kids Slipper', description: 'Soft and comfortable slippers for kids, small size.', price: 250, compare_price: 300, image_url: 'https://images.unsplash.com/photo-1603487742138-4c4aad71fef0?w=400', category: 'kids', stock: 5 },

  // --- CSV: MEN (1) ---
  { name: "Men's Slipper", description: "Comfortable slippers for men, large size.", price: 350, compare_price: 370, image_url: 'https://images.unsplash.com/photo-1603487742138-4c4aad71fef0?w=400', category: 'men', stock: 10 },

  // --- CSV: STATIONERY (11) ---
  { name: 'Small Copy', description: 'Small sized notebook, perfect for quick notes and school work.', price: 50, image_url: 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=400', category: 'stationery', stock: 100 },
  { name: 'Copy Notebook (80 Pages)', description: 'Standard 80-page notebook for school and office use.', price: 80, image_url: 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=400', category: 'stationery', stock: 20 },
  { name: 'Copy Notebook (100 Pages)', description: '100-page ruled notebook, ideal for extensive note-taking.', price: 100, image_url: 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=400', category: 'stationery', stock: 20 },
  { name: 'Small Drawing Copy', description: 'Small drawing book for sketching and art practice. 20 pages.', price: 20, image_url: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400', category: 'stationery', stock: 20 },
  { name: 'Large Drawing Copy', description: 'Large size drawing book for artists and students. 20 pages.', price: 50, image_url: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400', category: 'stationery', stock: 20 },
  { name: 'Ball Pen (Black)', description: 'Smooth writing ball pen with black ink.', price: 10, image_url: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400', category: 'stationery', stock: 20 },
  { name: 'Ball Pen (Blue)', description: 'Smooth writing ball pen with blue ink.', price: 10, image_url: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400', category: 'stationery', stock: 20 },
  { name: 'Gel Pen (Blue)', description: 'Premium gel pen with smooth blue ink flow.', price: 10, image_url: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400', category: 'stationery', stock: 20 },
  { name: 'White Chart Paper (Big)', description: 'Large white chart paper for projects and presentations.', price: 20, image_url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400', category: 'stationery', stock: 20 },
  { name: 'Colorful Chart Paper (Small)', description: 'Assorted colorful chart paper sheets, small size.', price: 5, image_url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400', category: 'stationery', stock: 20 },
  { name: 'Graph Copy Notebook', description: 'Graph ruled notebook for mathematics and technical drawing.', price: 20, image_url: 'https://images.unsplash.com/photo-1533749871417-f3ce8d3a80fc?w=400', category: 'stationery', stock: 20 },

  // --- CSV: COSMETICS (2) ---
  { name: 'Lipstick', description: 'Long-lasting lipstick with smooth texture. Available in multiple shades.', price: 100, image_url: 'https://images.unsplash.com/photo-1617897903246-719242758050?w=400', category: 'cosmetics', stock: 20 },
  { name: 'Bindi', description: 'Colorful traditional bindi pack. Perfect for cultural and daily wear.', price: 10, image_url: 'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=400', category: 'cosmetics', stock: 20 },

  // --- DARAZ CLOTHES (40) ---
  { name: 'Dollar Bigboss Sleevless Derby Cotton Gym Vest For Men', description: 'Premium cotton gym vest for men, sleeveless derby design perfect for workouts.', price: 281, compare_price: 351, image_url: 'https://img.drz.lazcdn.com/static/np/p/8669017fb7d491778d5f1d401f872be0.jpg_400x400q75.avif', category: 'clothes', stock: 50 },
  { name: "Men's Waterproof Bike/Scooter Solid Rain Coat with Jacket and Pants", description: "Waterproof rain coat set with jacket and pants for men.", price: 876, compare_price: 1390, image_url: 'https://img.drz.lazcdn.com/static/np/p/4bef45eaeccff08e9b0a150ae6dd0871.jpg_400x400q75.avif', category: 'clothes', stock: 50 },
  { name: 'T-Shirt For Women Summer Mixed Cotton Sleeveless Casual Style', description: 'Mixed cotton sleeveless casual t-shirt for women.', price: 247, compare_price: 1300, image_url: 'https://img.drz.lazcdn.com/collect/sg/p/b5213ca51b37ca48c570dfd5c4c945ad.png_400x400q75.avif', category: 'clothes', stock: 50 },
  { name: 'Super Comfortable Running Gym Shorts For Men', description: 'Lightweight and breathable gym shorts for men.', price: 641, compare_price: 1781, image_url: 'https://img.drz.lazcdn.com/collect/sg/p/125e60e10ca9311b61511ecfa295f8cc.png_400x400q75.avif', category: 'clothes', stock: 50 },
  { name: "Men's Summer Stretchable Lightweight Loose Fit Trouser", description: 'Comfortable stretchable lightweight trousers for men.', price: 598, compare_price: 997, image_url: 'https://img.drz.lazcdn.com/g/kf/Sf1f11c4e6d0d466da7c89b621f76c0c3F.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: "Men's Half Sleeve Shirt & Shorts Suits", description: 'Stylish half sleeve shirt and shorts suit set for men.', price: 1104, compare_price: 2509, image_url: 'https://img.drz.lazcdn.com/g/kf/Sc3f9255aad034cdd93745769c2c540b2n.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: "Men's Summer Stylish Ice Silk Fabric Polo T-shirt", description: 'Ice silk fabric polo t-shirt for men.', price: 699, compare_price: 1092, image_url: 'https://img.drz.lazcdn.com/g/kf/S3187dc3648a749cab2c034ddf923808dB.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Palazo Sarwal Crape Size Free', description: 'Comfortable palazo sarwal in crape fabric.', price: 299, compare_price: 498, image_url: 'https://img.drz.lazcdn.com/g/kf/S1c35c4ec94604554acda0039d62ae036b.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: '3 in 1 Combo Waterproof Rain Coat, Shoes Cover & Mobile Pouch', description: 'Complete rain protection set for outdoor activities.', price: 345, compare_price: 605, image_url: 'https://img.drz.lazcdn.com/static/np/p/5d107a6b5291c713fcb1f2ecdd40db98.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'Cotton Denim Slim Fit Half Sleeves Casual Jacket For Men', description: 'Fashion half denim jacket for men, slim fit.', price: 1715, compare_price: 3500, image_url: 'https://img.drz.lazcdn.com/static/np/p/0f4d75026d2a668bd02cdfb4b95b1c0f.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: "Men's Summer Bomber Windproof Jacket", description: 'Lightweight windproof bomber jacket for men.', price: 770, compare_price: 1305, image_url: 'https://img.drz.lazcdn.com/g/kf/Scd5898e0fc444e9bbd0226de60560c068.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: "New Men's Cotton Soft Sleeveless Workout Hoodie", description: 'Cotton sleeveless workout hoodie for men.', price: 396, compare_price: 747, image_url: 'https://img.drz.lazcdn.com/g/kf/S6a10f147661649a9bc1985525fdf269ak.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'Maria Top For Women All-Season Rib Spandex Off Shoulder', description: 'Off shoulder full sleeve casual top for women.', price: 650, compare_price: 2031, image_url: 'https://img.drz.lazcdn.com/static/np/p/47604519720438924d56b5c62a23420e.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Sporty Swimming Trunk For Men Black/Blue', description: 'Fashion swimming trunks for men.', price: 309, compare_price: 483, image_url: 'https://img.drz.lazcdn.com/static/np/p/aba470dd1093068311e1a64146d72571.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'Black And Wash Ice Color Light Blue Loose Fit Jeans For Men', description: 'Fashionable loose fit baggy jeans for men.', price: 1499, compare_price: 1897, image_url: 'https://img.drz.lazcdn.com/g/kf/Sfc223374bcaa4d23bfeb9906034393d9I.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Black/Red Elastic Sporty Swimming Trunk For Men', description: 'Elastic sporty swimming trunks for men.', price: 299, compare_price: 399, image_url: 'https://img.drz.lazcdn.com/static/np/p/335f949742869370fbdea34a83dd223d.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: "Ladies Stretchable Light Jacket Windcheater For Women", description: 'Light windcheater jacket for women.', price: 449, compare_price: 1247, image_url: 'https://img.drz.lazcdn.com/g/kf/S290997ec9fe04200961dd02ab800bb56V.png_720x720q80.png_.webp', category: 'clothes', stock: 50 },
  { name: "Men's Premium Gym Tank Top", description: 'Stretchable quick-dry sports tank top for men.', price: 459, compare_price: 2550, image_url: 'https://img.drz.lazcdn.com/static/np/p/8829a4de0eceef58d19436160969a498.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'Summer Oversized Printed T-shirt For Women', description: 'Trendy oversized printed t-shirt for women.', price: 458, compare_price: 996, image_url: 'https://img.drz.lazcdn.com/g/kf/Scd238b42a48944869901c0c5964d4ac7i.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: "Sky Blue Baggy Pants For Men", description: 'Comfortable baggy pants for men in sky blue.', price: 1209, compare_price: 2198, image_url: 'https://img.drz.lazcdn.com/static/np/p/8ae6f3bc00d76fd6378d3c6b7a56bc93.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'Shirt For Men Summer Cotton Style Casual', description: 'Summer cotton casual shirt for men.', price: 720, compare_price: 1895, image_url: 'https://img.drz.lazcdn.com/static/np/p/21b1341587bfb73828359358c17333bd.png_720x720q80.png_.webp', category: 'clothes', stock: 50 },
  { name: "Men's Summer Windcheater Jacket", description: 'Lightweight windproof outdoor jacket for men.', price: 586, compare_price: 2021, image_url: 'https://img.drz.lazcdn.com/static/np/p/a133c418b8cedae53698913911fe5c09.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Embroidered Semi Stitched Lehenga Choli For Women', description: 'Beautiful embroidered semi-stitched lehenga choli.', price: 1624, compare_price: 3530, image_url: 'https://img.drz.lazcdn.com/static/np/p/51af5e022ec5275a0169abd3c2e697e3.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'Suit For Women All-Season Viscose Rayon Straight Casual', description: 'Viscose rayon straight casual ethnic suit for women.', price: 1872, compare_price: 4800, image_url: 'https://img.drz.lazcdn.com/g/kf/S517edbdd0953471a8b1be17fcca0b1aaD.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'Nyptra Black Solid Premium Denim Jacket For Women', description: 'Premium black denim jacket for women.', price: 1272, compare_price: 3634, image_url: 'https://img.drz.lazcdn.com/static/np/p/6d01af2c007b7fa25f3c8f1ddd72cc93.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: "Men's Quick Dry Swimming Shorts", description: 'Quick dry swimming shorts for men.', price: 599, compare_price: 856, image_url: 'https://img.drz.lazcdn.com/static/np/p/dc9e6eade339c5ca5bc64919911239c1.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'Bamboo Knot Dragon Pattern Summer Vest Sleeveless', description: 'Ice silk tank top with bamboo knot dragon pattern for men.', price: 1330, compare_price: 2558, image_url: 'https://img.drz.lazcdn.com/static/lk/p/52555df6eb23f11234546c136dfa9359.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Dollar Big Boss Men Cotton Sando Vest', description: 'Cotton sando vest for men.', price: 352, compare_price: 424, image_url: 'https://img.drz.lazcdn.com/static/np/p/79f7372538ede138589c32542b474a42.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'Black/Blue Fashionice Print Swimming Trunk For Men', description: 'Fashionice print swimming trunk for men.', price: 585, compare_price: 616, image_url: 'https://img.drz.lazcdn.com/static/np/p/8615c71fc663328b30e999ece3396d2b.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Off Shoulder Full Sleeve Long Dress For Women', description: 'Off shoulder full sleeve long dress for women.', price: 903, compare_price: 3010, image_url: 'https://img.drz.lazcdn.com/static/np/p/c148f6efbb17e02a14a003b5450af5c7.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'Classic Fit Summer Jacket, Tshirt And Jogger Set', description: 'Complete summer outfit set for men.', price: 1242, compare_price: 2300, image_url: 'https://img.drz.lazcdn.com/static/np/p/7b43b215a6ff0293cc422d17a593038a.jpg_720x720q80.jpg', category: 'clothes', stock: 50 },
  { name: 'White Gagan Cotton Sando For Men - Pack Of 5', description: 'Pack of 5 white cotton sando vests for men.', price: 649, image_url: 'https://img.drz.lazcdn.com/static/np/p/6d26a601a98bb77ac903567fe84b9e76.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Wraon Light Grey Stretchable Premium Straight Fit Jeans', description: 'Premium straight fit jeans for men in light grey.', price: 1641, compare_price: 2984, image_url: 'https://img.drz.lazcdn.com/static/np/p/3247bfae9b84d264c454e6a23be5f08a.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Winter Sleeveless Half Jacket For Men With Holofill', description: 'Warm sleeveless half jacket for men.', price: 649, compare_price: 1202, image_url: 'https://laz-img-sg.alicdn.com/p/6b93bf4e8617b321a85af894df06b83c.png', category: 'clothes', stock: 50 },
  { name: 'Summer Straight Carpenter Denim Half', description: 'Carpenter style denim half pants for summer.', price: 1125, compare_price: 1355, image_url: 'https://img.drz.lazcdn.com/g/kf/Sdfaa3c9a4605413eb6c5d8014cbb93eav.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Synthetic Leather Jacket For Men and Women', description: 'Stylish synthetic leather jacket.', price: 1800, image_url: 'https://img.drz.lazcdn.com/g/kf/S4a2385f15386412c9297e73dc46571afw.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Grunge Asymmetrical Rib Top For Women', description: 'Trendy grunge asymmetrical rib top for women.', price: 725, compare_price: 1510, image_url: 'https://laz-img-sg.alicdn.com/p/686cf56bea1e249bc5bbfa25f86441db.png', category: 'clothes', stock: 50 },
  { name: 'Korean Chic Letter Print Tank Top', description: 'Korean style letter print padded tank top for women.', price: 391, compare_price: 698, image_url: 'https://img.drz.lazcdn.com/static/np/p/7d5db065aa6860c92b91c1bf93ea1eae.jpg_720x720q80.jpg_.webp', category: 'clothes', stock: 50 },
  { name: 'Men Cotton Hoodies Sleeveless Muscle Gym Vest', description: 'Sleeveless muscle gym vest hoodie for men.', price: 380, compare_price: 704, image_url: 'https://laz-img-sg.alicdn.com/p/731af1c042bc9b3050f360d93a3f9097.png', category: 'clothes', stock: 50 },
  { name: "Men's Summer Single Layer Windcheater Jacket", description: 'Lightweight windcheater jacket for men.', price: 418, compare_price: 995, image_url: 'https://img.drz.lazcdn.com/g/kf/Sb776987c6789453bb4ced4503b96ef5b4.jpg_720x720q80.jpg', category: 'clothes', stock: 50 }
];

async function importProducts() {
  // Load new products from JSON
  let newProducts = [];
  try {
    newProducts = JSON.parse(fs.readFileSync('./data/all-products.json', 'utf8'));
    console.log(`Loaded ${newProducts.length} new products from data/all-products.json`);
  } catch (e) {
    console.log('No data/all-products.json found, using only existing products:', e.message);
  }

  const allProducts = [...existingProducts, ...newProducts];
  console.log(`Total products to insert: ${allProducts.length}`);

  // Bulk upsert: insert ignoring conflicts on name (id will auto-generate)
  const batchSize = 100;
  let success = 0;
  let fail = 0;

  for (let i = 0; i < allProducts.length; i += batchSize) {
    const batch = allProducts.slice(i, i + batchSize);
    const { error } = await sup.from('products').insert(
      batch.map(p => ({
        name: p.name,
        description: p.description,
        price: p.price,
        image_url: p.image_url,
        category: p.category,
        stock: p.stock
      }))
    );
    if (error) {
      console.log(`Batch ${i / batchSize + 1} FAIL:`, error.message);
      fail += batch.length;
    } else {
      console.log(`Batch ${i / batchSize + 1} OK: ${batch.length} products`);
      success += batch.length;
    }
  }

  console.log(`\nDone. ${success} imported, ${fail} failed.`);
}

importProducts();
