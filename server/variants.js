'use strict';

/**
 * Product variants: colour/size combinations, per-variant stock and atomic
 * reserve/release helpers.
 *
 * Products without variant rows keep using the legacy single `products.stock`
 * column. Once a product has variant rows, `products.stock` is kept as the sum
 * of its active variant quantities so catalogue cards and alerts stay correct.
 */

const { supabase, from, isSupabaseTable } = require('../db');

const MAX_COLOR = 40;
const MAX_SIZE = 40;
const MAX_SKU = 80;
const MAX_IMAGE = 2048;

function text(value, max) {
  if (value === undefined || value === null) return '';
  const str = String(value).trim();
  return max ? str.slice(0, max) : str;
}

function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(String(value).replace(/[^0-9\-]/g, ''));
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function toMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(String(value).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function listFrom(value) {
  if (Array.isArray(value)) {
    return value.map(function (item) {
      if (item && typeof item === 'object') return text(item.name || item.value || item.color || item.size);
      return text(item);
    });
  }
  if (value === undefined || value === null) return [];
  return String(value).split(',').map(function (item) { return text(item); });
}

function uniqueList(values) {
  const seen = new Set();
  const out = [];
  (values || []).forEach(function (value) {
    const item = text(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
}

function normalizeColors(value) {
  return uniqueList(listFrom(value)).map(function (item) { return item.slice(0, MAX_COLOR); });
}

function normalizeSizes(value) {
  return uniqueList(listFrom(value)).map(function (item) { return item.slice(0, MAX_SIZE); });
}

function variantKey(color, size) {
  return text(color).toLowerCase() + '\u0000' + text(size).toLowerCase();
}

function normalizeVariant(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const color = text(source.color, MAX_COLOR);
  const size = text(source.size, MAX_SIZE);
  return {
    color: color,
    size: size,
    stock_quantity: Math.max(0, toInt(source.stock_quantity !== undefined ? source.stock_quantity : (source.stock !== undefined ? source.stock : source.qty), 0)),
    sku: text(source.sku, MAX_SKU),
    price: toMoney(source.price),
    image_url: text(source.image_url || source.image, MAX_IMAGE),
    color_hex: /^#[0-9a-f]{3,8}$/i.test(text(source.color_hex)) ? text(source.color_hex) : '',
    is_active: source.is_active === false || source.is_active === 0 ? false : true
  };
}

function normalizeVariants(value) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  rows.forEach(function (raw) {
    const variant = normalizeVariant(raw);
    if (!variant.color && !variant.size) return;
    const key = variantKey(variant.color, variant.size);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(variant);
  });
  return out;
}

function hashPart(value) {
  let hash = 0;
  const str = String(value || '');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).toUpperCase().slice(-4).padStart(4, '0');
}

function skuPart(value) {
  const str = String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10);
  return str || '';
}

function generateVariantSku(opts) {
  const options = opts || {};
  const base = skuPart(options.baseSku || options.sku) || 'ARY';
  const color = skuPart(options.color) || 'STD';
  const size = skuPart(options.size) || 'OS';
  const productPart = skuPart(String(options.productId || '').replace(/-/g, '')).slice(-6) || 'NEW';
  const unique = hashPart(variantKey(options.color, options.size));
  return (base + '-' + color + '-' + size + '-' + productPart + '-' + unique).slice(0, MAX_SKU);
}

function variantPrice(variant, product) {
  if (variant && variant.price !== null && variant.price !== undefined && variant.price !== '') {
    const price = toMoney(variant.price);
    if (price !== null) return price;
  }
  return toMoney(product && product.price);
}

function findVariant(variants, color, size) {
  const key = variantKey(color, size);
  return (variants || []).find(function (variant) {
    return variantKey(variant.color, variant.size) === key;
  }) || null;
}

function activeVariants(variants) {
  return (variants || []).filter(function (variant) {
    return variant && variant.is_active !== false && variant.is_active !== 0;
  });
}

function variantsAvailable(error) {
  if (!error) return true;
  const msg = String(error.message || error || '');
  return !(/product_variants/i.test(msg) && /(does not exist|Could not find|schema cache|relation)/i.test(msg));
}

function isMissingFunction(error) {
  const msg = String((error && error.message) || error || '');
  return /Could not find the function|function .* does not exist|PGRST202|schema cache/i.test(msg);
}

function isMissingVariantsTable(error) {
  const msg = String((error && error.message) || error || '');
  return /product_variants/i.test(msg) && /(does not exist|Could not find|schema cache|relation)/i.test(msg);
}

function stockError(name, available) {
  const err = new Error('Only ' + Math.max(0, available) + ' left in stock for "' + (name || 'this product') + '".');
  err.code = 'INSUFFICIENT_STOCK';
  err.statusCode = 409;
  return err;
}

async function fetchProductVariants(productId, options) {
  const opts = options || {};
  let query = from('product_variants').select('*').eq('product_id', String(productId));
  if (!opts.includeInactive) query = query.eq('is_active', true);
  query = query.order('color', { ascending: true }).order('size', { ascending: true });
  const { data, error } = await query;
  if (error) {
    if (isMissingVariantsTable(error)) return [];
    throw error;
  }
  return data || [];
}

async function getVariantsForProducts(productIds, options) {
  const opts = options || {};
  const ids = Array.from(new Set((productIds || []).map(function (id) { return String(id); }).filter(Boolean)));
  const map = new Map(ids.map(function (id) { return [id, []]; }));
  if (!ids.length) return map;

  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    let query = from('product_variants').select('*').in('product_id', ids.slice(i, i + chunkSize));
    if (!opts.includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) {
      if (isMissingVariantsTable(error)) return map;
      throw error;
    }
    (data || []).forEach(function (variant) {
      const key = String(variant.product_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(variant);
    });
  }

  map.forEach(function (rows) {
    rows.sort(function (a, b) {
      return (a.color || '').localeCompare(b.color || '') || (a.size || '').localeCompare(b.size || '');
    });
  });
  return map;
}

/**
 * Insert/update variant rows and deactivate combinations the admin removed.
 * Existing SKUs, photos and inactive stock are preserved unless overwritten.
 */
async function syncProductVariants(product, incoming, options) {
  const opts = options || {};
  const variants = normalizeVariants(incoming);
  if (!variants.length) return [];

  const existing = await fetchProductVariants(product.id, { includeInactive: true });
  const byKey = new Map();
  (existing || []).forEach(function (row) { byKey.set(variantKey(row.color, row.size), row); });
  const keep = new Set();
  const saved = [];

  for (const variant of variants) {
    const key = variantKey(variant.color, variant.size);
    keep.add(key);
    const current = byKey.get(key);
    const sku = variant.sku || (current && current.sku) || generateVariantSku({
      baseSku: product.sku,
      productId: product.id,
      color: variant.color,
      size: variant.size
    });
    const payload = {
      product_id: String(product.id),
      color: variant.color,
      size: variant.size,
      sku: sku,
      stock_quantity: variant.stock_quantity,
      price: variant.price,
      image_url: variant.image_url || (current && current.image_url) || '',
      color_hex: variant.color_hex || (current && current.color_hex) || '',
      is_active: true,
      updated_at: new Date().toISOString()
    };

    if (current) {
      const { data, error } = await from('product_variants').update(payload).eq('id', current.id).select();
      if (error) throw error;
      saved.push((data && data[0]) || Object.assign({}, current, payload));
    } else {
      const { data, error } = await from('product_variants').insert(payload).select();
      if (error) throw error;
      saved.push((data && data[0]) || payload);
    }
  }

  const removed = (existing || []).filter(function (row) {
    return !keep.has(variantKey(row.color, row.size)) && row.is_active !== false;
  });
  for (const row of removed) {
    const { error } = await from('product_variants')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) throw error;
  }

  const stock = saved.reduce(function (sum, row) { return sum + (toInt(row.stock_quantity, 0) || 0); }, 0);
  await from('products').update({ stock: stock }).eq('id', product.id);
  if (opts.colors !== undefined || opts.sizes !== undefined) {
    const patch = {};
    if (opts.colors !== undefined) patch.colors = normalizeColors(opts.colors).join(',');
    if (opts.sizes !== undefined) patch.sizes = normalizeSizes(opts.sizes).join(',');
    if (Object.keys(patch).length) await from('products').update(patch).eq('id', product.id);
  }

  return saved;
}

