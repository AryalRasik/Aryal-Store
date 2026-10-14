'use strict';

/**
 * Central order + delivery workflow rules for the manual confirmation model.
 *
 *   Customer submits REQUEST  ->  Shop verifies stock & delivery
 *   ->  Shop sends final OFFER  ->  Customer APPROVES
 *   ->  Shop CONFIRMS / prepares ->  Delivery arranged -> DELIVERED
 *
 * This module is the single source of truth for statuses, the customer-facing
 * labels, the allowed server-side status transitions, payment states and the
 * small helpers used by the API routes. It contains no I/O.
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Order statuses (internal keys)
// ---------------------------------------------------------------------------
const ORDER_STATUSES = {
  REQUESTED: {
    key: 'REQUESTED',
    staffLabel: 'Requested',
    customerLabel: 'Order Request Received',
    description: 'We have received your order request and will verify it.',
    color: '#f39c12',
    step: 1
  },
  UNDER_REVIEW: {
    key: 'UNDER_REVIEW',
    staffLabel: 'Under Review',
    customerLabel: 'Checking Your Order',
    description: 'We are verifying stock and your order details.',
    color: '#e67e22',
    step: 2
  },
  DELIVERY_CHECK: {
    key: 'DELIVERY_CHECK',
    staffLabel: 'Delivery Check',
    customerLabel: 'Checking Delivery Options',
    description: 'We are checking delivery availability for your address.',
    color: '#e67e22',
    step: 2
  },
  AWAITING_APPROVAL: {
    key: 'AWAITING_APPROVAL',
    staffLabel: 'Awaiting Customer Approval',
    customerLabel: 'Awaiting Your Approval',
    description: 'We have sent you the final price and delivery details. Please review and approve.',
    color: '#9b59b6',
    step: 3
  },
  CONFIRMED: {
    key: 'CONFIRMED',
    staffLabel: 'Confirmed',
    customerLabel: 'Order Confirmed',
    description: 'You approved the offer. Your order is confirmed.',
    color: '#2980b9',
    step: 4
  },
  PREPARING: {
    key: 'PREPARING',
    staffLabel: 'Preparing',
    customerLabel: 'Preparing Your Order',
    description: 'We are preparing your order.',
    color: '#3498db',
    step: 4
  },
  READY_FOR_PICKUP: {
    key: 'READY_FOR_PICKUP',
    staffLabel: 'Ready for Pickup',
    customerLabel: 'Ready for Pickup',
    description: 'Your order is ready to be picked up from the shop.',
    color: '#16a085',
    step: 5
  },
  DISPATCHED: {
    key: 'DISPATCHED',
    staffLabel: 'Dispatched',
    customerLabel: 'Out for Delivery',
    description: 'Your order is on the way.',
    color: '#8e44ad',
    step: 5
  },
  DELIVERED: {
    key: 'DELIVERED',
    staffLabel: 'Delivered',
    customerLabel: 'Delivered',
    description: 'Your order has been delivered. Thank you!',
    color: '#27ae60',
    step: 6
  },
  DELIVERY_FAILED: {
    key: 'DELIVERY_FAILED',
    staffLabel: 'Delivery Failed',
    customerLabel: 'Delivery Unsuccessful',
    description: 'We could not complete the delivery. We will contact you.',
    color: '#e74c3c',
    step: 6
  },
  CANCELLED: {
    key: 'CANCELLED',
    staffLabel: 'Cancelled',
    customerLabel: 'Order Cancelled',
    description: 'This order has been cancelled.',
    color: '#e74c3c',
    step: 0
  },
  REFUND_PENDING: {
    key: 'REFUND_PENDING',
    staffLabel: 'Refund Pending',
    customerLabel: 'Refund In Progress',
    description: 'A refund for this order is being processed.',
    color: '#d35400',
    step: 0
  },
  REFUNDED: {
    key: 'REFUNDED',
    staffLabel: 'Refunded',
    customerLabel: 'Refund Completed',
    description: 'This order has been refunded.',
    color: '#7f8c8d',
    step: 0
  }
};

const ORDER_STATUS_KEYS = Object.keys(ORDER_STATUSES);

// ---------------------------------------------------------------------------
// Allowed status transitions (server-authoritative). A transition not listed
// here is rejected by the API.
// ---------------------------------------------------------------------------
const ALLOWED_TRANSITIONS = {
  REQUESTED: ['UNDER_REVIEW', 'DELIVERY_CHECK', 'AWAITING_APPROVAL', 'CANCELLED'],
  UNDER_REVIEW: ['DELIVERY_CHECK', 'AWAITING_APPROVAL', 'REQUESTED', 'CANCELLED'],
  DELIVERY_CHECK: ['UNDER_REVIEW', 'AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL: ['CONFIRMED', 'UNDER_REVIEW', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'READY_FOR_PICKUP', 'DISPATCHED', 'CANCELLED', 'REFUND_PENDING'],
  PREPARING: ['READY_FOR_PICKUP', 'DISPATCHED', 'CANCELLED', 'REFUND_PENDING'],
  READY_FOR_PICKUP: ['DELIVERED', 'DISPATCHED', 'DELIVERY_FAILED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED: ['REFUND_PENDING'],
  DELIVERY_FAILED: ['DISPATCHED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED'],
  CANCELLED: ['REFUND_PENDING', 'REFUNDED'],
  REFUND_PENDING: ['REFUNDED', 'CANCELLED'],
  REFUNDED: []
};

// Statuses from which an order can still be cancelled by the customer.
const CUSTOMER_CANCELLABLE = ['REQUESTED', 'UNDER_REVIEW', 'DELIVERY_CHECK', 'AWAITING_APPROVAL'];

// Statuses that mean the final terms were accepted by the customer.
const APPROVED_STATUSES = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'DISPATCHED', 'DELIVERED', 'DELIVERY_FAILED'];

function isKnownStatus(status) {
  return Object.prototype.hasOwnProperty.call(ORDER_STATUSES, status);
}

function canTransition(from, to) {
  if (!isKnownStatus(from) || !isKnownStatus(to)) return false;
  if (from === to) return false;
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  return allowed.indexOf(to) !== -1;
}

function statusMeta(status) {
  return ORDER_STATUSES[status] || { key: status, staffLabel: status, customerLabel: status, description: '', color: '#888', step: 0 };
}

function customerLabel(status) {
  return statusMeta(status).customerLabel;
}

// The happy-path sequence used to render the customer progress tracker.
const PROGRESS_SEQUENCE = ['REQUESTED', 'UNDER_REVIEW', 'AWAITING_APPROVAL', 'CONFIRMED', 'PREPARING', 'DISPATCHED', 'DELIVERED'];

// ---------------------------------------------------------------------------
// Payment statuses
// ---------------------------------------------------------------------------
const PAYMENT_STATUSES = {
  UNPAID: { key: 'UNPAID', label: 'Unpaid', color: '#e67e22' },
  PAYMENT_PENDING: { key: 'PAYMENT_PENDING', label: 'Payment Pending Verification', color: '#f39c12' },
  PAID: { key: 'PAID', label: 'Paid', color: '#27ae60' },
  REFUND_PENDING: { key: 'REFUND_PENDING', label: 'Refund Pending', color: '#d35400' },
  PARTIALLY_REFUNDED: { key: 'PARTIALLY_REFUNDED', label: 'Partially Refunded', color: '#c0392b' },
  REFUNDED: { key: 'REFUNDED', label: 'Refunded', color: '#7f8c8d' }
};

const PAYMENT_STATUS_KEYS = Object.keys(PAYMENT_STATUSES);

function isKnownPaymentStatus(status) {
  return Object.prototype.hasOwnProperty.call(PAYMENT_STATUSES, status);
}

function paymentLabel(status) {
  return (PAYMENT_STATUSES[status] || { label: status || 'Unpaid' }).label;
}

// Payment methods the shop keeps track of. Only "online" is wired to the shop
// QR; the rest are recorded manually by staff (no gateway is invented).
const PAYMENT_METHODS = {
  online: { key: 'online', label: 'Online Payment (Shop QR)', requiresVerification: true },
  cash_on_delivery: { key: 'cash_on_delivery', label: 'Cash on Delivery', requiresVerification: false },
  cash_on_pickup: { key: 'cash_on_pickup', label: 'Cash on Pickup at Shop', requiresVerification: false },
  bank_transfer: { key: 'bank_transfer', label: 'Bank Transfer', requiresVerification: true }
};

// Delivery methods the shop can choose manually. Costs are NEVER auto-filled.
const DELIVERY_METHODS = {
  shop_pickup: { key: 'shop_pickup', label: 'Customer Pickup from Shop' },
  local_rider: { key: 'local_rider', label: 'Local Delivery (Independently Arranged Rider)' },
  third_party_courier: { key: 'third_party_courier', label: 'Third-Party Courier Delivery' }
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DEFAULT_OFFER_EXPIRY_HOURS = 48;

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return isFinite(num) ? num : null;
}

function money(value) {
  const num = toNumber(value);
  return num === null ? 0 : Math.round((num + Number.EPSILON) * 100) / 100;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// IDs and tokens
// ---------------------------------------------------------------------------
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars

function randomCode(length) {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Human friendly, non-sequential order reference e.g. ARY-251014-7K3Q. */
function generateOrderCode() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return 'ARY-' + yy + mm + dd + '-' + randomCode(4);
}

