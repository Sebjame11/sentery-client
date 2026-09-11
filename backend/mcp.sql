-- Sentery MCP — OAuth + tokens. Run in Supabase SQL Editor.
-- Tables are accessed by the backend service role (no RLS needed for server-side auth checks).

create table if not exists public.mcp_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_secret_hash text,
  client_name text,
  client_uri text,
  redirect_uris jsonb not null default '[]'::jsonb,
  confidential boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id bigint not null,
  code_challenge text not null,
  redirect_uri text not null,
  scope text not null default 'sentery:read sentery:write',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mcp_codes_hash_idx on public.mcp_codes (code_hash);

create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  access_hash text not null unique,
  refresh_hash text not null unique,
  client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id bigint not null,
  scope text not null default 'sentery:read sentery:write',
  expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mcp_tokens_access_hash_idx on public.mcp_tokens (access_hash);
create index if not exists mcp_tokens_refresh_hash_idx on public.mcp_tokens (refresh_hash);
