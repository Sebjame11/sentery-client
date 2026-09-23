-- Run in CLIENT Supabase SQL Editor: https://supabase.com/dashboard/project/ekadvezzodagusteoyrv/sql/new

-- ─── Workspace activity log ───
create table if not exists public.activity_log (
  id bigserial primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_name text,
  summary text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists activity_log_ws_created_idx on public.activity_log (workspace_id, created_at desc);
create index if not exists activity_log_user_idx on public.activity_log (user_id, created_at desc);

-- ─── Row Level Security: any member sees all workspace activity ───
alter table public.activity_log enable row level security;

drop policy if exists "Members can view activity" on public.activity_log;
create policy "Members can view activity" on public.activity_log
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists "Members can log activity" on public.activity_log;
create policy "Members can log activity" on public.activity_log
  for insert with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- ─── Auto-prune: remove activity older than 90 days (called by backend daily) ───
create or replace function public.prune_activity_log(days integer default 90)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.activity_log
  where created_at < now() - make_interval(days => days);
  get diagnostics removed = row_count;
  return removed;
end;
$$;