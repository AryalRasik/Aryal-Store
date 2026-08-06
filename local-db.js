const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'aryal_store.db');
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

function table(name) {
  const d = getDb();
  return {
    select(columns = '*') {
      const q = { conditions: [], orGroups: [], orders: [], limitValue: null };
      const opMap = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };

      const run = (single) => {
        let sql = `SELECT ${columns} FROM ${name}`;
        const params = [];
        if (q.conditions.length) {
          const where = q.conditions.map(c => {
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
            params.push(c.value);
            return `${c.field} ${opMap[c.op] || '='} ?`;
          }).join(' AND ');
          sql += ' WHERE ' + where;
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
          sql += (q.conditions.length ? ' AND ' : ' WHERE ') + orSql.join(' AND ');
        }
        if (q.orders.length) {
          sql += ' ORDER BY ' + q.orders.map(o => `${o.column} ${o.ascending === false ? 'DESC' : 'ASC'}`).join(', ');
        }
        if (q.limitValue != null) sql += ` LIMIT ${Number(q.limitValue)}`;
        if (single && q.limitValue == null) sql += ' LIMIT 1';
        try {
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
        is(field, value) { q.conditions.push({ field, op: 'is', value }); return chain; },
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
      const run = () => {
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(',');
        const params = [...Object.values(updates).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v)];
        const where = conds.map(c => {
          if (c.op === 'in') {
            const placeholders = c.value.map(() => '?').join(',');
            params.push(...c.value);
            return `${c.field} IN (${placeholders})`;
          }
          params.push(c.value);
          return `${c.field} = ?`;
        }).join(' AND ');
        d.prepare(`UPDATE ${name} SET ${setClauses} WHERE ${where}`).run(...params);
        return { error: null };
      };
      const chain = {
        eq(field, value) { conds.push({ field, value }); return chain; },
        in(field, values) { conds.push({ field, op: 'in', value: values || [] }); return chain; },
        then(resolve, reject) {
          try { resolve(run()); } catch (e) { reject(e); }
        }
      };
      return chain;
    },
    delete() {
      const conds = [];
      const run = () => {
        const params = [];
        const where = conds.map(c => {
          if (c.op === 'in') {
            const placeholders = c.value.map(() => '?').join(',');
            params.push(...c.value);
            return `${c.field} IN (${placeholders})`;
          }
          params.push(c.value);
          return `${c.field} = ?`;
        }).join(' AND ');
        d.prepare(`DELETE FROM ${name} WHERE ${where}`).run(...params);
        return { error: null };
      };
      const chain = {
        eq(field, value) { conds.push({ field, value }); return chain; },
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
