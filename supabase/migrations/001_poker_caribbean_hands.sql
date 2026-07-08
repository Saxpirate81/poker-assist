-- Run in Supabase SQL Editor (same project as your other apps)
-- https://supabase.com/dashboard → SQL → New query

create table if not exists poker_caribbean_hands (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  device_id text not null,
  dealer_up_card jsonb,
  player_cards jsonb not null default '[]',
  dealer_cards jsonb default '[]',
  player_hand text,
  dealer_hand text,
  ante numeric not null,
  raise_multiplier numeric not null default 2,
  raise_amount numeric not null default 0,
  progressive_bet numeric not null default 0,
  action text not null check (action in ('raise', 'fold')),
  ai_advice jsonb,
  ai_provider text,
  followed_ai boolean,
  net_result numeric,
  outcome_summary text,
  dealer_qualified boolean,
  player_won boolean
);

create index if not exists poker_caribbean_hands_device_id_idx on poker_caribbean_hands (device_id);
create index if not exists poker_caribbean_hands_created_at_idx on poker_caribbean_hands (created_at desc);

alter table poker_caribbean_hands enable row level security;

-- Open policies for personal / anon use (tighten with auth later)
drop policy if exists "poker_hands_anon_insert" on poker_caribbean_hands;
drop policy if exists "poker_hands_anon_select" on poker_caribbean_hands;

create policy "poker_hands_anon_insert"
  on poker_caribbean_hands for insert to anon with check (true);

create policy "poker_hands_anon_select"
  on poker_caribbean_hands for select to anon using (true);
