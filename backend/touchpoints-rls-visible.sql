-- Fix touchpoint RLS so MCP/AI logs are visible in the app.
-- Deal-only rows (prospect_id IS NULL) were invisible: old policy required
-- prospect_id IN (member's prospects), which is never true for deal touchpoints.
-- Run in Supabase SQL Editor (client project ekadvezzodagusteoyrv).

DROP POLICY IF EXISTS "Members can view touchpoints" ON public.touchpoints;
DROP POLICY IF EXISTS "Members can insert touchpoints" ON public.touchpoints;
DROP POLICY IF EXISTS "Members can update touchpoints" ON public.touchpoints;
DROP POLICY IF EXISTS "Members can delete touchpoints" ON public.touchpoints;
DROP POLICY IF EXISTS "touchpoints_select_own" ON public.touchpoints;
DROP POLICY IF EXISTS "touchpoints_insert_deal_or_prospect" ON public.touchpoints;

CREATE POLICY "Members can view touchpoints" ON public.touchpoints
  FOR SELECT TO authenticated
  USING (
    (prospect_id IS NOT NULL AND prospect_id IN (
      SELECT p.id FROM public.prospects p
      WHERE p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    ))
    OR (deal_id IS NOT NULL AND deal_id IN (
      SELECT d.id FROM public.deals d
      WHERE d.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    ))
    OR (workspace_id IS NOT NULL AND workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Members can insert touchpoints" ON public.touchpoints
  FOR INSERT TO authenticated
  WITH CHECK (
    (prospect_id IS NOT NULL AND prospect_id IN (
      SELECT p.id FROM public.prospects p
      WHERE p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    ))
    OR (deal_id IS NOT NULL AND deal_id IN (
      SELECT d.id FROM public.deals d
      WHERE d.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    ))
    OR (workspace_id IS NOT NULL AND workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Members can update touchpoints" ON public.touchpoints
  FOR UPDATE TO authenticated
  USING (
    (prospect_id IS NOT NULL AND prospect_id IN (
      SELECT p.id FROM public.prospects p
      WHERE p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    ))
    OR (deal_id IS NOT NULL AND deal_id IN (
      SELECT d.id FROM public.deals d
      WHERE d.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    ))
    OR (workspace_id IS NOT NULL AND workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Members can delete touchpoints" ON public.touchpoints
  FOR DELETE TO authenticated
  USING (
    (prospect_id IS NOT NULL AND prospect_id IN (
      SELECT p.id FROM public.prospects p
      WHERE p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    ))
    OR (deal_id IS NOT NULL AND deal_id IN (
      SELECT d.id FROM public.deals d
      WHERE d.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    ))
    OR (workspace_id IS NOT NULL AND workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    ))
  );
