-- Drop old trigger/function that's no longer needed
drop trigger if exists on_profile_created on public.profiles;
drop function if exists public.create_personal_workspace;

-- Replace the handle_new_user function (create or replace)
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

-- Attach it to auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: create profiles/workspaces for users who signed up before the fix
insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
from auth.users
where id not in (select id from public.profiles)
on conflict (id) do nothing;

insert into public.workspaces (name, slug)
select coalesce(p.display_name, 'My Workspace') || ' Workspace', 'ws-' || substr(md5(p.id::text), 1, 12)
from public.profiles p
where not exists (
  select 1 from public.workspace_members wm where wm.user_id = p.id
);

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, p.id, 'admin'
from public.profiles p
join public.workspaces w on w.slug = 'ws-' || substr(md5(p.id::text), 1, 12)
where not exists (
  select 1 from public.workspace_members wm where wm.user_id = p.id
);

-- Add Apollo API key column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS apollo_api_key text;
