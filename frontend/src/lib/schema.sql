-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/akwinvaacrcpmjgkpjjl/sql/new)

-- 1. Workspaces
create table workspaces (
  id bigserial primary key,
  name text not null,
  slug text unique not null,
  created_at timestamptz default now(),
  company_profile jsonb default '{}' -- {company_name, website, industry, description, products[], logo_url, competitors[{name,category,threat,notes}], market_position, last_analyzed}
);

-- 2. Workspace members
create table workspace_members (
  id bigserial primary key,
  workspace_id bigint references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  invited_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique(workspace_id, user_id)
);

-- 3. Profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- 4. Prospects
create table prospects (
  id bigserial primary key,
  workspace_id bigint references workspaces(id) on delete cascade,
  name text not null,
  title text,
  company text,
  email text,
  phone text,
  linkedin text,
  tier text default 'cold' check (tier in ('cold', 'warm', 'hot')),
  stage text default 'lead' check (stage in ('lead', 'contacted', 'engaged', 'meeting', 'proposal', 'negotiation', 'won', 'lost')),
  deal_value numeric default 0,
  stage_entered_at date,
  angle text,
  notes text,
  outcome_reason text,
  lost_to_competitor text,
  won_against_competitor text,
  tags jsonb default '[]',
  custom_fields jsonb default '{}',
  countries jsonb default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 5. Touchpoints
create table touchpoints (
  id bigserial primary key,
  prospect_id bigint references prospects(id) on delete cascade,
  channel text,
  note text,
  outcome text,
  date date default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 6. Templates
create table templates (
  id bigserial primary key,
  workspace_id bigint references workspaces(id) on delete cascade,
  name text not null,
  subject text,
  body text,
  category text default 'Cold Email',
  use_count integer default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 7. Sequences
create table sequences (
  id bigserial primary key,
  workspace_id bigint references workspaces(id) on delete cascade,
  name text not null,
  steps jsonb default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 8. Notes
create table notes (
  id bigserial primary key,
  workspace_id bigint references workspaces(id) on delete cascade,
  title text,
  content text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Enable RLS
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table profiles enable row level security;
alter table prospects enable row level security;
alter table touchpoints enable row level security;
alter table templates enable row level security;
alter table sequences enable row level security;
alter table notes enable row level security;

-- RLS: Workspaces
create policy "Users can view their workspaces" on workspaces
  for select using (
    id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

create policy "Admins can update their workspace" on workspaces
  for update using (
    id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'admin')
  );

-- RLS: Workspace members
create policy "Members can view workspace members" on workspace_members
  for select using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

-- RLS: Profiles
create policy "Users can view their own profile" on profiles
  for select using (id = auth.uid());
create policy "Users can insert their own profile" on profiles
  for insert with check (id = auth.uid());
create policy "Users can update their own profile" on profiles
  for update using (id = auth.uid());

-- RLS: Prospects
create policy "Members can view prospects" on prospects
  for select using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );
create policy "Members can insert prospects" on prospects
  for insert with check (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );
create policy "Members can update prospects" on prospects
  for update using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );
create policy "Members can delete prospects" on prospects
  for delete using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

-- RLS: Touchpoints
create policy "Members can view touchpoints" on touchpoints
  for select using (
    prospect_id in (select id from prospects where workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()))
  );
create policy "Members can insert touchpoints" on touchpoints
  for insert with check (
    prospect_id in (select id from prospects where workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()))
  );
create policy "Members can update touchpoints" on touchpoints
  for update using (
    prospect_id in (select id from prospects where workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()))
  );
create policy "Members can delete touchpoints" on touchpoints
  for delete using (
    prospect_id in (select id from prospects where workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()))
  );

-- RLS: Templates
create policy "Members can view templates" on templates
  for select using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
create policy "Members can insert templates" on templates
  for insert with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
create policy "Members can update templates" on templates
  for update using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
create policy "Members can delete templates" on templates
  for delete using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

-- RLS: Sequences
create policy "Members can view sequences" on sequences
  for select using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
create policy "Members can insert sequences" on sequences
  for insert with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
create policy "Members can update sequences" on sequences
  for update using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
create policy "Members can delete sequences" on sequences
  for delete using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

-- RLS: Notes
create policy "Members can view notes" on notes
  for select using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
create policy "Members can insert notes" on notes
  for insert with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
create policy "Members can update notes" on notes
  for update using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
create policy "Members can delete notes" on notes
  for delete using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

-- Auto-create profile + workspace on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  ws_id bigint;
  user_display_name text;
begin
  user_display_name := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1));

  insert into public.profiles (id, display_name)
  values (new.id, user_display_name);

  insert into public.workspaces (name, slug)
  values (user_display_name || ' Workspace', 'ws-' || substr(md5(new.id::text), 1, 12))
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'admin');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
