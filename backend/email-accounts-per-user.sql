-- Run this in Supabase SQL Editor
-- Makes email accounts per-user instead of per-workspace, so each workspace
-- member can sync (and only see) their own Gmail.
--
-- Safe to re-run. Existing accounts are attributed by matching the connected
-- Gmail address to the user's signup email; anything that cannot be attributed
-- (signup email differs from the Gmail) is removed and that member just
-- re-connects their Gmail once.

-- 1) Owner column on accounts
alter table public.email_accounts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2) Drop the old single-account-per-workspace primary key (if still present)
alter table public.email_accounts
  drop constraint if exists email_accounts_pkey;

-- 3) Attribute existing accounts to the user whose signup email matches the connected Gmail
update public.email_accounts a
  set user_id = u.id
  from auth.users u
  where lower(u.email) = lower(a.email)
    and a.user_id is null;

-- 4) Owner column on messages, backfilled from the account that synced them
alter table public.email_messages
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.email_messages m
  set user_id = a.user_id
  from public.email_accounts a
  where a.workspace_id = m.workspace_id
    and m.user_id is null;

-- 5) Remove anything that could not be attributed to a real user.
--    No one can see it anyway (all queries filter by user), and keeping
--    unattributable tokens/mail around is a privacy risk.
delete from public.email_accounts where user_id is null;
delete from public.email_messages where user_id is null;

-- 6) Enforce one account per (workspace, user). A unique index (not a PK) so
--    rows without an owner can never block this migration.
create unique index if not exists email_accounts_ws_user_uq
  on public.email_accounts (workspace_id, user_id);

-- 7) Indexes for per-user lookups
create index if not exists email_accounts_user_idx on public.email_accounts (user_id);
create index if not exists email_messages_user_idx on public.email_messages (user_id);
create index if not exists email_messages_ws_user_idx on public.email_messages (workspace_id, user_id);