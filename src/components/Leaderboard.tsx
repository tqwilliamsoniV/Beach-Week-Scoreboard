'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Player, ResultEntry, Game, PlayerStats, LeaderboardTab } from '@/types'
import { calcAdjustedRate } from '@/lib/scoring'
import { Spinner } from '@/components/ui/Spinner'
import { Trophy, Flame, Swords, PlusCircle, ChevronRight } from 'lucide-react'

const TABS: { id: LeaderboardTab; label: string; icon: React.ReactNode }[] = [
  { id: 'champion', label: 'Champion', icon: <Trophy size={16} /> },
  { id: 'ironman',  label: 'Iron Man', icon: <Flame  size={16} /> },
  { id: 'mvp',      label: 'MVP',      icon: <Swords size={16} /> },
]

function computeStats(
  players: Player[],
  entries: (ResultEntry & { game_results: { game_id: string } | null })[],
  games: Game[],
  prior: number,
  c: number
): PlayerStats[] {
  const gameMap = new Map(games.map(g => [g.id, g]))
  const byResult = new Map<string, typeof entries>()
  for (const e of entries) {
    if (!byResult.has(e.result_id)) byResult.set(e.result_id, [])
    byResult.get(e.result_id)!.push(e)
  }

  const acc = new Map<string, { games_played: number; wins: number; total_points: number; total_possible: number }>()
  for (const p of players) acc.set(p.id, { games_played: 0, wins: 0, total_points: 0, total_possible: 0 })

  for (const [, group] of byResult) {
    const gameId = group[0]?.game_results?.game_id
    const game   = gameId ? gameMap.get(gameId) : undefined
    if (!game) continue
    for (const entry of group) {
      const s = acc.get(entry.player_id)
      if (!s) continue
      s.games_played++
      if (entry.placement === 1) s.wins++
      s.total_points   += Number(entry.points_earned)
      s.total_possible += Number(game.weight)
    }
  }

  return players.map(player => {
    const s = acc.get(player.id) ?? { games_played: 0, wins: 0, total_points: 0, total_possible: 0 }
    return {
      player,
      games_played: s.games_played,
      wins: s.wins,
      total_points: s.total_points,
      total_possible_points: s.total_possible,
      raw_win_rate: s.total_possible > 0 ? s.total_points / s.total_possible : 0,
      adjusted_win_rate: calcAdjustedRate(s.total_points, s.total_possible, prior, c),
    }
  })
}

export function Leaderboard() {
  const router = useRouter()
  const [tab, setTab]             = useState<LeaderboardTab>('champion')
  const [stats, setStats]         = useState<PlayerStats[]>([])
  const [loading, setLoading]     = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [minThreshold, setMinThreshold] = useState(15)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: players }, { data: entries }, { data: games }, { data: settings }] = await Promise.all([
      supabase.from('players').select('*').order('display_name'),
      supabase.from('result_entries').select('*, game_results(game_id)'),
      supabase.from('games').select('*').eq('is_active', true),
      supabase.from('settings').select('*'),
    ])

    const threshold = Number(settings?.find(s => s.key === 'min_game_threshold')?.value ?? 15)
    const prior     = Number(settings?.find(s => s.key === 'bayesian_prior')?.value ?? 0.4)
    const c         = Number(settings?.find(s => s.key === 'bayesian_c')?.value ?? 5.0)

    setMinThreshold(threshold)
    setStats(computeStats(players ?? [], (entries ?? []) as never, games ?? [], prior, c))
    setUpdatedAt(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const supabase = createClient()
    const channel = supabase
      .channel('leaderboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'result_entries' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_results' },  load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const sorted = [...stats].sort((a, b) => {
    if (tab === 'champion') return b.adjusted_win_rate - a.adjusted_win_rate
    if (tab === 'ironman') {
      if (b.games_played !== a.games_played) return b.games_played - a.games_played
      return b.adjusted_win_rate - a.adjusted_win_rate
    }
    return b.total_points - a.total_points
  })

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-4 pt-12 pb-4 text-white">
        <h1 className="text-2xl font-bold">🏖️ Beach Week</h1>
        <p className="text-sky-100 text-sm">Live Leaderboard</p>
      </div>

      <div className="flex bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors border-b-2
              ${tab === t.id ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-36">
        {loading ? (
          <div className="flex justify-center items-center py-16"><Spinner size={32} /></div>
        ) : sorted.length === 0 ? (
          <p className="text-center text-slate-400 py-16">No games logged yet. Start playing!</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((s, i) => {
              const ineligible = tab === 'champion' && (!s.player.is_eligible || s.games_played < minThreshold)
              return (
                <li key={s.player.id}
                  onClick={() => router.push(`/player/${s.player.id}`)}
                  className={`flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 cursor-pointer ${ineligible ? 'opacity-50' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                    ${i === 0 && !ineligible ? 'bg-amber-400 text-white' :
                      i === 1 && !ineligible ? 'bg-slate-300 text-slate-700' :
                      i === 2 && !ineligible ? 'bg-amber-600/70 text-white' :
                      'bg-slate-100 text-slate-500'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 truncate">{s.player.display_name}</span>
                      {ineligible && (
                        <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full shrink-0">Ineligible</span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">{s.games_played} games played</span>
                  </div>
                  <div className="text-right shrink-0">
                    {tab === 'champion' && <span className="font-bold text-sky-700">{(s.adjusted_win_rate * 100).toFixed(1)}%</span>}
                    {tab === 'ironman'  && <span className="font-bold text-orange-500">{s.games_played}</span>}
                    {tab === 'mvp'      && <span className="font-bold text-violet-600">{s.total_points.toFixed(1)} pts</span>}
                  </div>
                  <ChevronRight size={16} className="text-slate-300 shrink-0" />
                </li>
              )
            })}
          </ul>
        )}
        {updatedAt && (
          <p className="text-center text-xs text-slate-300 py-4">Updated {updatedAt.toLocaleTimeString()}</p>
        )}
      </div>

      <div className="fixed bottom-16 left-0 right-0 px-4 pb-3 bg-gradient-to-t from-sky-50 to-transparent pointer-events-none">
        <button
          onClick={() => router.push('/log-game')}
          className="pointer-events-auto w-full bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-bold py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 text-base transition-colors"
        >
          <PlusCircle size={22} /> Log a Game
        </button>
      </div>
    </div>
  )
}
