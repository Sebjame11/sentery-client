-- Deals table migration
-- Run this in Supabase SQL Editor

-- 1. Create deals table
CREATE TABLE IF NOT EXISTS public.deals (
    id bigserial PRIMARY KEY,
    workspace_id bigint NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    company_id bigint REFERENCES public.companies(id) ON DELETE SET NULL,
    name text NOT NULL,
    stage text NOT NULL DEFAULT 'lead',
    deal_value numeric DEFAULT 0,
    priority text DEFAULT 'medium',
    close_date date,
    deal_type text DEFAULT '',
    owner_id uuid,
    owner_name text DEFAULT '',
    primary_contact_id bigint REFERENCES public.prospects(id) ON DELETE SET NULL,
    primary_contact_name text DEFAULT '',
    notes text DEFAULT '',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace member access" ON public.deals
    FOR ALL USING (
        workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    );

-- 3. Create index
CREATE INDEX IF NOT EXISTS idx_deals_workspace ON public.deals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_deals_company ON public.deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals(stage);

-- 4. Migrate existing deals from prospects (prospects with stage != 'lead')
INSERT INTO public.deals (workspace_id, company_id, name, stage, deal_value, owner_id, owner_name, primary_contact_name, notes, created_at)
SELECT
    p.workspace_id,
    (SELECT c.id FROM public.companies c WHERE c.workspace_id = p.workspace_id AND LOWER(c.name) = LOWER(p.company) LIMIT 1) as company_id,
    COALESCE(
        (SELECT c.name FROM public.companies c WHERE c.workspace_id = p.workspace_id AND LOWER(c.name) = LOWER(p.company) LIMIT 1),
        p.company,
        p.name
    ) as name,
    p.stage,
    p.deal_value,
    p.owner_id,
    p.owner_name,
    p.name as primary_contact_name,
    p.notes,
    p.created_at
FROM public.prospects p
WHERE p.stage IS NOT NULL
  AND p.stage != 'lead'
  AND p.company IS NOT NULL
  AND p.company != ''
  AND NOT EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.workspace_id = p.workspace_id
        AND d.name = COALESCE(p.company, p.name)
  );

-- 5. Function to create a deal
CREATE OR REPLACE FUNCTION public.create_deal(
    p_workspace_id bigint,
    p_company_id bigint,
    p_name text,
    p_stage text DEFAULT 'lead',
    p_deal_value numeric DEFAULT 0,
    p_priority text DEFAULT 'medium',
    p_close_date date DEFAULT NULL,
    p_deal_type text DEFAULT '',
    p_owner_id uuid DEFAULT NULL,
    p_owner_name text DEFAULT '',
    p_primary_contact_id bigint DEFAULT NULL,
    p_primary_contact_name text DEFAULT '',
    p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_deal jsonb;
BEGIN
    INSERT INTO public.deals (
        workspace_id, company_id, name, stage, deal_value, priority,
        close_date, deal_type, owner_id, owner_name,
        primary_contact_id, primary_contact_name, notes
    ) VALUES (
        p_workspace_id, p_company_id, p_name, p_stage, p_deal_value, p_priority,
        p_close_date, p_deal_type, p_owner_id, p_owner_name,
        p_primary_contact_id, p_primary_contact_name, p_notes
    ) RETURNING to_jsonb(*) INTO v_deal;
    RETURN v_deal;
END;
$$;

-- 6. Function to update a deal
CREATE OR REPLACE FUNCTION public.update_deal(
    p_deal_id bigint,
    p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_deal jsonb;
BEGIN
    UPDATE public.deals SET
        name = COALESCE(p_updates->>'name', name),
        stage = COALESCE(p_updates->>'stage', stage),
        deal_value = COALESCE((p_updates->>'deal_value')::numeric, deal_value),
        priority = COALESCE(p_updates->>'priority', priority),
        close_date = COALESCE((p_updates->>'close_date')::date, close_date),
        deal_type = COALESCE(p_updates->>'deal_type', deal_type),
        owner_id = COALESCE((p_updates->>'owner_id')::uuid, owner_id),
        owner_name = COALESCE(p_updates->>'owner_name', owner_name),
        primary_contact_id = COALESCE((p_updates->>'primary_contact_id')::bigint, primary_contact_id),
        primary_contact_name = COALESCE(p_updates->>'primary_contact_name', primary_contact_name),
        notes = COALESCE(p_updates->>'notes', notes),
        updated_at = now()
    WHERE id = p_deal_id
    RETURNING to_jsonb(*) INTO v_deal;
    RETURN v_deal;
END;
$$;

-- 7. Function to delete a deal
CREATE OR REPLACE FUNCTION public.delete_deal(p_deal_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.deals WHERE id = p_deal_id;
    RETURN '{"ok":true}'::jsonb;
END;
$$;

-- 8. Function to get deals for workspace
CREATE OR REPLACE FUNCTION public.get_deals(p_workspace_id bigint)
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT to_jsonb(d.*) FROM public.deals d WHERE d.workspace_id = p_workspace_id ORDER BY d.created_at DESC;
$$;
