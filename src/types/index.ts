export type ScoringType = 'win_loss' | 'placement' | 'margin'
export type GameCategory = 'Beach' | 'Pool' | 'Board' | 'Card' | 'Other'

export interface User {
  id: string
  display_name: string
  is_commissioner: boolean
  is_eligible: boolean
  created_at: string
}

export interface Game {
  id: string
  name: string
  category: GameCategory
  scoring_type: ScoringType
  weight: number
  min_players: number | null
  max_players: number | null
  notes: string | null
  is_active: boolean
  created_at: string
}

export interface GameResult {
  id: string
  game_id: string
  logged_by: string
  played_at: string
  note: string | null
  created_at: string
  games?: Game
  result_entries?: ResultEntry[]
  logger?: User
}

export interface ResultEntry {
  id: string
  result_id: string
  player_id: string
  placement: number
  score: number | null
  team: string | null
  points_earned: number
  users?: User
}

export interface Settings {
  min_game_threshold: number
  bayesian_prior: number
  bayesian_c: number
  trip_start: string
  trip_end: string
}

// Computed stats for the leaderboard
export interface PlayerStats {
  player: User
  games_played: number
  wins: number
  total_points: number
  total_possible_points: number
  raw_win_rate: number
  adjusted_win_rate: number  // Bayesian-adjusted
}

export type LeaderboardTab = 'champion' | 'ironman' | 'mvp'
