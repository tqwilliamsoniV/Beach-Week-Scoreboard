-- Beach Week Scoreboard v2 — No Auth Schema
-- Run this ENTIRE file in Supabase SQL Editor.
-- It drops the old auth-based tables and recreates everything cleanly.

-- ─── 1. DROP OLD SCHEMA ───────────────────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_commissioner() cascade;

drop table if exists public.result_entries cascade;
drop table if exists public.game_results cascade;
drop table if exists public.games cascade;
drop table if exists public.users cascade;
drop table if exists public.players cascade;
drop table if exists public.settings cascade;

-- ─── 2. EXTENSIONS ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── 3. TABLES ────────────────────────────────────────────────────────────────

-- Players (no auth.users dependency)
create table public.players (
  id           uuid primary key default uuid_generate_v4(),
  display_name text unique not null,
  is_eligible  boolean default true,
  created_at   timestamptz default now()
);

-- Games catalog
create table public.games (
  id            uuid primary key default uuid_generate_v4(),
  name          text unique not null,
  category      text not null check (category in ('Beach','Pool','Board','Card','Other')),
  scoring_type  text not null check (scoring_type in ('win_loss','placement','margin')),
  weight        numeric(4,2) not null default 1.0 check (weight between 0.5 and 5.0),
  min_players   integer,
  max_players   integer,
  notes         text,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- One row per game session played
create table public.game_results (
  id          uuid primary key default uuid_generate_v4(),
  game_id     uuid not null references public.games(id) on delete cascade,
  logged_by   uuid references public.players(id) on delete set null,
  played_at   timestamptz default now(),
  note        text,
  created_at  timestamptz default now()
);

-- One row per player per game session
create table public.result_entries (
  id            uuid primary key default uuid_generate_v4(),
  result_id     uuid not null references public.game_results(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  placement     integer not null,
  score         numeric,
  team          text,
  points_earned numeric(8,4) not null default 0
);

-- App-wide settings (key/value)
create table public.settings (
  key   text primary key,
  value text not null
);

-- ─── 4. GRANT PUBLIC ACCESS (no auth needed) ──────────────────────────────────
-- Since there's no login, we open up the anon role to read/write everything.
-- The shared URL is the "password" to the app.
grant usage on schema public to anon;
grant select, insert, update, delete on public.players      to anon;
grant select, insert, update, delete on public.games        to anon;
grant select, insert, update, delete on public.game_results to anon;
grant select, insert, update, delete on public.result_entries to anon;
grant select, insert, update, delete on public.settings     to anon;

-- Disable RLS so anon grants work cleanly
alter table public.players        disable row level security;
alter table public.games          disable row level security;
alter table public.game_results   disable row level security;
alter table public.result_entries disable row level security;
alter table public.settings       disable row level security;

-- ─── 5. DEFAULT SETTINGS ──────────────────────────────────────────────────────
insert into public.settings (key, value) values
  ('min_game_threshold', '15'),
  ('bayesian_prior',     '0.4'),
  ('bayesian_c',         '5.0'),
  ('commissioner_pin',   '1234'),
  ('trip_start',         ''),
  ('trip_end',           '');

-- ─── 6. DEFAULT GAMES ─────────────────────────────────────────────────────────
insert into public.games (name, category, scoring_type, weight, min_players, max_players) values
  ('KanJam',          'Beach', 'win_loss',   1.0, 2, 4),
  ('Spikeball',       'Beach', 'margin',     1.5, 2, 4),
  ('Cornhole',        'Beach', 'win_loss',   1.0, 2, 4),
  ('Volleyball',      'Beach', 'win_loss',   1.5, 4, 12),
  ('Ping Pong',       'Pool',  'win_loss',   1.0, 2, 4),
  ('Pool (Billiards)','Pool',  'win_loss',   1.5, 2, 4),
  ('Catan',           'Board', 'placement',  3.0, 3, 6),
  ('Ticket to Ride',  'Board', 'placement',  2.5, 2, 5),
  ('Codenames',       'Board', 'win_loss',   2.0, 4, 10),
  ('Poker Hand',      'Card',  'placement',  2.0, 3, 10);

-- ─── 7. REALTIME ──────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.result_entries;
alter publication supabase_realtime add table public.game_results;
