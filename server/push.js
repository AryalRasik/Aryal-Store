'use strict';

// Firebase Cloud Messaging helpers.
//
// The app registers its FCM token with /api/push/register after login or app
// start. Order events then call notifyCustomer()/notifyAdmins(), which look up
// tokens in the Supabase `device_tokens` table (see
// supabase-migration-device-tokens.sql).
//
// Required Vercel environment variables:
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY      (with \n escaped newlines)
//   SUPABASE_SERVICE_ROLE_KEY (so the server can read/write device_tokens)

const { supabase, supabaseAdmin } = require('../db');

const MAX_TOKENS_PER_REQUEST = 500;
const INVALID_TOKEN_CODES = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument'
];

let initAttempted = false;
let messaging = null;

function getDb() {
  return supabaseAdmin || supabase;
}

function getMessaging() {
  if (initAttempted) return messaging;
  initAttempted = true;

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('Push notifications disabled: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required.');
    return null;
  }

  try {
    const admin = require('firebase-admin');
    if (!admin.getApps().length) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey })
      });
    }
    messaging = admin.messaging();
  } catch (err) {
    console.error('Push notifications disabled:', err.message);
    messaging = null;
  }
  return messaging;
}

function isConfigured() {
  return !!getMessaging();
}

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function normalizeData(data) {
  const out = {};
  Object.keys(data || {}).forEach(function (key) {
    const value = data[key];
    if (value === null || value === undefined) return;
    out[key] = String(value);
  });
  return out;
}

async function saveToken(input) {
  const token = String(input.token || '').trim();
  if (!token || token.length > 4096) throw new Error('Invalid device token.');
  const payload = {
    token: token,
    platform: String(input.platform || 'android').slice(0, 30),
    role: input.role === 'admin' ? 'admin' : 'customer',
    user_id: String(input.userId || '').slice(0, 120),
    phone: normalizePhone(input.phone).slice(0, 20),
    session_id: String(input.sessionId || '').slice(0, 120),
    updated_at: new Date().toISOString()
  };
  const { error } = await getDb().from('device_tokens').upsert(payload, { onConflict: 'token' });
  if (error) throw new Error(error.message);
  return true;
}

async function removeToken(token) {
  const value = String(token || '').trim();
  if (!value) return false;
  const { error } = await getDb().from('device_tokens').delete().eq('token', value);
  if (error) throw new Error(error.message);
  return true;
}

async function customerTokens(order) {
  const last10 = normalizePhone(order && order.customer_phone).slice(-10);
  if (!last10) return [];
  let query = getDb().from('device_tokens').select('token').eq('role', 'customer');
  query = query.like('phone', '%' + last10);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(function (row) { return row.token; });
}

async function adminTokens() {
  const { data, error } = await getDb().from('device_tokens').select('token').eq('role', 'admin');
  if (error) throw new Error(error.message);
  return (data || []).map(function (row) { return row.token; });
}

async function sendToTokens(tokens, message) {
  const fcm = getMessaging();
  const list = Array.from(new Set((tokens || []).filter(Boolean)));
  if (!fcm || !list.length) return { sent: 0, failed: 0 };

  const invalid = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < list.length; i += MAX_TOKENS_PER_REQUEST) {
    const chunk = list.slice(i, i + MAX_TOKENS_PER_REQUEST);
    try {
      const response = await fcm.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: String(message.title || 'Aryal Store'),
          body: String(message.body || '')
        },
        data: normalizeData(message.data),
        android: {
          priority: 'high',
          notification: {
            channelId: 'aryal_orders',
            color: '#135E59',
            sound: 'default'
          }
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } }
        }
      });
      sent += response.successCount || 0;
      failed += response.failureCount || 0;
      (response.responses || []).forEach(function (result, index) {
        if (result.success) return;
        const code = result.error && result.error.code;
        if (INVALID_TOKEN_CODES.indexOf(code) !== -1) invalid.push(chunk[index]);
      });
    } catch (err) {
      failed += chunk.length;
      console.warn('Push send failed:', err.message);
    }
  }

  if (invalid.length) {
    try {
      await getDb().from('device_tokens').delete().in('token', invalid);
    } catch (err) {
      console.warn('Could not remove invalid push tokens:', err.message);
    }
  }

  return { sent: sent, failed: failed };
}

// On serverless hosts the function may freeze as soon as the response is sent,
// so callers await these helpers. Keep a hard deadline so a slow FCM/Supabase
// call can never hang an order request.
function withDeadline(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (resolve) {
      setTimeout(function () { resolve({ sent: 0, failed: 0, timedOut: true }); }, ms);
    })
  ]);
}

async function notifyCustomer(order, message) {
  try {
    const work = (async function () {
      const tokens = await customerTokens(order);
      return await sendToTokens(tokens, message);
    })();
    return await withDeadline(work, 5000);
  } catch (err) {
    console.warn('Customer push lookup failed:', err.message);
    return { sent: 0, failed: 0 };
  }
}

async function notifyAdmins(message) {
  try {
    const work = (async function () {
      const tokens = await adminTokens();
      return await sendToTokens(tokens, message);
    })();
    return await withDeadline(work, 5000);
  } catch (err) {
    console.warn('Admin push lookup failed:', err.message);
    return { sent: 0, failed: 0 };
  }
}

module.exports = {
  isConfigured: isConfigured,
  saveToken: saveToken,
  removeToken: removeToken,
  sendToTokens: sendToTokens,
  notifyCustomer: notifyCustomer,
  notifyAdmins: notifyAdmins
};
