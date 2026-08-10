-- HORSE BET BATTLE / Supabase 初期設定（完全版）
-- Supabase Dashboard > SQL Editor に全体を貼り付けて Run してください。

begin;

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{"competitions":[]}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint app_state_main_only check (id = 'main'),
  constraint app_state_data_is_object check (jsonb_typeof(data) = 'object')
);

comment on table public.app_state is '競馬馬券勝負アプリの共有データ';
comment on column public.app_state.data is '勝負・参加者・レース・入力内容をまとめたJSON';
comment on column public.app_state.revision is '複数端末の同時更新検知に使用するリビジョン';

insert into public.app_state (id, data, revision)
values ('main', '{"competitions":[]}'::jsonb, 0)
on conflict (id) do nothing;

alter table public.app_state enable row level security;

-- ログインなしで利用するため、公開キーから main 行のみ読み書きを許可します。
drop policy if exists "horse battle public select" on public.app_state;
create policy "horse battle public select"
on public.app_state
for select
to anon, authenticated
using (id = 'main');

drop policy if exists "horse battle public insert" on public.app_state;
create policy "horse battle public insert"
on public.app_state
for insert
to anon, authenticated
with check (id = 'main');

drop policy if exists "horse battle public update" on public.app_state;
create policy "horse battle public update"
on public.app_state
for update
to anon, authenticated
using (id = 'main')
with check (id = 'main');

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.app_state to anon, authenticated;

commit;

-- 成功確認：Resultsに main が1行表示されれば完了です。
select id, revision, updated_at, data
from public.app_state
where id = 'main';
