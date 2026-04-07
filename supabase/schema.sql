-- Beach Week Scoreboard — Supabase Schema
-- Run this entire file in the Supabase SQL editor after creating your project.

-- ─── 1. EXTENSIONS ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── 2. TABLES ────────────────────────────────────────────────────────────────

-- Public user profile (extends auth.users)
create table public.users (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text unique not null,
  is_commissioner  boolean default false,
  is_eligible      boolean default true,   -- false = excluded from award rankings
  created_at       timestamptz default now()
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
  logged_by   uuid not null references public.users(id),
  played_at   timestamptz default now(),
  note        text,
  created_at  timestamptz default now()
);

-- One row per player per game session
create table public.result_entries (
  id            uuid primary key default uuid_generate_v4(),
  result_id     uuid not null references public.game_results(id) on delete cascade,
  player_id     uuid not null references public.users(id) on delete cascade,
  placement     integer not null,           -- 1 = winner, 2 = 2nd, etc.
  score         numeric,                    -- raw score for margin games
  team          text,                       -- 'A' or 'B' for team games
  points_earned numeric(8,4) not null default 0
);

-- App-wide settings (key/value)
create table public.settings (
  key   text primary key,
  value text not null
);

-- ─── 3. DEFAULT SETTINGS ──────────────────────────────────────────────────────
insert into public.settings (key, value) values
  ('min_game_threshold', '15'),
  ('bayesian_prior',     '0.4'),
  ('bayesian_c',         '5.0'),
  ('trip_start',         ''),
  ('trip_end',           '');

-- ─── 4. DEFAULT GAMES ─────────────────────────────────────────────────────────
insert into public.games (name, category, scoring_type, weight, min_players, max_players) values
  ('KanJam',         'Beach', 'win_loss',   1.0, 2, 4),
  ('Spikeball',      'Beach', 'margin',     1.5, 2, 4),
  ('Cornhole',       'Beach', 'win_loss',   1.0, 2, 4),
  ('Volleyball',     'Beach', 'win_loss',   1.5, 4, 12),
  ('Ping Pong',      'Pool',  'win_loss',   1.0, 2, 4),
  ('Pool (Billiards)','Pool', 'win_loss',   1.5, 2, 4),
  ('Catan',          'Board', 'placement',  3.0, 3, 6),
  ('Ticket to Ride', 'Board', 'placement',  2.5, 2, 5),
  ('Codenames',      'Board', 'win_loss',   2.0, 4, 10),
  ('Poker Hand',     'Card',  'placement',  2.0, 3, 10);

-- ─── 5. ROW-LEVEL SECURITY ────────────────────────────────────────────────────
alter table public.users          enable row level security;
alter table public.games          enable row level security;
alter table public.game_results   enable row level security;
alter table public.result_entries enable row level security;
alter table public.settings       enable row level security;

-- Helper: is the current user a commissioner?
create or replace function public.is_commissioner()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select is_commissioner from public.users where id = auth.uid()),
    false
  );
$$;

-- users
create policy "Users can view all profiles"
  on public.users for select using (true);

create policy "Users can insert their own profile"
  on public.users for insert with check (id = auth.uid());

create policy "Users can update their own profile"
  on public.users for update using (id = auth.uid());

create policy "Commissioner can update any profile"
  on public.users for update using (public.is_commissioner());

create policy "Commissioner can delete profiles"
  on public.users for delete using (public.is_commissioner());

-- games
create policy "Anyone can view active games"
  on public.games for select using (true);

create policy "Commissioner can insert games"
  on public.games for insert with check (public.is_commissioner());

create policy "Commissioner can update games"
  on public.games for update using (public.is_commissioner());

create policy "Commissioner can delete games"
  on public.games for delete using (public.is_commissioner());

-- game_results
create policy "Anyone can view results"
  on public.game_results for select using (true);

create policy "Logged-in users can insert results"
  on public.game_results for insert with check (auth.uid() is not null);

create policy "Commissioner can delete any result"
  on public.game_results for delete using (public.is_commissioner());

-- result_entries
create policy "Anyone can view result entries"
  on public.result_entries for select using (true);

create policy "Logged-in users can insert result entries"
  on public.result_entries for insert with check (auth.uid() is not null);

create policy "Commissioner can delete result entries"
  on public.result_entries for delete using (public.is_commissioner());

-- settings
create policy "Anyone can view settings"
  on public.settings for select using (true);

create policy "Commissioner can modify settings"
  on public.settings for all using (public.is_commissioner());

-- ─── 6. TRIGGER: Auto-create user profile on signup ──────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── 7. REALTIME ──────────────────────────────────────────────────────────────
-- Enable realtime for leaderboard updates
alter publication supabase_realtime add table public.result_entries;
alter publication supabase_realtime add table public.game_results;
