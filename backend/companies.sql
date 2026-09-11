-- Sentery Companies — missing companies table (never existed in this project).
-- Run in Supabase SQL Editor (dashboard → SQL → New query → paste → Run).
-- Idempotent: safe to run multiple times.

-- ─── 1. Companies table ───
create table if not exists public.companies (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  name text not null,
  domain text not null default '',
  industry text not null default '',
  company_size text not null default '',
  annual_revenue text not null default '',
  phone text not null default '',
  address text not null default '',
  city text not null default '',
  region text not null default '',
  country text not null default '',
  description text not null default '',
  logo_url text not null default '',
  linkedin_url text not null default '',
  tags jsonb not null default '[]'::jsonb,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists companies_workspace_idx on public.companies (workspace_id);
create index if not exists companies_name_idx on public.companies (workspace_id, lower(name));
create index if not exists companies_tags_gin on public.companies using gin (tags);

-- ─── 2. Row Level Security (same workspace-membership model as the rest of the CRM) ───
alter table public.companies enable row level security;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists companies_write on public.companies;
create policy companies_write on public.companies
  for all using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  ) with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );