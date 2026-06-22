-- 補助金管理ツール用テーブル定義
-- Supabase 管理画面 → SQL Editor にこの内容を貼り付けて Run すれば一式できます。
-- 何度実行しても安全（冪等）です。
-- ※ フリーミアムSaaS版：各ユーザーは「自分のデータ」だけ閲覧・編集できる（user_id でデータ分離）。

-- 1. 補助金 本体 -------------------------------------------------------------
create table if not exists public.subsidies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid() references auth.users(id) on delete cascade, -- 所有者
  name        text        not null default '',  -- 補助金の名前
  department  text        not null default '',  -- 該当部署
  deadline    date,                             -- 申請期限
  applied     boolean     not null default false, -- 申請したか
  applied_at  timestamptz,                      -- 申請の確認日時
  decision    boolean     not null default false, -- 決定通知書（受領したか）
  decision_at timestamptz,                      -- 決定通知書の確認日時
  paid        boolean     not null default false, -- 振込確認
  paid_at     timestamptz,                      -- 振込の確認日時
  note        text        not null default '',  -- メモ
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 既存テーブルにも所有者カラムを追加（後から導入する場合の移行）
alter table public.subsidies
  add column if not exists user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;

-- 2. 後追いの提出物（補助金ごとに 0 個以上） ----------------------------------
create table if not exists public.followups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade, -- 所有者
  subsidy_id  uuid not null references public.subsidies(id) on delete cascade,
  name        text not null default '',  -- 提出物の名前（実績報告書 等）
  due_date    date,                      -- 提出期限
  done        boolean not null default false, -- 提出したか
  done_at     timestamptz,               -- 提出の確認日時
  created_at  timestamptz not null default now()
);
alter table public.followups
  add column if not exists user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;

create index if not exists followups_subsidy_id_idx on public.followups(subsidy_id);
create index if not exists subsidies_user_id_idx    on public.subsidies(user_id);
create index if not exists followups_user_id_idx    on public.followups(user_id);

-- 3. RLS（行レベルセキュリティ）を有効化 -------------------------------------
alter table public.subsidies enable row level security;
alter table public.followups enable row level security;

-- 4. 各ユーザーは「自分のデータ（user_id = 自分）」だけ全操作できる -----------
--    未ログイン（anon）はアクセス不可。他人のデータも一切見えない。
drop policy if exists "authenticated full access subsidies" on public.subsidies; -- 旧：全員に全データ許可（社内ツール版）を除去
drop policy if exists "own rows subsidies" on public.subsidies;
create policy "own rows subsidies"
  on public.subsidies for all
  to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "authenticated full access followups" on public.followups; -- 旧ポリシー除去
drop policy if exists "own rows followups" on public.followups;
create policy "own rows followups"
  on public.followups for all
  to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5. ベースアップ評価料の月次管理データ（ユーザーごとに1件・JSONでまとめて保存） -----
create table if not exists public.baseup_state (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.baseup_state enable row level security;
drop policy if exists "own baseup_state" on public.baseup_state;
create policy "own baseup_state"
  on public.baseup_state for all
  to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
