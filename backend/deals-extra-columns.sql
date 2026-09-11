-- Add missing columns from HubSpot deal export
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS associated_call text DEFAULT '';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS closed_lost_reason text DEFAULT '';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS closed_won_reason text DEFAULT '';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS last_contacted timestamptz;
