-- Sentery Segments — Advanced Contact Segmentation.
-- Run in Supabase SQL Editor (dashboard → SQL → New query → paste → Run).
-- Idempotent: safe to run multiple times.
-- The backend service role runs the segment engine; RLS below covers direct client access.

-- ─── 1. Segments table (rules are JSON, evaluated live at query time) ───
create table if not exists public.segments (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  rules jsonb not null default '{"logic":"ALL","conditions":[]}'::jsonb,
  is_favorite boolean not null default false,
  is_preset boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists segments_workspace_idx on public.segments (workspace_id, archived_at);

-- ─── 2. Custom field definitions (values already live in prospects.custom_fields) ───
create table if not exists public.custom_fields (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  name text not null,
  type text not null default 'text',            -- text | number | date | select | checkbox
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists custom_fields_workspace_idx on public.custom_fields (workspace_id);

-- ─── 3. Tasks (bulk action + task-based conditions) ───
create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  prospect_id bigint not null references public.prospects(id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'open',          -- open | done
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_prospect_idx on public.tasks (prospect_id);
create index if not exists tasks_workspace_status_idx on public.tasks (workspace_id, status, due_date);

-- ─── 4. Prospect columns used by segment conditions ───
alter table public.prospects add column if not exists updated_at timestamptz default now();
alter table public.prospects add column if not exists industry text;
alter table public.prospects add column if not exists lead_source text;
alter table public.prospects add column if not exists city text;
alter table public.prospects add column if not exists province text;
alter table public.prospects add column if not exists expected_close_date date;

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists prospects_set_updated_at on public.prospects;
create trigger prospects_set_updated_at
  before update on public.prospects
  for each row execute function public.set_updated_at();

-- ─── 5. Indexes for large contact databases ───
create index if not exists prospects_workspace_idx on public.prospects (workspace_id);
create index if not exists prospects_stage_idx on public.prospects (workspace_id, stage);
create index if not exists prospects_tier_idx on public.prospects (workspace_id, tier);
create index if not exists prospects_deal_value_idx on public.prospects (workspace_id, deal_value);
create index if not exists prospects_created_idx on public.prospects (workspace_id, created_at);
create index if not exists prospects_updated_idx on public.prospects (workspace_id, updated_at);
create index if not exists prospects_industry_idx on public.prospects (workspace_id, industry);
create index if not exists prospects_tags_gin on public.prospects using gin (tags);
create index if not exists prospects_custom_fields_gin on public.prospects using gin (custom_fields);
create index if not exists prospects_countries_gin on public.prospects using gin (countries);
create index if not exists touchpoints_prospect_idx on public.touchpoints (prospect_id);
create index if not exists touchpoints_channel_date_idx on public.touchpoints (channel, date);

-- ─── 6. Row Level Security (same workspace-membership model as the rest of the CRM) ───
alter table public.segments enable row level security;
alter table public.custom_fields enable row level security;
alter table public.tasks enable row level security;

drop policy if exists segments_select on public.segments;
create policy segments_select on public.segments
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists segments_write on public.segments;
create policy segments_write on public.segments
  for all using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  ) with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists custom_fields_select on public.custom_fields;
create policy custom_fields_select on public.custom_fields
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists custom_fields_write on public.custom_fields;
create policy custom_fields_write on public.custom_fields
  for all using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  ) with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks
  for all using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  ) with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- ─── 7. Preset segments (seeded once per workspace; users can edit/delete these) ───
-- ─── 8. segment_query(text, jsonb) — run compiled segment SQL ───
-- The engine builds a full parameterized query and binds $1..$n values via
-- this function. SECURITY DEFINER, but execution is revoked from every role
-- except service_role (the backend), so it is never reachable by clients.
create or replace function public.segment_query(query text, params jsonb default '[]'::jsonb)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q text := query;
  i int;
  v jsonb;
