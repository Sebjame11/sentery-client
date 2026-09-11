-- Lead Source column for prospects
-- Run this in Supabase SQL Editor

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS lead_source text DEFAULT '';
