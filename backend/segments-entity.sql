-- Add entity column to segments (contact | company)
alter table public.segments add column if not exists entity text not null default 'contact';
create index if not exists segments_entity_idx on public.segments (workspace_id, entity);
