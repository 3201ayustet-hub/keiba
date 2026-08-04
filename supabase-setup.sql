-- HORSE BET BATTLE / Supabase 初期設定
-- Supabase Dashboard > SQL Editor に全体を貼り付けて Run してください。

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{"competitions":[]}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.app_state is '競馬馬券勝負アプリの共有状態';
comment on column public.app_state.data is '勝負・参加者・レース・入力内容をまとめたJSONデータ';

insert into public.app_state (id, data, revision)
values ('main', '{"competitions":[]}'::jsonb, 0)
on conflict (id) do nothing;

alter table public.app_state enable row level security;

drop policy if exists "public can read app state" on public.app_state;
create policy "public can read app state"
on public.app_state
for select
to anon, authenticated
using (true);

drop policy if exists "public can insert app state" on public.app_state;
create policy "public can insert app state"
on public.app_state
for insert
to anon, authenticated
with check (id = 'main');

drop policy if exists "public can update app state" on public.app_state;
create policy "public can update app state"
on public.app_state
for update
to anon, authenticated
using (id = 'main')
with check (id = 'main');

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.app_state to anon, authenticated;

-- Realtimeを有効化します。既に追加済みの場合もエラーにならないようにしています。
do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception
  when duplicate_object then null;
end $$;

select id, data, revision, updated_at from public.app_state;