begin
  -- Replace from the HIGHEST param index down so $10 is bound before $1
  -- can corrupt it (replace('$10', ...) would otherwise rewrite $1's prefix).
  for i in reverse jsonb_array_length(params) .. 1 loop
    v := params->(i - 1);
    if v is null or jsonb_typeof(v) = 'null' then
      q := replace(q, '$' || i::text, 'NULL');
    elsif jsonb_typeof(v) = 'string' then
      q := replace(q, '$' || i::text, quote_literal(v #>> '{}'));
    elsif jsonb_typeof(v) = 'number' then
      q := replace(q, '$' || i::text, v #>> '{}');
    elsif jsonb_typeof(v) = 'boolean' then
      q := replace(q, '$' || i::text, case when v #>> '{}' = 'true' then 'true' else 'false' end);
    elsif jsonb_typeof(v) = 'array' then
      q := replace(q, '$' || i::text,
        'ARRAY[' || (select string_agg(quote_literal(x), ',' order by ord) from jsonb_array_elements_text(v) with ordinality as t(x, ord)) || ']');
    else
      q := replace(q, '$' || i::text, 'NULL');
    end if;
  end loop;
  -- Wrap whatever SELECT the engine produced as a single jsonb column per row,
  -- so any result shape (counts, contact lists, etc.) matches setof jsonb.
  return query execute 'select to_jsonb(t) from (' || q || ') t';
end;
$$;

revoke execute on function public.segment_query(text, jsonb) from public, anon, authenticated;
grant execute on function public.segment_query(text, jsonb) to service_role;

-- ─── 9. Preset segments (seeded once per workspace; users can edit/delete these) ───
insert into public.segments (workspace_id, name, description, rules, is_preset, created_by)
select w.id, p.name, p.description, p.rules::jsonb, true, null
from public.workspaces w
cross join (values
  ('New Leads', 'Newly created leads from the last 30 days',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is","value":"lead"},{"field":"created_at","op":"within_days","value":30}]}'),
  ('Hot Leads', 'Hot-tier prospects with an open pipeline',
   '{"logic":"ALL","conditions":[{"field":"tier","op":"is","value":"hot"},{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"}]}'),
  ('High-Value Leads', 'Open deals worth $50K or more',
   '{"logic":"ALL","conditions":[{"field":"deal_value","op":"gte","value":50000},{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"}]}'),
  ('No Contact 7+ Days', 'Active prospects not contacted in over a week',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"},{"field":"last_activity","op":"older_than","value":7}]}'),
  ('No Contact 14+ Days', 'Active prospects not contacted in over two weeks',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"},{"field":"last_activity","op":"older_than","value":14}]}'),
  ('No Contact 30+ Days', 'Active prospects not contacted in over a month',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"},{"field":"last_activity","op":"older_than","value":30}]}'),
  ('Active Opportunities', 'Deals actively moving through the pipeline',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"in","value":["meeting","proposal","negotiation"]},{"field":"deal_value","op":"gt","value":0}]}'),
  ('At-Risk Opportunities', 'Active deals with no contact in 14+ days',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"in","value":["meeting","proposal","negotiation"]},{"field":"last_activity","op":"older_than","value":14}]}'),
  ('Recently Contacted', 'Prospects reached out to in the last week',
   '{"logic":"ALL","conditions":[{"field":"last_activity","op":"within_days","value":7}]}'),
  ('Unresponsive Contacts', 'Email sent but no reply in 7+ days',
   '{"logic":"ALL","conditions":[{"field":"email_count","op":"gt","value":0},{"field":"response_count","op":"eq","value":0},{"field":"last_email","op":"older_than","value":7}]}'),
  ('Overdue Follow-Ups', 'Open deals that need a follow-up now',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"},{"field":"last_activity","op":"older_than","value":5}]}'),
  ('Customers', 'Won deals — your customers',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is","value":"won"}]}'),
  ('Former Customers', 'Lost deals that previously generated revenue',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is","value":"lost"},{"field":"deal_value","op":"gt","value":0}]}')
) as p(name, description, rules)
where not exists (
  select 1 from public.segments s where s.workspace_id = w.id and s.is_preset = true
);