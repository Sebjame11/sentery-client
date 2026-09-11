-- Email Integration — run in Supabase SQL Editor. Idempotent.
-- Backend-only tables (no RLS policies on purpose, like google_tokens):
-- only the backend service role may read/write email data. MCP and the app
-- access it through backend endpoints, never directly.

-- 1. Connected mailboxes (one per workspace)
create table if not exists email_accounts (
  workspace_id bigint primary key references workspaces(id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail', 'microsoft')),
  email text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  auto_logging boolean not null default true,
  sync_window_days integer not null default 30,
  history_id text,
  last_sync_at timestamptz,
  last_sync_error text,
  connected_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table email_accounts enable row level security;

-- 2. Synced messages (matched to CRM contacts)
create table if not exists email_messages (
  id bigserial primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  provider text not null default 'gmail',
  provider_message_id text not null,
  thread_id text not null default '',
  direction text not null check (direction in ('sent', 'received')),
  subject text not null default '',
  snippet text not null default '',
  body_text text not null default '',
  body_html text not null default '',
  from_name text not null default '',
  from_email text not null default '',
  to_emails jsonb not null default '[]'::jsonb,
  cc_emails jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  labels jsonb not null default '[]'::jsonb,
  matched_prospect_ids jsonb not null default '[]'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz default now(),
  unique (workspace_id, provider_message_id)
);
alter table email_messages enable row level security;
create index if not exists email_messages_workspace_idx on email_messages (workspace_id);
create index if not exists email_messages_thread_idx on email_messages (workspace_id, thread_id);
create index if not exists email_messages_sentat_idx on email_messages (workspace_id, sent_at desc);
create index if not exists email_messages_from_idx on email_messages (workspace_id, from_email);

-- 3. Link email activities to the unified touchpoint timeline
alter table touchpoints add column if not exists email_message_id bigint references email_messages(id) on delete set null;
drop index if exists touchpoints_email_msg_idx;
create unique index touchpoints_email_msg_idx on touchpoints (prospect_id, email_message_id) where email_message_id is not null;