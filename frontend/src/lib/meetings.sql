-- Run this in Supabase SQL Editor
-- Meetings feature: booking links per workspace + Google Calendar sync

-- 1. Workspaces: booking columns
alter table workspaces add column if not exists booking_slug text unique;
alter table workspaces add column if not exists booking_name text;
alter table workspaces add column if not exists booking_logo_url text;
alter table workspaces add column if not exists booking_message text;
alter table workspaces add column if not exists booking_enabled boolean default false;
alter table workspaces add column if not exists booking_availability jsonb default '{
  "timezone": "America/New_York",
  "days": [1,2,3,4,5],
  "start": "09:00",
  "end": "17:00",
  "duration": 30,
  "buffer": 15,
  "slot_step": 30
}';

-- 2. Google OAuth tokens (per workspace). NO RLS policies on purpose:
--    only the backend (service role) may read/write tokens.
create table if not exists google_tokens (
  workspace_id bigint primary key references workspaces(id) on delete cascade,
  email text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  calendar_id text default 'primary',
  connected_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table google_tokens enable row level security;

-- 3. Meetings
create table if not exists meetings (
  id bigserial primary key,
  workspace_id bigint references workspaces(id) on delete cascade,
  prospect_id bigint references prospects(id) on delete cascade,
  guest_name text not null,
  guest_email text not null,
  guest_company text,
  guest_notes text,
  guest_timezone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  google_event_id text,
  location text,
  created_at timestamptz default now()
);
alter table meetings enable row level security;

-- RLS: meetings readable/updatable (cancel) by workspace members.
-- Inserts/deletes happen via backend service role only.
create policy "Members can view meetings" on meetings
  for select using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

create policy "Members can update meetings" on meetings
  for update using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );
