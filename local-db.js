const Database = require('better-sqlite3');
const path = require('path');

// On Vercel the deployment filesystem is read-only — SQLite must live in /tmp.
const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'aryal_store.db')
  : path.join(__dirname, 'aryal_store.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate();
  }
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      facebook_id TEXT DEFAULT '',
      profile_picture TEXT DEFAULT '',
      email_verified_at TEXT,
      email_verification_token TEXT DEFAULT '',
      remember_token TEXT DEFAULT '',
      last_login_at TEXT,
      login_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      auth_provider TEXT DEFAULT '',
      auth_provider_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    CREATE TABLE IF NOT EXISTS user_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT 'Home',
      full_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      district TEXT DEFAULT '',
      municipality TEXT DEFAULT '',
      ward TEXT DEFAULT '',
      tole TEXT DEFAULT '',
      landmark TEXT DEFAULT '',
      zip_code TEXT DEFAULT '',
      country TEXT DEFAULT 'Nepal',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id);
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      token TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      token TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT '',
      token TEXT NOT NULL DEFAULT '',
      refresh_token TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      is_valid INTEGER DEFAULT 1,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_activity_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
    CREATE TABLE IF NOT EXISTS user_cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT '',
      session_id TEXT DEFAULT '',
      product_id TEXT NOT NULL DEFAULT '0',
      quantity INTEGER NOT NULL DEFAULT 1,
      size TEXT DEFAULT '',
      color TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_user_cart_user ON user_cart(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_cart_session ON user_cart(session_id);
  `);

  migrateOrderTables();

  const addressCols = db.prepare('PRAGMA table_info(user_addresses)').all().map(c => c.name);
  const addressAdds = [
    { name: 'email', def: "TEXT DEFAULT ''" },
    { name: 'district', def: "TEXT DEFAULT ''" },
    { name: 'municipality', def: "TEXT DEFAULT ''" },
    { name: 'ward', def: "TEXT DEFAULT ''" },
    { name: 'tole', def: "TEXT DEFAULT ''" },
    { name: 'landmark', def: "TEXT DEFAULT ''" }
  ];
  for (const col of addressAdds) {
    if (!addressCols.includes(col.name)) {
      db.exec(`ALTER TABLE user_addresses ADD COLUMN ${col.name} ${col.def}`);
    }
  }
}

function ensureColumns(tableName, defs) {
  const existing = db.prepare('PRAGMA table_info(' + tableName + ')').all().map(c => c.name);
  for (const col of defs) {
    if (!existing.includes(col.name)) {
      db.exec('ALTER TABLE ' + tableName + ' ADD COLUMN ' + col.name + ' ' + col.def);
    }
  }
}

function migrateOrderTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT,
      tracking_token TEXT DEFAULT '',
      customer_name TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '',
      customer_email TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
      customer_city TEXT DEFAULT '',
      customer_state TEXT DEFAULT '',
      customer_landmark TEXT DEFAULT '',
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      coupon_code TEXT DEFAULT '',
      shipping_cost REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      shipping_method TEXT DEFAULT '',
      delivery_label TEXT DEFAULT '',
      delivery_fee REAL DEFAULT 0,
      delivery_eta TEXT DEFAULT '',
      status TEXT DEFAULT 'REQUESTED',
      payment_method TEXT DEFAULT '',
      payment_status TEXT DEFAULT 'UNPAID',
      paid_amount REAL DEFAULT 0,
      refund_amount REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      admin_notes TEXT DEFAULT '',
      offer_status TEXT DEFAULT 'none',
      offer_revision INTEGER DEFAULT 0,
      offer_expires_at TEXT DEFAULT '',
      approved_at TEXT DEFAULT '',
      declined_at TEXT DEFAULT '',
      cancel_reason TEXT DEFAULT '',
      cancelled_by TEXT DEFAULT '',
      stock_reserved INTEGER DEFAULT 0,
      idempotency_key TEXT DEFAULT '',
      payment_reference TEXT DEFAULT '',
      payment_submitted_at TEXT DEFAULT '',
      payment_verified_at TEXT DEFAULT '',
      payment_note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      product_id TEXT,
      product_name TEXT DEFAULT '',
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      size TEXT DEFAULT '',
      color TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS order_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      status TEXT DEFAULT '',
      type TEXT DEFAULT 'status',
      actor TEXT DEFAULT 'system',
      visible INTEGER DEFAULT 1,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS order_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      revision INTEGER DEFAULT 1,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      delivery_method TEXT DEFAULT '',
      delivery_label TEXT DEFAULT '',
      delivery_fee REAL DEFAULT 0,
      delivery_eta TEXT DEFAULT '',
      total REAL DEFAULT 0,
      payment_method TEXT DEFAULT '',
      payment_methods TEXT DEFAULT '',
      message TEXT DEFAULT '',
      status TEXT DEFAULT 'sent',
      created_at TEXT DEFAULT (datetime('now')),
      responded_at TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS order_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      amount REAL DEFAULT 0,
      reason TEXT DEFAULT '',
      method TEXT DEFAULT '',
      reference TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT ''
    );
  `);

  // Bring legacy local tables up to the current column set.
  ensureColumns('orders', [
    { name: 'order_code', def: 'TEXT' },
    { name: 'tracking_token', def: "TEXT DEFAULT ''" },
    { name: 'customer_name', def: "TEXT DEFAULT ''" },
    { name: 'customer_phone', def: "TEXT DEFAULT ''" },
    { name: 'customer_email', def: "TEXT DEFAULT ''" },
    { name: 'customer_address', def: "TEXT DEFAULT ''" },
    { name: 'customer_city', def: "TEXT DEFAULT ''" },
    { name: 'customer_state', def: "TEXT DEFAULT ''" },
    { name: 'customer_landmark', def: "TEXT DEFAULT ''" },
    { name: 'subtotal', def: 'REAL DEFAULT 0' },
    { name: 'discount', def: 'REAL DEFAULT 0' },
    { name: 'coupon_code', def: "TEXT DEFAULT ''" },
    { name: 'shipping_cost', def: 'REAL DEFAULT 0' },
    { name: 'total_amount', def: 'REAL DEFAULT 0' },
    { name: 'shipping_method', def: "TEXT DEFAULT ''" },
    { name: 'delivery_label', def: "TEXT DEFAULT ''" },
    { name: 'delivery_fee', def: 'REAL DEFAULT 0' },
    { name: 'delivery_eta', def: "TEXT DEFAULT ''" },
    { name: 'status', def: "TEXT DEFAULT 'REQUESTED'" },
    { name: 'payment_method', def: "TEXT DEFAULT ''" },
    { name: 'payment_status', def: "TEXT DEFAULT 'UNPAID'" },
    { name: 'paid_amount', def: 'REAL DEFAULT 0' },
    { name: 'refund_amount', def: 'REAL DEFAULT 0' },
    { name: 'notes', def: "TEXT DEFAULT ''" },
    { name: 'admin_notes', def: "TEXT DEFAULT ''" },
    { name: 'offer_status', def: "TEXT DEFAULT 'none'" },
    { name: 'offer_revision', def: 'INTEGER DEFAULT 0' },
    { name: 'offer_expires_at', def: "TEXT DEFAULT ''" },
    { name: 'approved_at', def: "TEXT DEFAULT ''" },
    { name: 'declined_at', def: "TEXT DEFAULT ''" },
    { name: 'cancel_reason', def: "TEXT DEFAULT ''" },
    { name: 'cancelled_by', def: "TEXT DEFAULT ''" },
    { name: 'stock_reserved', def: 'INTEGER DEFAULT 0' },
    { name: 'idempotency_key', def: "TEXT DEFAULT ''" },
    { name: 'payment_reference', def: "TEXT DEFAULT ''" },
    { name: 'payment_submitted_at', def: "TEXT DEFAULT ''" },
    { name: 'payment_verified_at', def: "TEXT DEFAULT ''" },
    { name: 'payment_note', def: "TEXT DEFAULT ''" },
    { name: 'created_at', def: "TEXT DEFAULT ''" },
    { name: 'updated_at', def: "TEXT DEFAULT ''" }
  ]);
  ensureColumns('order_items', [
    { name: 'order_id', def: 'INTEGER' },
    { name: 'product_id', def: 'TEXT' },
    { name: 'product_name', def: "TEXT DEFAULT ''" },
    { name: 'quantity', def: 'INTEGER DEFAULT 1' },
    { name: 'unit_price', def: 'REAL DEFAULT 0' },
    { name: 'size', def: "TEXT DEFAULT ''" },
    { name: 'color', def: "TEXT DEFAULT ''" }
  ]);
  ensureColumns('order_tracking', [
    { name: 'order_id', def: 'INTEGER' },
    { name: 'status', def: "TEXT DEFAULT ''" },
    { name: 'type', def: "TEXT DEFAULT 'status'" },
    { name: 'actor', def: "TEXT DEFAULT 'system'" },
    { name: 'visible', def: 'INTEGER DEFAULT 1' },
    { name: 'note', def: "TEXT DEFAULT ''" },
    { name: 'created_at', def: "TEXT DEFAULT ''" }
  ]);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(idempotency_key) WHERE idempotency_key <> '';
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_tracking_order ON order_tracking(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_offers_order ON order_offers(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_refunds_order ON order_refunds(order_id);
  `);
}

function table(name) {
  const d = getDb();
  return {
    select(columns = '*', options = {}) {
      const q = { conditions: [], orGroups: [], orders: [], limitValue: null };
      const opMap = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };

      const buildWhere = () => {
        const params = [];
        let whereSql = '';
        if (q.conditions.length) {
          whereSql = q.conditions.map(c => {
            if (c.op === 'in') {
              params.push(...c.value);
              return `${c.field} IN (${c.value.map(() => '?').join(',')})`;
            }
            if (c.op === 'ilike' || c.op === 'like') {
              params.push(`%${c.value}%`);
              return `${c.field} LIKE ?`;
            }
            if (c.op === 'is') {
              if (c.value === null) return `${c.field} IS NULL`;
              params.push(c.value);
              return `${c.field} IS ?`;
            }
            if (c.op === 'not_is') {
              if (c.value === null) return `${c.field} IS NOT NULL`;
              params.push(c.value);
              return `${c.field} IS NOT ?`;
            }
            if (c.op === 'not_eq') {
              params.push(c.value);
              return `${c.field} != ?`;
            }
            params.push(c.value);
            return `${c.field} ${opMap[c.op] || '='} ?`;
          }).join(' AND ');
        }
        if (q.orGroups.length) {
          const orSql = q.orGroups.map(g => {
            const conds = g.split(',').map(p => {
              const m = p.match(/^(\w+)\.(eq|neq|gt|gte|lt|lte|like|ilike)\.(.+)$/);
              if (!m) return null;
              const field = m[1], op = m[2], val = m[3];
              if (op === 'ilike' || op === 'like') {
                params.push(`%${val.replace(/%/g, '')}%`);
                return `${field} LIKE ?`;
              }
              params.push(val);
              return `${field} ${opMap[op] || '='} ?`;
            }).filter(Boolean);
            return '(' + conds.join(' OR ') + ')';
          });
          whereSql += (whereSql ? ' AND ' : '') + orSql.join(' AND ');
        }
        return { whereSql, params };
      };

      const run = (single) => {
        const { whereSql, params } = buildWhere();
        try {
          if (options && options.head) {
            let countSql = `SELECT COUNT(*) AS count FROM ${name}`;
            if (whereSql) countSql += ' WHERE ' + whereSql;
            const row = d.prepare(countSql).get(...params);
            return { data: null, count: (row && row.count) || 0, error: null };
          }
          let sql = `SELECT ${columns} FROM ${name}`;
          if (whereSql) sql += ' WHERE ' + whereSql;
          if (q.orders.length) {
            sql += ' ORDER BY ' + q.orders.map(o => `${o.column} ${o.ascending === false ? 'DESC' : 'ASC'}`).join(', ');
          }
          if (q.limitValue != null) sql += ` LIMIT ${Number(q.limitValue)}`;
          if (single && q.limitValue == null) sql += ' LIMIT 1';
          if (single) {
            const row = d.prepare(sql).get(...params);
            return { data: row || null, error: null };
          }
          const rows = d.prepare(sql).all(...params);
          return { data: rows, error: null };
        } catch (err) {
          return { data: null, error: err };
        }
      };

      const chain = {
        eq(field, value) { q.conditions.push({ field, op: 'eq', value }); return chain; },
        neq(field, value) { q.conditions.push({ field, op: 'neq', value }); return chain; },
        gt(field, value) { q.conditions.push({ field, op: 'gt', value }); return chain; },
        gte(field, value) { q.conditions.push({ field, op: 'gte', value }); return chain; },
        lt(field, value) { q.conditions.push({ field, op: 'lt', value }); return chain; },
        lte(field, value) { q.conditions.push({ field, op: 'lte', value }); return chain; },
        is(field, value) { q.conditions.push({ field, op: 'is', value }); return chain; },
        not(field, op, value) { q.conditions.push({ field, op: 'not_' + op, value }); return chain; },
        in(field, values) { q.conditions.push({ field, op: 'in', value: values || [] }); return chain; },
        like(field, value) { q.conditions.push({ field, op: 'like', value }); return chain; },
        ilike(field, value) { q.conditions.push({ field, op: 'ilike', value }); return chain; },
        or(filter) { q.orGroups.push(filter); return chain; },
        order(column, opts = {}) { q.orders.push({ column, ascending: opts.ascending }); return chain; },
        limit(n) { q.limitValue = n; return chain; },
        maybeSingle() { return Promise.resolve(run(true)); },
        single() { return Promise.resolve(run(true)); },
        then(resolve, reject) { return Promise.resolve(run(false)).then(resolve, reject); }
      };
      return chain;
    },
    insert(data) {
      const keys = Object.keys(data);
      const values = Object.values(data).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v);
      const placeholders = keys.map(() => '?').join(',');
      try {
        const stmt = d.prepare(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${placeholders})`);
        const info = stmt.run(...values);
        const id = info.lastInsertRowid;
        const row = d.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(id);
        return { data: [row || data], error: null };
      } catch (err) {
        return { data: null, error: err };
      }
    },
    update(updates) {
      const conds = [];
      const opMap = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      const buildWhere = (params) => conds.map(c => {
        if (c.op === 'in') {
          const placeholders = c.value.map(() => '?').join(',');
          params.push(...c.value);
          return `${c.field} IN (${placeholders})`;
        }
        params.push(c.value);
        return `${c.field} ${opMap[c.op] || '='} ?`;
      }).join(' AND ');
      const run = () => {
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(',');
        const params = [...Object.values(updates).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v)];
        const where = buildWhere(params);
        d.prepare(`UPDATE ${name} SET ${setClauses}${where ? ' WHERE ' + where : ''}`).run(...params);
        return { error: null };
      };
      const addOp = (op) => (field, value) => { conds.push({ field, op, value }); return chain; };
      const chain = {
        eq: addOp('eq'),
        neq: addOp('neq'),
        gt: addOp('gt'),
        gte: addOp('gte'),
        lt: addOp('lt'),
        lte: addOp('lte'),
        in(field, values) { conds.push({ field, op: 'in', value: values || [] }); return chain; },
        then(resolve, reject) {
          try { resolve(run()); } catch (e) { reject(e); }
        }
      };
      return chain;
    },
    delete() {
      const conds = [];
      const opMap = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      const run = () => {
        const params = [];
        const where = conds.map(c => {
          if (c.op === 'in') {
            const placeholders = c.value.map(() => '?').join(',');
            params.push(...c.value);
            return `${c.field} IN (${placeholders})`;
          }
          params.push(c.value);
          return `${c.field} ${opMap[c.op] || '='} ?`;
        }).join(' AND ');
        d.prepare(`DELETE FROM ${name}${where ? ' WHERE ' + where : ''}`).run(...params);
        return { error: null };
      };
      const addOp = (op) => (field, value) => { conds.push({ field, op, value }); return chain; };
      const chain = {
        eq: addOp('eq'),
        neq: addOp('neq'),
        gt: addOp('gt'),
        gte: addOp('gte'),
        lt: addOp('lt'),
        lte: addOp('lte'),
        in(field, values) { conds.push({ field, op: 'in', value: values || [] }); return chain; },
        then(resolve, reject) {
          try { resolve(run()); } catch (e) { reject(e); }
        }
      };
      return chain;
    }
  };
}

function from(name) {
  return table(name);
}

function rpc(name, params) {
  return { data: null, error: { message: 'RPC not available in local mode' } };
}

module.exports = { getDb, table, from, rpc };
