-- Set/clear the caller's default workspace without a broad UPDATE RLS policy.
-- SECURITY DEFINER so it works with only SELECT on workspace_members.

create or replace function public.set_default_workspace(target_ws_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.workspace_members
    where user_id = auth.uid() and workspace_id = target_ws_id
  ) then
    raise exception 'Not a member of this workspace';
  end if;

  update public.workspace_members
  set is_default = false
  where user_id = auth.uid() and is_default is true;

  update public.workspace_members
  set is_default = true
  where user_id = auth.uid() and workspace_id = target_ws_id;
end;
$$;

create or replace function public.clear_default_workspace()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.workspace_members
  set is_default = false
  where user_id = auth.uid() and is_default is true;
end;
$$;

grant execute on function public.set_default_workspace(bigint) to authenticated;
grant execute on function public.clear_default_workspace() to authenticated;
