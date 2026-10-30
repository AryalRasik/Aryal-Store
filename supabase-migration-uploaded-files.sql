-- Persist admin-uploaded images across Vercel deployments.
-- Vercel's /tmp storage is temporary, so uploaded product photos must live in
-- Supabase. If SUPABASE_SERVICE_ROLE_KEY is set, uploads use Supabase Storage
-- (bucket: product-images). Otherwise they fall back to this table.

CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_data TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE uploaded_files DISABLE ROW LEVEL SECURITY;
