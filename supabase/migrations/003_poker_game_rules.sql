-- Updatable game rules knowledge for AI coach (pay tables, house rules, strategy)
create table if not exists public.poker_game_rules (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  rules_json jsonb not null,
  source text not null default 'remote',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists poker_game_rules_game_updated_idx
  on public.poker_game_rules (game_id, updated_at desc);

alter table public.poker_game_rules enable row level security;

create policy "Allow anon read game rules"
  on public.poker_game_rules for select
  to anon, authenticated
  using (true);

create policy "Allow anon insert game rules"
  on public.poker_game_rules for insert
  to anon, authenticated
  with check (true);
