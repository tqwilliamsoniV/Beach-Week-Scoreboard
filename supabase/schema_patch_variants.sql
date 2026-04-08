-- Run this patch in the Supabase SQL Editor
-- It adds game variants and a variant_label field to game_results

-- Game variants (e.g. "Spikeball to 11", "Spikeball to 21")
create table if not exists game_variants (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  label      text not null,
  sort_order int  not null default 0,
  created_at timestamptz default now()
);

grant all on game_variants to anon;

-- Store which variant was played (text so it survives variant deletion)
alter table game_results
  add column if not exists variant_label text;
