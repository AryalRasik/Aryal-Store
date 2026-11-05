'use strict';

const { from } = require('../db');

function normalizeId(value) {
  const id = String(value === null || value === undefined ? '' : value).trim();
  return id || '';
}

async function listActive() {
  const { data, error } = await from('delivery_locations')
    .select('*')
    .eq('is_active', 1)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function listAll() {
  const { data, error } = await from('delivery_locations')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getActiveById(id) {
  const locationId = normalizeId(id);
  if (!locationId) return null;
  const { data, error } = await from('delivery_locations')
    .select('*')
    .eq('id', locationId)
    .eq('is_active', 1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function composeAddress(location, details) {
  const base = String((location && location.address) || '').trim();
  const d = details || {};
  const parts = [];
  const house = String(d.address_details || d.house_details || d.tole || '').trim();
  const ward = String(d.ward || '').trim();
  const landmark = String(d.landmark || '').trim();
  if (house) parts.push(house);
  if (ward) parts.push(/^ward\b/i.test(ward) ? ward : 'Ward ' + ward);
  if (landmark && landmark !== house) parts.push(landmark);
  if (base) parts.push(base);
  return parts.filter(Boolean).join(', ');
}

async function cleanupUnmatchedAddresses() {
  const active = await listActive();
  const activeIds = new Set(active.map(function (row) { return normalizeId(row.id); }));
  if (!activeIds.size) return { removed: 0, kept: 0 };

  let removed = 0;
  let kept = 0;
  const tables = ['user_addresses', 'saved_addresses'];

  for (const table of tables) {
    let rows;
    try {
      const result = await from(table).select('id, delivery_location_id');
      if (result.error) throw result.error;
      rows = result.data || [];
    } catch (err) {
      if (/does not exist|no such table|column/i.test(err.message || '')) continue;
      throw err;
    }

    for (const row of rows) {
      const locationId = normalizeId(row.delivery_location_id);
      if (locationId && activeIds.has(locationId)) {
        kept += 1;
        continue;
      }
      const result = await from(table).delete().eq('id', row.id);
      if (result.error) throw result.error;
      removed += 1;
    }
  }

  return { removed: removed, kept: kept };
}

module.exports = {
  listActive,
  listAll,
  getActiveById,
  composeAddress,
  cleanupUnmatchedAddresses
};
