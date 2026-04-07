import type { ResultEntry, Game, PlayerStats, Player } from '@/types'

/** Points a player earns based on placement and game weight */
export function calcPlacementPoints(
  placement: number,
  game: Pick<Game, 'scoring_type' | 'weight'>
): number {
  const w = Number(game.weight)
  if (placement === 1) return 1.0 * w
  if (game.scoring_type === 'placement') {
    if (placement === 2) return 0.6 * w
    if (placement === 3) return 0.3 * w
  }
  return 0
}

/** Margin bonus added to the winner's points for margin/score games */
export function calcMarginBonus(
  winScore: number,
  loseScore: number,
  game: Pick<Game, 'weight'>
): number {
  if (winScore <= 0) return 0
  const margin = (winScore - loseScore) / winScore
  const bonus = margin * 0.25 * Number(game.weight)
  return Math.min(bonus, 0.25 * Number(game.weight))
}

/** Full points for a single result entry (placement + optional margin bonus) */
export function calcEntryPoints(
  entry: Pick<ResultEntry, 'placement' | 'score'>,
  game: Game,
  allEntries: Pick<ResultEntry, 'placement' | 'score'>[]
): number {
  const base = calcPlacementPoints(entry.placement, game)
  if (game.scoring_type !== 'margin' || entry.placement !== 1) return base

  // Find the loser's score for margin games
  const loserEntry = allEntries.find(e => e.placement === 2)
  if (!loserEntry || entry.score == null || loserEntry.score == null) return base

  return base + calcMarginBonus(Number(entry.score), Number(loserEntry.score), game)
}

/** Bayesian-adjusted win rate */
export function calcAdjustedRate(
  totalPoints: number,
  totalPossible: number,
  prior = 0.4,
  c = 5.0
): number {
  return (totalPoints + c * prior) / (totalPossible + c)
}

/**
 * Compute leaderboard stats for all players from raw result_entries data.
 * `results` must include `.games` and `.result_entries[].users`.
 */
export function computeLeaderboard(
  players: Player[],
  resultEntries: (ResultEntry & { game_result?: { game_id: string; played_at: string }; games?: Game })[],
  allGames: Map<string, Game>,
  prior = 0.4,
  c = 5.0
): PlayerStats[] {
  const statsMap = new Map<string, {
    games_played: number
    wins: number
    total_points: number
    total_possible: number
  }>()

  for (const player of players) {
    statsMap.set(player.id, { games_played: 0, wins: 0, total_points: 0, total_possible: 0 })
  }

  // Group entries by result_id to get all entries for each game session
  const byResult = new Map<string, ResultEntry[]>()
  for (const entry of resultEntries as ResultEntry[]) {
    if (!byResult.has(entry.result_id)) byResult.set(entry.result_id, [])
    byResult.get(entry.result_id)!.push(entry)
  }

  for (const [, entries] of byResult) {
    // We need the game for this result — find it from any entry (they share result_id)
    const firstEntry = entries[0] as ResultEntry & { game_result?: { game_id: string } }
    if (!firstEntry) continue

    for (const entry of entries) {
      const s = statsMap.get(entry.player_id)
      if (!s) continue
      s.games_played++
      if (entry.placement === 1) s.wins++
      s.total_points += Number(entry.points_earned)
      // total_possible: what a winner would earn (1.0 × weight + possible margin bonus cap)
      // We approximate by storing points_earned for winners only — but spec says "sum of game weights"
      // so total_possible = sum of game weights for each game played
    }
  }

  return players.map(player => {
    const s = statsMap.get(player.id) ?? { games_played: 0, wins: 0, total_points: 0, total_possible: 0 }
    const rawRate = s.total_possible > 0 ? s.total_points / s.total_possible : 0
    const adjustedRate = calcAdjustedRate(s.total_points, s.total_possible, prior, c)
    return {
      player,
      games_played: s.games_played,
      wins: s.wins,
      total_points: s.total_points,
      total_possible_points: s.total_possible,
      raw_win_rate: rawRate,
      adjusted_win_rate: adjustedRate,
    }
  })
}

export const CATEGORY_EMOJI: Record<string, string> = {
  Beach: '🏖️',
  Pool:  '🏊',
  Board: '🎲',
  Card:  '🃏',
  Other: '🎯',
}
