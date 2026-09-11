-- ─── Due Diligence migration ───
-- Run this in Supabase SQL Editor.
-- Standalone feature: only adds new structures. No existing tables are modified.

-- 1. Create investigations table
CREATE TABLE IF NOT EXISTS public.due_diligence_investigations (
    id bigserial PRIMARY KEY,
    workspace_id bigint NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    entity_type text NOT NULL CHECK (entity_type IN ('organization', 'individual')),
    entity_name text NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'researching', 'processing', 'completed', 'failed')),
    overall_risk text CHECK (overall_risk IN ('low', 'medium', 'elevated', 'high')),
    summary text DEFAULT '',
    research_result jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Enable RLS (same convention as deals/prospects: workspace member access)
ALTER TABLE public.due_diligence_investigations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace member access" ON public.due_diligence_investigations
    FOR ALL USING (
        workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    );

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_dd_inv_workspace ON public.due_diligence_investigations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dd_inv_user ON public.due_diligence_investigations(user_id);
CREATE INDEX IF NOT EXISTS idx_dd_inv_created ON public.due_diligence_investigations(created_at DESC);

-- 4. updated_at trigger (safe: only touches the new table)
CREATE OR REPLACE FUNCTION public.dd_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dd_inv_updated_at ON public.due_diligence_investigations;
CREATE TRIGGER trg_dd_inv_updated_at
    BEFORE UPDATE ON public.due_diligence_investigations
    FOR EACH ROW EXECUTE FUNCTION public.dd_set_updated_at();
