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
      address TEXT NOT NULL DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
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
}

function table(name) {
  const d = getDb();
  return {
    select(columns = '*') {
      return {
        eq(field, value) {
          return {
            maybeSingle: () => {
              try {
                const row = d.prepare(`SELECT ${columns} FROM ${name} WHERE ${field} = ? LIMIT 1`).get(value);
                return { data: row || null, error: null };
              } catch (err) {
                return { data: null, error: err };
              }
            },
            single: () => {
              try {
                const row = d.prepare(`SELECT ${columns} FROM ${name} WHERE ${field} = ? LIMIT 1`).get(value);
                return { data: row || null, error: null };
              } catch (err) {
                return { data: null, error: err };
              }
            },
            order(column, { ascending } = {}) {
              return {
                limit: (n) => {
                  try {
                    const rows = d.prepare(`SELECT ${columns} FROM ${name} WHERE ${field} = ? ORDER BY ${column} ${ascending === false ? 'DESC' : 'ASC'} LIMIT ?`).all(value, n);
                    return { data: rows, error: null };
                  } catch (err) {
                    return { data: null, error: err };
                  }
                }
              };
            },
            async then(resolve) {
              const result = await this.maybeSingle();
              resolve(result);
            }
          };
        },
        in: (field, values) => {
          const placeholders = values.map(() => '?').join(',');
          try {
            const rows = d.prepare(`SELECT ${columns} FROM ${name} WHERE ${field} IN (${placeholders})`).all(...values);
            return { data: rows, error: null };
          } catch (err) {
            return { data: null, error: err };
          }
        },
        neq(field, value) {
          return this;
        },
        is(field, value) {
          return this;
        },
        like: function() { return this; },
        ilike(field, pattern) {
          return {
            eq: () => this,
            maybeSingle: () => this.maybeSingle(),
            order: () => this
          };
        },
        or(filter) {
          var self = this;
          return {
            maybeSingle: function() {
              try {
                var parts = filter.split(',');
                var conditions = [];
                var params = [];
                for (var i = 0; i < parts.length; i++) {
                  var match = parts[i].match(/^(\w+)\.(eq|neq|gt|gte|lt|lte|like|ilike)\.(.+)$/);
                  if (match) {
                    var field = match[1];
                    var op = match[2];
                    var val = match[3];
                    if (op === 'eq') {
                      conditions.push(field + ' = ?');
                      params.push(val);
                    } else if (op === 'ilike' || op === 'like') {
                      conditions.push(field + ' LIKE ?');
                      params.push(val.replace(/%/g, '%'));
                    }
                  }
                }
                if (conditions.length) {
                  var row = d.prepare('SELECT ' + columns + ' FROM ' + name + ' WHERE (' + conditions.join(' OR ') + ') LIMIT 1').get(...params);
                  return { data: row || null, error: null };
                }
                var row = d.prepare('SELECT ' + columns + ' FROM ' + name + ' LIMIT 1').get();
                return { data: row || null, error: null };
              } catch (err) {
                return { data: null, error: err };
              }
            },
            order: function() { return self; },
            eq: function() { return self; },
            ilike: function() { return self; }
          };
        },
        limit: (n) => {
          try {
            const rows = d.prepare(`SELECT ${columns} FROM ${name} LIMIT ?`).all(n);
            return { data: rows, error: null };
          } catch (err) {
            return { data: null, error: err };
          }
        },
        order(column, { ascending } = {}) {
          return {
            limit: (n) => {
              try {
                const rows = d.prepare(`SELECT ${columns} FROM ${name} ORDER BY ${column} ${ascending === false ? 'DESC' : 'ASC'} LIMIT ?`).all(n);
                return { data: rows, error: null };
              } catch (err) {
                return { data: null, error: err };
              }
            }
          };
        },
        then(resolve) {
          return this.maybeSingle().then(resolve);
        }
      };
    },
    insert(data) {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map(() => '?').join(',');
      try {
        const stmt = d.prepare(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${placeholders})`);
        stmt.run(...values);
        return { data: data, error: null };
      } catch (err) {
        return { data: null, error: err };
      }
    },
    update(updates) {
      return {
        eq: (field, value) => {
          try {
            const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(',');
            const values = [...Object.values(updates), value];
            d.prepare(`UPDATE ${name} SET ${setClauses} WHERE ${field} = ?`).run(...values);
            return { error: null };
          } catch (err) {
            return { error: err };
          }
        },
        in: (field, values) => {
          try {
            const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(',');
            const placeholders = values.map(() => '?').join(',');
            d.prepare(`UPDATE ${name} SET ${setClauses} WHERE ${field} IN (${placeholders})`).run(...Object.values(updates), ...values);
            return { error: null };
          } catch (err) {
            return { error: err };
          }
        }
      };
    },
    delete() {
      return {
        eq: (field, value) => {
          try {
            d.prepare(`DELETE FROM ${name} WHERE ${field} = ?`).run(value);
            return { error: null };
          } catch (err) {
            return { error: err };
          }
        },
        in: (field, values) => {
          try {
            const placeholders = values.map(() => '?').join(',');
            d.prepare(`DELETE FROM ${name} WHERE ${field} IN (${placeholders})`).run(...values);
            return { error: null };
          } catch (err) {
            return { error: err };
          }
        }
      };
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