/** Cryptographically strong token used to authorise public order tracking. */
function generateTrackingToken() {
  return crypto.randomBytes(24).toString('hex');
}

function safeEquals(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------
// Offer helpers
// ---------------------------------------------------------------------------
function computeOfferTotals(items, deliveryFee, discount) {
  const subtotal = round2((items || []).reduce(function (sum, item) {
    return sum + money(item.unit_price) * (Number(item.quantity) || 0);
  }, 0));
  const fee = Math.max(0, money(deliveryFee));
  const disc = Math.max(0, Math.min(money(discount), subtotal));
  const total = round2(Math.max(0, subtotal - disc) + fee);
  return { subtotal: subtotal, discount: disc, delivery_fee: fee, total: total };
}

function computeExpiry(expiryHours, from) {
  const hours = Number(expiryHours) > 0 ? Number(expiryHours) : DEFAULT_OFFER_EXPIRY_HOURS;
  const base = from ? new Date(from) : new Date();
  return new Date(base.getTime() + hours * 3600 * 1000).toISOString();
}

function isOfferExpired(order) {
  if (!order || order.offer_status !== 'sent' || !order.offer_expires_at) return false;
  const exp = new Date(order.offer_expires_at).getTime();
  if (!isFinite(exp)) return false;
  return Date.now() > exp;
}

/**
 * Build a WhatsApp "click to chat" URL with a prefilled message. Returns ''
 * when no number is available. This never claims a message was delivered.
 */
function buildWhatsAppUrl(phone, message) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  const normalized = digits.length === 10 ? '977' + digits : digits;
  return 'https://wa.me/' + normalized + '?text=' + encodeURIComponent(String(message || ''));
}

