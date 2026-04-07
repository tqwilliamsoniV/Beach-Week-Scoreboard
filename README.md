# 🏖️ Beach Week Scoreboard

A full-stack web app for tracking family game results during a beach trip. Features a live leaderboard, three award categories, and a step-by-step game logging flow optimized for mobile.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres + Auth + Realtime) · Tailwind CSS · Vercel

---

## Features

- **Live leaderboard** with three tabs: Champion (Bayesian-adjusted win rate), Iron Man (most games), MVP (total points)
- **Step-by-step game logging** — pick game → pick players → enter result → submit. Under 30 seconds on mobile
- **Three scoring types:** Win/Loss, Full Placement (1st/2nd/3rd), and Margin/Score (auto-calculates winner + margin bonus)
- **Team game support** — assign players to Team A or B before submitting
- **Commissioner admin panel** — manage games, weights, players, settings, and delete results
- **Real-time updates** — leaderboard refreshes instantly across all devices via Supabase Realtime
- **Persistent sessions** — stay logged in for the full 8-day trip without re-authenticating

---

## Quick Setup (about 30 minutes)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Note your **Project URL** and **anon key** (Settings → API)
3. Also copy the **service_role key** (keep this secret — server only)

### 2. Run the database schema

1. In Supabase, go to **SQL Editor**
2. Paste the entire contents of `supabase/schema.sql`
3. Click **Run**

This creates all tables, default games, RLS policies, and the Realtime subscription.

### 3. Configure Supabase Auth

In Supabase → **Authentication → Settings**:
- **Site URL:** set to your Vercel deployment URL (or `http://localhost:3000` for local dev)
- **Disable email confirmations:** Authentication → Email → turn off "Confirm email"
- **Session expiry:** set to `691200` seconds (8 days)

### 4. Set environment variables

```bash
cp .env.local.example .env.local
# Fill in your Supabase URL, anon key, and service role key
```

### 5. Deploy to Vercel

```bash
npx vercel --prod
```

Add the three environment variables in Vercel's project settings (Settings → Environment Variables).

### 6. Set your account as commissioner

After creating your account in the app, run this in Supabase SQL Editor:

```sql
UPDATE public.users
SET is_commissioner = true
WHERE display_name = 'Your Name Here';
```

### 7. Share the URL

Send the Vercel URL to all family members. They create accounts via the Register page. No email verification required.

---

## Scoring Formula

| Placement | Points |
|-----------|--------|
| 1st / Winner | 1.0 × game weight |
| 2nd place | 0.6 × game weight (placement games only) |
| 3rd place | 0.3 × game weight (placement games only) |
| Loss / Other | 0 pts |

**Margin bonus** (score games like Spikeball):
```
bonus = (win_score - lose_score) / win_score × 0.25 × weight
```
Capped at `0.25 × weight`.

**Bayesian-adjusted win rate** (prevents low-game players from topping Champion tab):
```
adjusted = (total_points + 5.0 × 0.4) / (total_possible + 5.0)
```

---

## Local Development

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Default Games (pre-loaded)

| Game | Category | Scoring | Weight |
|------|----------|---------|--------|
| KanJam | Beach | Win/Loss | 1.0 |
| Spikeball | Beach | Score/Margin | 1.5 |
| Cornhole | Beach | Win/Loss | 1.0 |
| Volleyball | Beach | Win/Loss | 1.5 |
| Ping Pong | Pool | Win/Loss | 1.0 |
| Pool (Billiards) | Pool | Win/Loss | 1.5 |
| Catan | Board | Full Placement | 3.0 |
| Ticket to Ride | Board | Full Placement | 2.5 |
| Codenames | Board | Win/Loss | 2.0 |
| Poker Hand | Card | Full Placement | 2.0 |

Commissioner can add, edit, or delete games from the Admin Panel before or during the trip.
