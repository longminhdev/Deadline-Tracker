create table if not exists public.user_integrations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ics_url_encrypted text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deadline_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  external_id text not null,
  source text not null check (source = 'CITD'),
  group_name text,
  course_name text,
  instructor text,
  title text not null,
  due_at timestamptz not null,
  submitted_at timestamptz,
  url text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, external_id)
);

create index if not exists deadline_items_user_due_idx
  on public.deadline_items (user_id, due_at);

alter table public.user_integrations enable row level security;
alter table public.deadline_items enable row level security;

revoke all on public.user_integrations from anon, authenticated;
revoke all on public.deadline_items from anon, authenticated;
grant select, insert, update, delete on public.user_integrations to authenticated;
grant select, insert, update on public.deadline_items to authenticated;

drop policy if exists user_integrations_select_own on public.user_integrations;
create policy user_integrations_select_own
  on public.user_integrations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_integrations_insert_own on public.user_integrations;
create policy user_integrations_insert_own
  on public.user_integrations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_integrations_update_own on public.user_integrations;
create policy user_integrations_update_own
  on public.user_integrations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_integrations_delete_own on public.user_integrations;
create policy user_integrations_delete_own
  on public.user_integrations for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists deadline_items_select_own on public.deadline_items;
create policy deadline_items_select_own
  on public.deadline_items for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists deadline_items_insert_own on public.deadline_items;
create policy deadline_items_insert_own
  on public.deadline_items for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists deadline_items_update_own on public.deadline_items;
create policy deadline_items_update_own
  on public.deadline_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
