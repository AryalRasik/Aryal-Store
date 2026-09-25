'use strict';

/**
 * Central online-payment configuration + order pricing rules.
 * Single source of truth shared by the API routes so the checkout UI, the
 * stored order and the admin payment verification always agree.
 */

const crypto = require('crypto');

const PAYMENT_METHOD = 'online';

const PAYMENT_STATUSES = ['pending', 'submitted', 'verified', 'rejected'];
// Statuses an admin is allowed to set manually.
const ADMIN_SETTABLE_PAYMENT_STATUSES = ['verified', 'rejected', 'submitted'];

const PAYMENT_QR_FALLBACK = '/assets/payment/shop-qr-placeholder.svg';
const MAX_INSTRUCTIONS_LENGTH = 200;
const MAX_DETAILS_LENGTH = 400;

const DELIVERY_METHODS = [
  { id: 'standard', label: 'Standard Delivery', cost: 0 },
  { id: 'express', label: 'Express Delivery', cost: 200 },
  { id: 'same_day', label: 'Same Day Delivery', cost: 500 }
];

const DELIVERY_ALIASES = {
  standard: 'standard',
  standarddelivery: 'standard',
  free: 'standard',
  normal: 'standard',
  express: 'express',
  expressdelivery: 'express',
  sameday: 'same_day',
  samedaydelivery: 'same_day'
};

const DEFAULT_FREE_SHIPPING_THRESHOLD = 2000;

function text(value, maxLength) {
  if (value === undefined || value === null) return '';
  const str = String(value).trim();
  if (!maxLength) return str;
  return str.slice(0, maxLength);
}

function getPaymentConfig() {
  const qrUrl = text(process.env.PAYMENT_QR_URL) || PAYMENT_QR_FALLBACK;
  return {
    method: PAYMENT_METHOD,
    methodLabel: 'Online Payment',
    qrUrl: qrUrl,
    isPlaceholder: qrUrl === PAYMENT_QR_FALLBACK,
    accountName: text(process.env.PAYMENT_ACCOUNT_NAME, 80),
    instructions: text(process.env.PAYMENT_INSTRUCTIONS, MAX_INSTRUCTIONS_LENGTH)
      || 'Scan the QR code with your payment app, then tap "I Have Paid".',
    accountDetails: text(process.env.PAYMENT_ACCOUNT_DETAILS, MAX_DETAILS_LENGTH),
    statusLabels: {
      pending: 'Awaiting payment',
      submitted: 'Payment submitted - awaiting verification',
      verified: 'Payment verified',
      rejected: 'Payment rejected'
    }
  };
}

function isPlaceholderQr(url) {
  return !url || url === PAYMENT_QR_FALLBACK;
}

/** Only "online" is accepted; every other legacy value is rejected. */
function normalizePaymentMethod(value) {
  return text(value).toLowerCase() === PAYMENT_METHOD ? PAYMENT_METHOD : null;
}

function resolveDeliveryMethod(value) {
  const key = text(value).toLowerCase().replace(/[^a-z]/g, '');
  const id = DELIVERY_ALIASES[key];
  return DELIVERY_METHODS.find(m => m.id === id) || null;
}

function round2(value) {
  const num = Number(value);
  if (!isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return isFinite(num) ? num : null;
}

function formatAmount(value) {
  return String(round2(value));
}

/** Shipping is authoritative: standard is free above the free-shipping threshold. */
function computeShippingCost(delivery, subtotal, freeShippingThreshold) {
  if (!delivery) return 0;
  if (delivery.id === 'standard') {
    const threshold = toNumber(freeShippingThreshold);
    const limit = threshold === null ? DEFAULT_FREE_SHIPPING_THRESHOLD : threshold;
    return subtotal >= limit ? 0 : delivery.cost;
  }
  return delivery.cost;
}

/**
 * Recompute coupon discount server-side. `coupon` is a row from the coupons
 * table (already fetched by the caller) or null.
 */
function computeDiscount(coupon, subtotal) {
  if (!coupon) return 0;
  const value = toNumber(coupon.discount_value) || 0;
  let discount = coupon.discount_type === 'percentage'
    ? round2(subtotal * (value / 100))
    : round2(Math.min(value, subtotal));
  const maxDiscount = toNumber(coupon.max_discount_amount);
  if (maxDiscount !== null && maxDiscount > 0 && discount > maxDiscount) discount = round2(maxDiscount);
  return Math.max(0, Math.min(round2(discount), round2(subtotal)));
}

/**
 * Build authoritative order lines from database products.
 * Client supplied names/prices are never trusted.
 */
function buildOrderItems(productsById, requestedItems) {
  const items = [];
  const merged = new Map();

  (requestedItems || []).forEach(raw => {
    const productId = text(raw && raw.product_id);
    if (!productId) throw new Error('Each order item must reference a product.');
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error('Invalid quantity for one of the items.');
    }
    const size = text(raw.size, 40);
    const color = text(raw.color, 40);
    const key = productId + '::' + size + '::' + color;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += quantity;
      if (existing.quantity > 99) throw new Error('Too many items of the same variant in one order.');
    } else {
      merged.set(key, { product_id: productId, quantity, size, color });
    }
  });

  merged.forEach(entry => {
    const product = productsById.get(entry.product_id);
    if (!product) throw new Error('One of the products in your cart is no longer available.');
    if (product.status && product.status !== 'active') {
      throw new Error('"' + (product.name || 'A product') + '" is no longer available.');
    }
    const price = toNumber(product.price);
    if (price === null || price < 0) {
      throw new Error('Price is unavailable for "' + (product.name || 'a product') + '".');
    }
    const stock = toNumber(product.stock) !== null ? toNumber(product.stock) : toNumber(product.stock_count);
    if (stock !== null && entry.quantity > stock) {
      throw new Error('Only ' + stock + ' left in stock for "' + (product.name || 'a product') + '".');
    }
    items.push({
      product_id: product.id,
      product_name: product.name || 'Product',
      quantity: entry.quantity,
      unit_price: formatAmount(price),
      size: entry.size,
      color: entry.color
    });
  });

  return items;
}

function computeOrderTotals(items, delivery, freeShippingThreshold, coupon) {
  const subtotal = round2(items.reduce((sum, item) => sum + (toNumber(item.unit_price) || 0) * item.quantity, 0));
  const discount = computeDiscount(coupon, subtotal);
  const shipping = computeShippingCost(delivery, subtotal, freeShippingThreshold);
  const total = round2(Math.max(0, subtotal - discount) + shipping);
  return {
    subtotal: formatAmount(subtotal),
    discount: formatAmount(discount),
    shipping_cost: formatAmount(shipping),
    total_amount: formatAmount(total)
  };
}

function createPaymentToken() {
  return crypto.randomBytes(24).toString('hex');
}

function safeEquals(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  PAYMENT_METHOD,
  PAYMENT_STATUSES,
  ADMIN_SETTABLE_PAYMENT_STATUSES,
  PAYMENT_QR_FALLBACK,
  DEFAULT_FREE_SHIPPING_THRESHOLD,
  DELIVERY_METHODS,
  getPaymentConfig,
  isPlaceholderQr,
  normalizePaymentMethod,
  resolveDeliveryMethod,
  round2,
  toNumber,
  formatAmount,
  computeShippingCost,
  computeDiscount,
  buildOrderItems,
  computeOrderTotals,
  createPaymentToken,
  safeEquals
};
