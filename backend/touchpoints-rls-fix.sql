-- Fix RLS on touchpoints: allow inserts where deal_id is set
DROP POLICY IF EXISTS "touchpoints_insert_deal_or_prospect" ON public.touchpoints;
DROP POLICY IF EXISTS "touchpoints_select_own" ON public.touchpoints;

CREATE POLICY "touchpoints_insert_deal_or_prospect" ON public.touchpoints
  FOR INSERT TO authenticated
  WITH CHECK ((prospect_id IS NOT NULL) OR (deal_id IS NOT NULL));

CREATE POLICY "touchpoints_select_own" ON public.touchpoints
  FOR SELECT TO authenticated USING (true);
