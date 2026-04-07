'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePlayer } from '@/components/PlayerProvider'
import { CATEGORY_EMOJI } from '@/lib/scoring'
import { useToast } from '@/components/ui/Toast'
import { Trash2, Filter } from 'lucide-react'

interface ResultEntry {
  id: string; player_id: string; placement: number; score: number | null; team: string | null; points_earned: number
  players: { id: string; display_name: string } | null
}
interface GameResult {
  id: string; game_id: string; played_at: string; note: string | null
  games: { id: string; name: string; category: string; scoring_type: string } | null
  result_entries: ResultEntry[]
  logger: { id: string; display_name: string } | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function GameHistory({
  results: initialResults,
  games,
  players,
}: {
  results: GameResult[]
  games: { id: string; name: string; category: string }[]
  players: { id: string; display_name: string }[]
}) {
  const router = useRouter()
  // Admin check via localStorage PIN flag
  const [isAdmin, setIsAdmin]           = useState(() => typeof window !== 'undefined' && sessionStorage.getItem('beach_admin') === '1')
  const [results, setResults]           = useState(initialResults)
  const [filterGame, setFilterGame]     = useState('')
  const [filterPlayer, setFilterPlayer] = useState('')
  const [showFilters, setShowFilters]   = useState(false)
  const [, startTransition]             = useTransition()
  const { show, ToastEl }               = useToast()

  const filtered = results.filter(r => {
    if (filterGame   && r.game_id !== filterGame)   return false
    if (filterPlayer && !r.result_entries.some(e => e.player_id === filterPlayer)) return false
    return true
  })

  async function handleDelete(resultId: string) {
    if (!confirm('Delete this result? This cannot be undone.')) return
    const supabase = createClient()
    const { error } = await supabase.from('game_results').delete().eq('id', resultId)
    if (error) { show('Failed to delete.', 'error'); return }
    setResults(prev => prev.filter(r => r.id !== resultId))
    show('Result deleted.', 'success')
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-col">
      {ToastEl}
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">Game History</h1>
          <button onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl transition-colors
              ${showFilters ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-500'}`}>
            <Filter size={14} /> Filter
          </button>
        </div>
        {showFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={filterGame} onChange={e => setFilterGame(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
              <option value="">All games</option>
              {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={filterPlayer} onChange={e => setFilterPlayer(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
              <option value="">All players</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {filtered.length === 0 && <p className="text-center text-slate-400 py-12">No results found.</p>}
        {filtered.map(result => (
          <div key={result.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-base">{CATEGORY_EMOJI[result.games?.category ?? 'Other']}</span>
                    <span className="font-bold text-slate-800">{result.games?.name}</span>
                    {result.note && <span className="text-xs text-slate-400 italic">"{result.note}"</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatDate(result.played_at)}
                    {result.logger ? ` · logged by ${result.logger.display_name}` : ''}
                  </p>
                </div>
                {isAdmin && (
                  <button onClick={() => handleDelete(result.id)}
                    className="text-slate-300 hover:text-red-400 p-1.5 transition-colors shrink-0">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-1">
                {[...(result.result_entries ?? [])].sort((a, b) => a.placement - b.placement).map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                      ${e.placement === 1 ? 'bg-amber-400 text-white' : e.placement === 2 ? 'bg-slate-300 text-slate-600' : e.placement === 3 ? 'bg-amber-600/70 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {e.placement}
                    </span>
                    <span className="text-slate-700 flex-1">{e.players?.display_name ?? '?'}</span>
                    {e.team && <span className="text-xs text-slate-400">Team {e.team}</span>}
                    {result.games?.scoring_type === 'margin' && e.score != null && (
                      <span className="text-xs text-slate-400">{e.score}</span>
                    )}
                    <span className="text-xs text-sky-600 font-medium">{Number(e.points_earned).toFixed(2)} pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