// Notification message templates (customer facing).
function notificationMessage(type, order) {
  const code = order && (order.order_code || order.id);
  const map = {
    request_received: 'Namaste! We have received your order request ' + code + '. We will verify product availability and delivery options and contact you shortly. Your order is not confirmed yet and no payment is required now.',
    under_review: 'We are reviewing your order ' + code + ' and checking product availability.',
    delivery_check: 'We are checking delivery options for your order ' + code + '.',
    offer_sent: 'The final price and delivery details for order ' + code + ' are ready. Please review and approve them.',
    approved: 'Thank you! We received your approval for order ' + code + '. Your order is now confirmed.',
    declined: 'You declined the offer for order ' + code + '. The request has been cancelled with no charge.',
    preparing: 'We have started preparing your order ' + code + '.',
    ready_for_pickup: 'Your order ' + code + ' is ready for pickup at the shop.',
    dispatched: 'Your order ' + code + ' is out for delivery.',
    delayed: 'There is a delay with the delivery of order ' + code + '. We will keep you updated.',
    delivery_failed: 'We could not complete the delivery of order ' + code + '. We will contact you to rearrange.',
    delivered: 'Your order ' + code + ' has been delivered. Thank you for shopping with us!',
    cancelled: 'Order ' + code + ' has been cancelled.',
    refund_initiated: 'A refund has been initiated for order ' + code + '. It may take a few business days to appear in your account.',
    refund_completed: 'The refund for order ' + code + ' has been completed.'
  };
  return map[type] || ('Update for order ' + code + '.');
}

module.exports = {
  ORDER_STATUSES,
  ORDER_STATUS_KEYS,
  ALLOWED_TRANSITIONS,
  CUSTOMER_CANCELLABLE,
  APPROVED_STATUSES,
  PROGRESS_SEQUENCE,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_KEYS,
  PAYMENT_METHODS,
  DELIVERY_METHODS,
  DEFAULT_OFFER_EXPIRY_HOURS,
  isKnownStatus,
  canTransition,
  statusMeta,
  customerLabel,
  isKnownPaymentStatus,
  paymentLabel,
  toNumber,
  money,
  round2,
  generateOrderCode,
  generateTrackingToken,
  safeEquals,
  computeOfferTotals,
  computeExpiry,
  isOfferExpired,
  buildWhatsAppUrl,
  notificationMessage
};