async function recomputeProductStock(productId, variants) {
  const rows = variants || await fetchProductVariants(productId, { includeInactive: false });
  if (!rows.length) return null;
  const stock = activeVariants(rows).reduce(function (sum, row) {
    return sum + (toInt(row.stock_quantity, 0) || 0);
  }, 0);
  await from('products').update({ stock: stock }).eq('id', productId);
  return stock;
}

async function getOrderItems(orderId) {
  const { data, error } = await from('order_items').select('*').eq('order_id', orderId);
  if (error) throw error;
  return data || [];
}

function numericStock(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function adjustVariantStock(id, delta, expectedStock) {
  let observed = toInt(expectedStock, 0);
  for (let attempt = 0; attempt < 8; attempt++) {
    const next = observed + delta;
    if (next < 0) return { ok: false, available: observed };
    const { data, error } = await from('product_variants')
      .update({ stock_quantity: next, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('stock_quantity', observed)
      .select('id');
    if (error) throw error;
    if (data && data.length) return { ok: true, available: next };
    const { data: current, error: readError } = await from('product_variants').select('*').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!current) return { ok: false, available: 0 };
    observed = toInt(current.stock_quantity, 0);
  }
  return { ok: false, available: observed };
}

async function adjustLegacyStock(productId, delta, expectedStock) {
  let observed = numericStock(expectedStock);
  for (let attempt = 0; attempt < 8; attempt++) {
    const base = observed === null ? 0 : observed;
    const next = base + delta;
    if (next < 0) return { ok: false, available: base };
    let query = from('products').update({ stock: next }).eq('id', productId);
    query = observed === null ? query.is('stock', null) : query.eq('stock', observed);
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (data && data.length) return { ok: true, available: next };
    const { data: current, error: readError } = await from('products').select('id,stock').eq('id', productId).maybeSingle();
    if (readError) throw readError;
    if (!current) return { ok: false, available: 0 };
    observed = numericStock(current.stock);
  }
  return { ok: false, available: observed === null ? 0 : observed };
}

async function reserveStockFallback(order, items) {
  const productIds = Array.from(new Set(items.map(function (item) { return String(item.product_id); })));
  const variantsByProduct = await getVariantsForProducts(productIds, { includeInactive: false });
  const reserved = [];

  async function undo() {
    for (const entry of reserved.reverse()) {
      if (entry.variant) {
        await from('product_variants')
          .update({ stock_quantity: entry.variant.stock_quantity + entry.quantity, updated_at: new Date().toISOString() })
          .eq('id', entry.variant.id);
      } else {
        const { data: product } = await from('products').select('id,stock').eq('id', entry.productId).maybeSingle();
        if (product) {
          await from('products').update({ stock: (numericStock(product.stock) || 0) + entry.quantity }).eq('id', entry.productId);
        }
      }
    }
  }

  try {
    for (const item of items) {
      const productId = String(item.product_id);
      const quantity = toInt(item.quantity, 0);
      if (quantity < 1) throw stockError(item.product_name, 0);
      const productVariants = variantsByProduct.get(productId) || [];
      const active = activeVariants(productVariants);

      if (active.length) {
        const variant = findVariant(active, item.color, item.size);
        if (!variant) throw stockError(item.product_name, 0);
        const available = toInt(variant.stock_quantity, 0);
        if (available < quantity) throw stockError(item.product_name, available);
        const result = await adjustVariantStock(variant.id, -quantity, available);
        if (!result.ok) throw stockError(item.product_name, result.available);
        reserved.push({ variant: variant, quantity: quantity, productId: productId });
      } else {
        const { data: product, error } = await from('products').select('id,stock').eq('id', productId).maybeSingle();
        if (error) throw error;
        if (!product) throw stockError(item.product_name, 0);
        const available = numericStock(product.stock);
        if (available !== null && available < quantity) throw stockError(item.product_name, available);
        const result = await adjustLegacyStock(productId, -quantity, available);
        if (!result.ok) throw stockError(item.product_name, result.available);
        reserved.push({ variant: null, quantity: quantity, productId: productId });
      }
    }

    for (const productId of productIds) {
      const { data: product } = await from('products').select('id,sold_count').eq('id', productId).maybeSingle();
      if (!product) continue;
      const sold = items.filter(function (item) { return String(item.product_id) === productId; })
        .reduce(function (sum, item) { return sum + toInt(item.quantity, 0); }, 0);
      await from('products').update({ sold_count: (toInt(product.sold_count, 0) || 0) + sold }).eq('id', productId);
      if ((variantsByProduct.get(productId) || []).length) await recomputeProductStock(productId);
    }

    await from('orders').update({ stock_reserved: 1, updated_at: new Date().toISOString() }).eq('id', order.id).then(function (result) {
      if (result && result.error && !/stock_reserved/i.test(result.error.message || '')) console.warn('Could not mark order stock reserved:', result.error.message);
    });
    return { ok: true, fallback: true };
  } catch (err) {
    await undo().catch(function () {});
    throw err;
  }
}

async function reserveOrderStock(order, itemsArg) {
  if (!order) throw new Error('Order not found.');
  if (toInt(order.stock_reserved, 0) === 1) return { ok: true, already_reserved: true };
  const items = itemsArg || await getOrderItems(order.id);

  if (isSupabaseTable('orders') && /^[0-9a-f-]{36}$/i.test(String(order.id))) {
    const { data, error } = await supabase.rpc('reserve_order_stock', { p_order_id: order.id, p_token: order.tracking_token || '' });
    if (!error) return data || { ok: true };
    if (!isMissingFunction(error) && !isMissingVariantsTable(error)) {
      const err = new Error(error.message || 'Could not reserve stock.');
      if (/INSUFFICIENT_STOCK/i.test(error.message || '')) err.statusCode = 409;
      throw err;
    }
  }

  return reserveStockFallback(order, items);
}

async function releaseStockFallback(order, items) {
  const productIds = Array.from(new Set(items.map(function (item) { return String(item.product_id); })));
  const variantsByProduct = await getVariantsForProducts(productIds, { includeInactive: true });

  for (const item of items) {
    const productId = String(item.product_id);
    const quantity = toInt(item.quantity, 0);
    const productVariants = variantsByProduct.get(productId) || [];
    const variant = findVariant(productVariants, item.color, item.size);
    if (variant) {
      const current = toInt(variant.stock_quantity, 0);
      await adjustVariantStock(variant.id, quantity, current);
    } else if (!productVariants.length) {
      const { data: product } = await from('products').select('id,stock').eq('id', productId).maybeSingle();
      if (product) {
        await from('products').update({ stock: (numericStock(product.stock) || 0) + quantity }).eq('id', productId);
      }
    }
  }

  for (const productId of productIds) {
    const { data: product } = await from('products').select('id,sold_count').eq('id', productId).maybeSingle();
    if (!product) continue;
    const sold = items.filter(function (item) { return String(item.product_id) === productId; })
      .reduce(function (sum, item) { return sum + toInt(item.quantity, 0); }, 0);
    await from('products').update({ sold_count: Math.max(0, (toInt(product.sold_count, 0) || 0) - sold) }).eq('id', productId);
    if ((variantsByProduct.get(productId) || []).length) await recomputeProductStock(productId);
  }

  await from('orders').update({ stock_reserved: 0, updated_at: new Date().toISOString() }).eq('id', order.id).then(function (result) {
    if (result && result.error && !/stock_reserved/i.test(result.error.message || '')) console.warn('Could not mark order stock released:', result.error.message);
  });
  return { ok: true, fallback: true };
}

async function releaseOrderStock(order, itemsArg) {
  if (!order) return { ok: true };
  if (toInt(order.stock_reserved, 0) !== 1) return { ok: true, already_released: true };
  const items = itemsArg || await getOrderItems(order.id);

  if (isSupabaseTable('orders') && /^[0-9a-f-]{36}$/i.test(String(order.id))) {
    const { data, error } = await supabase.rpc('release_order_stock', { p_order_id: order.id, p_token: order.tracking_token || '' });
    if (!error) return data || { ok: true };
    if (!isMissingFunction(error) && !isMissingVariantsTable(error)) {
      throw new Error(error.message || 'Could not release stock.');
    }
  }

  return releaseStockFallback(order, items);
}

module.exports = {
  normalizeColors,
  normalizeSizes,
  normalizeVariant,
  normalizeVariants,
  variantKey,
  generateVariantSku,
  variantPrice,
  findVariant,
  activeVariants,
  fetchProductVariants,
  getVariantsForProducts,
  syncProductVariants,
  recomputeProductStock,
  reserveOrderStock,
  releaseOrderStock,
  reserveStockFallback,
  releaseStockFallback,
  isMissingVariantsTable,
  variantsAvailable
};
