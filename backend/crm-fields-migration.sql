-- CRM Fields Migration
-- Run in Supabase SQL Editor
-- Adds: first_name, last_name, lifecycle_stage, status to prospects; company_type to companies

-- 1. Prospects: add first_name, last_name, lifecycle_stage, status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='first_name') THEN
    ALTER TABLE prospects ADD COLUMN first_name text default '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='last_name') THEN
    ALTER TABLE prospects ADD COLUMN last_name text default '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='lifecycle_stage') THEN
    ALTER TABLE prospects ADD COLUMN lifecycle_stage text default 'lead';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='status') THEN
    ALTER TABLE prospects ADD COLUMN status text default '';
  END IF;
END $$;

-- 2. Backfill first_name/last_name from name where they're empty
UPDATE prospects
SET first_name = split_part(name, ' ', 1),
    last_name = CASE
      WHEN array_length(string_to_array(name, ' '), 1) > 1
      THEN trim(substring(name from position(' ' in name) + 1))
      ELSE ''
    END
WHERE (first_name = '' OR first_name IS NULL) AND name IS NOT NULL AND name != '';

-- 3. Companies: add company_type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='company_type') THEN
    ALTER TABLE companies ADD COLUMN company_type text default 'prospect';
  END IF;
END $$;

-- 4. Add check constraints (idempotent)
DO $$
BEGIN
  BEGIN ALTER TABLE prospects ADD CONSTRAINT lifecycle_stage_check CHECK (lifecycle_stage IN ('lead','mql','sql','opportunity','client')); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE prospects ADD CONSTRAINT status_check CHECK (status IN ('','new','working','nurture','disqualified')); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE companies ADD CONSTRAINT company_type_check CHECK (company_type IN ('prospect','partner','client','other')); EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
