-- Run this in Supabase SQL Editor
-- Adds deal owner (assignable sales rep) and product fields to prospects so
-- each deal in the pipeline can show who owns it and what product is being sold.

alter table public.prospects
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

alter table public.prospects
  add column if not exists owner_name text;

alter table public.prospects
  add column if not exists product text;

-- Backfill owner_id and owner_name from created_by so existing deals already
-- have an owner with a readable name. The name is a snapshot at this moment;
-- it will stay current from here on whenever you reassign an owner.
update public.prospects p
  set owner_id = u.id,
      owner_name = coalesce(u.raw_user_meta_data->>'full_name', u.email)
  from auth.users u
  where u.id = p.created_by
    and (p.owner_id is null or p.owner_name is null);

-- Index for fast owner filtering
create index if not exists prospects_owner_idx on public.prospects (owner_id);