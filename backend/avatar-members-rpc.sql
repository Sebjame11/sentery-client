-- Run this in Supabase SQL Editor
-- Extends get_workspace_members to also return each member's avatar URL
-- (from profiles.avatar_url) so avatars render in member lists and pickers.
-- NOTE: must DROP first because the existing function has a different
-- return type and Postgres won't let CREATE OR REPLACE change it.
drop function if exists public.get_workspace_members(bigint);

create or replace function public.get_workspace_members(ws_id bigint)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  avatar_url text,
  is_default boolean,
  created_at timestamptz
)
language sql
security definer set search_path = ''
as $$
  select
    wm.user_id,
    u.email,
    coalesce(p.display_name, u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1)) as full_name,
    wm.role,
    p.avatar_url,
    coalesce(wm.is_default, false) as is_default,
    wm.created_at
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id
  left join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = ws_id
  order by wm.created_at asc;
$$;