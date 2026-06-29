-- ==========================================================
-- Migration: Add users table & exec_sql function
-- Target: Backend Supabase project (eomsbcjoxebmoxchilrx)
-- Run this ONCE in: https://supabase.com/dashboard/project/eomsbcjoxebmoxchilrx/sql/new
-- ==========================================================

-- 1. Create the exec_sql function so future auto-migrations work
CREATE OR REPLACE FUNCTION exec_sql(query_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query_text;
END;
$$;

-- 2. Create the users table (used by /api/users/register, /api/users/login, etc.)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  facebook_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- 3. Grant access (service_role bypasses RLs; anon gets SELECT only for profile lookups)
GRANT SELECT ON TABLE users TO anon, authenticated;
