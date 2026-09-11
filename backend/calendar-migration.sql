-- Calendar events table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.calendar_events (
    id bigserial PRIMARY KEY,
    workspace_id bigint NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text DEFAULT '',
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    all_day boolean DEFAULT false,
    color text DEFAULT '#4B7B5B',
    linked_prospect_id bigint REFERENCES public.prospects(id) ON DELETE SET NULL,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace member access" ON public.calendar_events
    FOR ALL USING (
        workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace ON public.calendar_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_dates ON public.calendar_events(starts_at, ends_at);
