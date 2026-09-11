-- Add deal_id column to touchpoints so we can log activities against deals
ALTER TABLE public.touchpoints ADD COLUMN IF NOT EXISTS deal_id BIGINT REFERENCES public.deals(id) ON DELETE CASCADE;

-- Index for fast lookups by deal_id
CREATE INDEX IF NOT EXISTS idx_touchpoints_deal_id ON public.touchpoints(deal_id);

-- Update RLS to allow deal touchpoints
-- (existing policy should work if user owns the workspace, but let's be safe)
