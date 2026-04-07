'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calcAdjustedRate, CATEGORY_EMOJI } from '@/lib/scoring'
import { Spinner } from '@/components/ui/Spinner'
import { ChevronLeft, Trophy, Flame, Swords } from 'lucide-react'
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer, Tooltip } from 'recharts'

interface Entry {
  id: string; result_id: string; player_id: string; placement: number
  score: number | null; team: string | null; points_earned: number
  game_results: {
    id: string; game_id: string; played_at: string; note: string | null
    games: { id: string; name: string; category: string; weight: number; scoring_type: string } | null
  } | null
}

export function PlayerProfileView({ playerId }: { playerId: string }) {
  const router = useRouter()
  const [player, setPlayer]   = useState<{ display_name: string; is_eligible: boolean } | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState({ prior: 0.4, c: 5.0 })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: playerData }, { data: entriesData }, { data: settingsData }] = await Promise.all([
        supabase.from('players').select('display_name, is_eligible').eq('id', playerId).single(),
        supabase.from('result_entries')
          .select('*, game_results(id, game_id, played_at, note, games(id, name, category, weight, scoring_type))')
          .eq('player_id', playerId)
          .order('id', { ascending: false }),
        supabase.from('settings').select('*'),
      ])
      setPlayer(playerData)
      setEntries((entriesData ?? []) as Entry[])
      setSettings({
        prior: Number(settingsData?.find(s => s.key === 'bayesian_prior')?.value ?? 0.4),
        c:     Number(settingsData?.find(s => s.key === 'bayesian_c')?.value ?? 5.0),
      })
      setLoading(false)
    }
    load()
  }, [playerId])

  if (loading) return <div className="flex justify-center items-center py-24"><Spinner size={36} /></div>
  if (!player) return <p className="text-center text-slate-400 py-16">Player not found.</p>

  const gamesPlayed   = entries.length
  const wins          = entries.filter(e => e.placement === 1).length
  const totalPoints   = entries.reduce((sum, e) => sum + Number(e.points_earned), 0)
  const totalPossible = entries.reduce((sum, e) => sum + Number(e.game_results?.games?.weight ?? 0), 0)
  const adjustedRate  = calcAdjustedRate(totalPoints, totalPossible, settings.prior, settings.c)

  const catMap = new Map<string, { wins: number; total: number }>()
  for (const e of entries) {
    const cat = e.game_results?.games?.category ?? 'Other'
    if (!catMap.has(cat)) catMap.set(cat, { wins: 0, total: 0 })
    const s = catMap.get(cat)!
    s.total++
    if (e.placement === 1) s.wins++
  }

  const chartData = Array.from(catMap.entries()).map(([cat, s], i) => ({
    name: `${CATEGORY_EMOJI[cat]} ${cat}`,
    winRate: s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0,
    fill: ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#f97316'][i % 5],
  }))

  return (
    <div className="flex flex-col">
      <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-4 pt-12 pb-6 text-white">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sky-100 text-sm mb-3">
          <ChevronLeft size={16} /> Back
        </button>
        <h1 className="text-2xl font-bold">{player.display_name}</h1>
        {!player.is_eligible && (
          <span className="mt-1 inline-block text-xs bg-white/20 px-2 py-0.5 rounded-full">Ineligible for awards</span>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<Trophy size={18} className="text-amber-500" />} label="Adjusted Win Rate" value={`${(adjustedRate * 100).toFixed(1)}%`} />
          <StatCard icon={<Flame  size={18} className="text-orange-500" />} label="Games Played"     value={gamesPlayed.toString()} />
          <StatCard icon={<Swords size={18} className="text-violet-500" />} label="Total Points (MVP)" value={totalPoints.toFixed(2)} />
          <StatCard icon={<Trophy size={18} className="text-sky-500" />}   label="Wins"              value={wins.toString()} />
        </div>

        {chartData.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Win Rate by Category</p>
            <ResponsiveContainer width="100%" height={220}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%"
                data={chartData} startAngle={180} endAngle={0}>
                <RadialBar dataKey="winRate" background label={{ position: 'insideStart', fill: '#fff', fontSize: 11 }} />
                <Legend iconSize={10} layout="vertical" verticalAlign="bottom"
                  formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
                <Tooltip formatter={(v) => [`${v}%`, 'Win Rate']} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Recent Results</p>
          {entries.length === 0 ? (
            <p className="text-sm text-slate-400">No games played yet.</p>
          ) : (
            <div className="space-y-2">
              {entries.slice(0, 15).map(e => (
                <div key={e.id} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                    ${e.placement === 1 ? 'bg-amber-400 text-white' : e.placement === 2 ? 'bg-slate-300 text-slate-600' : e.placement === 3 ? 'bg-amber-600/70 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {e.placement}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {CATEGORY_EMOJI[e.game_results?.games?.category ?? 'Other']} {e.game_results?.games?.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {e.game_results?.played_at ? new Date(e.game_results.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    </p>
                  </div>
                  <span className="text-xs text-sky-600 font-semibold shrink-0">+{Number(e.points_earned).toFixed(2)} pts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-slate-400 font-medium">{label}</span></div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  )
}
