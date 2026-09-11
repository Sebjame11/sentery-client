-- Add stage_entered_at to deals table
-- Run this in Supabase SQL Editor

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz;

-- Backfill from created_at
UPDATE public.deals SET stage_entered_at = created_at WHERE stage_entered_at IS NULL;

-- Add index for analytics queries
CREATE INDEX IF NOT EXISTS idx_deals_stage_entered ON public.deals(stage_entered_at);
