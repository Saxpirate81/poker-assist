-- Allow anon delete for testing / hand management (same device rows only)
drop policy if exists "poker_hands_anon_delete" on poker_caribbean_hands;

create policy "poker_hands_anon_delete"
  on poker_caribbean_hands for delete to anon using (true);
