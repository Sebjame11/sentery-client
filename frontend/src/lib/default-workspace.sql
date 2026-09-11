-- Add is_default to workspace_members
alter table public.workspace_members add column if not exists is_default boolean default false;

-- Ensure only one default per user (trigger)
create or replace function public.set_single_default_workspace()
returns trigger as $$
begin
  if NEW.is_default = true then
    update public.workspace_members
    set is_default = false
    where user_id = NEW.user_id
      and workspace_id != NEW.workspace_id
      and is_default = true;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_single_default on public.workspace_members;
create trigger trg_single_default
  before insert or update on public.workspace_members
  for each row execute function public.set_single_default_workspace();
