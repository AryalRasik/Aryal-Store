// =========================================================
// Aryal Store - Frontend Script
// =========================================================
// Core functionality is inlined in index.html.
// This file provides supplementary helpers and is loaded
// after the inline script completes initialization.
// =========================================================

const SUPABASE_URL = 'https://srlejludttajosnrfkca.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AHMbtLciU-EznD3ASu0YSQ_sv2PhRoZ';

async function supaFetch(table, params) {
  let url = SUPABASE_URL + '/rest/v1/' + table + '?select=*';
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url += '&' + k + '=' + encodeURIComponent(v);
    }
  }
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, 8000);
  try {
    var r = await fetch(url, { headers: { apikey: SUPABASE_KEY }, signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function supaSingle(table, params) {
  return supaFetch(table, params).then(d => d[0] || null);
}

async function supaInsert(table, data) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, 8000);
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Prefer: 'return=representation' },
      body: JSON.stringify(data), signal: controller.signal
    });
    clearTimeout(timer);
    return r.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function supaUpdate(table, id, data) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, 8000);
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify(data), signal: controller.signal
    });
    clearTimeout(timer);
    return r.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function supaDelete(table, id) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, 8000);
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE', headers: { apikey: SUPABASE_KEY }, signal: controller.signal
    });
    clearTimeout(timer);
    return r.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

console.log('Aryal Store script.js loaded');
