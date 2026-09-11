-- Add encrypted Apollo API key to profiles
-- Run this in Supabase SQL Editor

-- 1. Add the column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS apollo_api_key text;

-- 2. Enable RLS (already enabled, but policies need update)
-- Users can only read/write their own profile
CREATE POLICY "Users can update own apollo key" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Done. The column stores the key as text.
-- For production, consider pgcrypto encryption:
--   ALTER TABLE profiles ADD COLUMN apollo_api_key bytea;
--   UPDATE profiles SET apollo_api_key = pgp_sym_encrypt(apollo_api_key, 'your-secret');
