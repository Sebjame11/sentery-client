-- Run this in Supabase SQL Editor
-- Helper function to look up a user by email (for invites)
create or replace function public.get_user_id_by_email(target_email text)
returns uuid
language sql
security definer set search_path = ''
as $$
  select id from auth.users where email = target_email;
$$;

-- Function to add a member to a workspace (used by admins)
create or replace function public.add_workspace_member(ws_id bigint, target_email text, member_role text default 'member')
returns json
language plpgsql
security definer set search_path = ''
as $$
declare
  target_user uuid;
  current_role text;
begin
  -- Check caller is admin
  select role into current_role from public.workspace_members
  where workspace_id = ws_id and user_id = auth.uid();
  if current_role is null then
    return json_build_object('error', 'Not a member of this workspace');
  end if;
  if current_role != 'admin' then
    return json_build_object('error', 'Only admins can invite members');
  end if;

  -- Look up user
  target_user := public.get_user_id_by_email(target_email);
  if target_user is null then
    return json_build_object('error', 'No user found with that email. They need to sign up first.');
  end if;

  -- Check not already a member
  if exists (select 1 from public.workspace_members where workspace_id = ws_id and user_id = target_user) then
    return json_build_object('error', 'Already a member of this workspace');
  end if;

  -- Add member
  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (ws_id, target_user, member_role, auth.uid());

  return json_build_object('success', true, 'user_id', target_user);
end;
$$;
