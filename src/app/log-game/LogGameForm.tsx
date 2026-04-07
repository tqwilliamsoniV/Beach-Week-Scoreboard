'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Game, User } from '@/types'
import { calcPlacementPoints, calcMarginBonus, CATEGORY_EMOJI } from '@/lib/scoring'
import { useToast } from '@/components/ui/Toast'
import { ChevronLeft, Check } from 'lucide-react'

type Step = 'game' | 'players' | 'results' | 'confirm'

interface PlayerResult {
  playerId: string
  placement: number
  score: string
  team: 'A' | 'B' | null
}

function groupByCategory(games: Game[]) {
  const map = new Map<string, Game[]>()
  for (const g of games) {
    if (!map.has(g.category)) map.set(g.category, [])
    map.get(g.category)!.push(g)
  }
  return map
}

export function LogGameForm({
  games,
  players,
  currentUserId,
}: {
  games: Game[]
  players: { id: string; display_name: string; is_commissioner: boolean }[]
  currentUserId: string
}) {
  const router = useRouter()
  const { show, ToastEl } = useToast()

  const [step, setStep]               = useState<Step>('game')
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [isTeamGame, setIsTeamGame]   = useState(false)
  const [results, setResults]         = useState<PlayerResult[]>([])
  const [note, setNote]               = useState('')
  const [submitting, setSubmitting]   = useState(false)

  // ─── Step 1: Select Game ──────────────────────────────────────────────────
  function handleSelectGame(game: Game) {
    setSelectedGame(game)
    setStep('players')
  }

  // ─── Step 2: Select Players ───────────────────────────────────────────────
  function togglePlayer(id: string) {
    setSelectedPlayers(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  function handlePlayersNext() {
    if (selectedPlayers.length < 2) {
      show('Select at least 2 players.', 'error')
      return
    }
    // Initialize result rows
    setResults(
      selectedPlayers.map((pid, i) => ({
        playerId: pid,
        placement: i + 1,
        score: '',
        team: null,
      }))
    )
    setStep('results')
  }

  // ─── Step 3: Enter Results ────────────────────────────────────────────────
  function getPlayerName(id: string) {
    return players.find(p => p.id === id)?.display_name ?? id
  }

  function setPlacement(playerId: string, placement: number) {
    setResults(prev => prev.map(r => r.playerId === playerId ? { ...r, placement } : r))
  }

  function setScore(playerId: string, score: string) {
    setResults(prev => prev.map(r => r.playerId === playerId ? { ...r, score } : r))
  }

  function setTeam(playerId: string, team: 'A' | 'B') {
    setResults(prev => prev.map(r => r.playerId === playerId ? { ...r, team } : r))
  }

  // Win/loss helper: set winner
  function setWinner(winnerId: string) {
    if (isTeamGame) {
      // team A wins
      setResults(prev => prev.map(r => ({
        ...r,
        placement: r.team === 'A' ? 1 : 2,
      })))
    } else {
      setResults(prev => prev.map(r => ({
        ...r,
        placement: r.playerId === winnerId ? 1 : 2,
      })))
    }
  }

  function handleResultsNext() {
    if (!selectedGame) return
    const type = selectedGame.scoring_type

    if (type === 'win_loss' && !isTeamGame) {
      const winners = results.filter(r => r.placement === 1)
      if (winners.length !== 1) { show('Select exactly one winner.', 'error'); return }
    }
    if (type === 'win_loss' && isTeamGame) {
      const missingTeam = results.some(r => !r.team)
      if (missingTeam) { show('Assign every player to a team.', 'error'); return }
      const aWin = results.filter(r => r.placement === 1 && r.team === 'A').length
      const bWin = results.filter(r => r.placement === 1 && r.team === 'B').length
      if (aWin === 0 && bWin === 0) { show('Select a winning team.', 'error'); return }
    }
    if (type === 'margin') {
      const missing = results.some(r => r.score.trim() === '')
      if (missing) { show('Enter a score for every player.', 'error'); return }
      // auto-determine placement by score
      const sorted = [...results].sort((a, b) => Number(b.score) - Number(a.score))
      setResults(prev => prev.map(r => ({
        ...r,
        placement: sorted.findIndex(s => s.playerId === r.playerId) + 1,
      })))
    }
    setStep('confirm')
  }

  // ─── Step 4: Submit ───────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!selectedGame) return
    setSubmitting(true)

    const supabase = createClient()

    // Insert game_result
    const { data: resultRow, error: resultErr } = await supabase
      .from('game_results')
      .insert({ game_id: selectedGame.id, logged_by: currentUserId, note: note.trim() || null })
      .select()
      .single()

    if (resultErr || !resultRow) {
      show('Failed to save result. Try again.', 'error')
      setSubmitting(false)
      return
    }

    // Compute points per entry
    const type = selectedGame.scoring_type
    const winnerScore  = type === 'margin' ? Number(results.find(r => r.placement === 1)?.score ?? 0) : 0
    const loserScore   = type === 'margin' ? Number(results.find(r => r.placement === 2)?.score ?? 0) : 0

    const entries = results.map(r => {
      let points = calcPlacementPoints(r.placement, selectedGame)
      if (type === 'margin' && r.placement === 1 && winnerScore > 0) {
        points += calcMarginBonus(winnerScore, loserScore, selectedGame)
      }
      return {
        result_id: resultRow.id,
        player_id: r.playerId,
        placement: r.placement,
        score: r.score !== '' ? Number(r.score) : null,
        team: r.team,
        points_earned: Math.round(points * 10000) / 10000,
      }
    })

    const { error: entriesErr } = await supabase.from('result_entries').insert(entries)
    if (entriesErr) {
      show('Failed to save player results. Try again.', 'error')
      setSubmitting(false)
      return
    }

    show('Game logged! Leaderboard updated.', 'success')
    setTimeout(() => router.push('/'), 1200)
    setSubmitting(false)
  }

  const categoryMap = groupByCategory(games)

  return (
    <div className="flex flex-col min-h-screen bg-sky-50">
      {ToastEl}

      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => {
            if (step === 'game') router.back()
            else if (step === 'players') setStep('game')
            else if (step === 'results') setStep('players')
            else setStep('results')
          }}
          className="text-slate-400 hover:text-slate-600 p-1"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Log a Game</h1>
          <p className="text-xs text-slate-400">
            {step === 'game'    && 'Step 1 of 4 — Pick game'}
            {step === 'players' && 'Step 2 of 4 — Pick players'}
            {step === 'results' && 'Step 3 of 4 — Enter result'}
            {step === 'confirm' && 'Step 4 of 4 — Confirm'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100">
        <div
          className="h-1 bg-sky-500 transition-all duration-300"
          style={{ width: step === 'game' ? '25%' : step === 'players' ? '50%' : step === 'results' ? '75%' : '100%' }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* ── STEP 1: Select Game ──────────────────────────────────────── */}
        {step === 'game' && (
          <div className="space-y-4">
            {Array.from(categoryMap.entries()).map(([cat, catGames]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {CATEGORY_EMOJI[cat]} {cat}
                </p>
                <div className="space-y-2">
                  {catGames.map(game => (
                    <button
                      key={game.id}
                      onClick={() => handleSelectGame(game)}
                      className="w-full bg-white rounded-2xl shadow-sm px-4 py-3.5 flex items-center justify-between active:bg-sky-50 text-left"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{game.name}</p>
                        <p className="text-xs text-slate-400">
                          {game.scoring_type === 'win_loss'  && 'Win / Loss'}
                          {game.scoring_type === 'placement' && 'Full Placement'}
                          {game.scoring_type === 'margin'    && 'Score / Margin'}
                          {' · '}Weight {game.weight}
                          {game.notes ? ` · ${game.notes}` : ''}
                        </p>
                      </div>
                      <ChevronLeft size={16} className="rotate-180 text-slate-300" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── STEP 2: Select Players ───────────────────────────────────── */}
        {step === 'players' && (
          <div>
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
              <p className="text-sm font-semibold text-slate-700 mb-1">
                Game: <span className="text-sky-600">{selectedGame?.name}</span>
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-600 mt-3">
                <input
                  type="checkbox"
                  checked={isTeamGame}
                  onChange={e => setIsTeamGame(e.target.checked)}
                  className="w-4 h-4 accent-sky-500"
                />
                Team game (players split into Team A / Team B)
              </label>
            </div>

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Tap to select players
            </p>
            <div className="grid grid-cols-2 gap-2">
              {players.map(player => {
                const selected = selectedPlayers.includes(player.id)
                return (
                  <button
                    key={player.id}
                    onClick={() => togglePlayer(player.id)}
                    className={`rounded-2xl px-4 py-3.5 font-semibold text-sm border-2 transition-all
                      ${selected
                        ? 'bg-sky-500 border-sky-500 text-white shadow-md'
                        : 'bg-white border-slate-100 text-slate-700 shadow-sm'}`}
                  >
                    {selected && <Check size={14} className="inline mr-1" />}
                    {player.display_name}
                  </button>
                )
              })}
            </div>

            <button
              onClick={handlePlayersNext}
              className="mt-6 w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-4 rounded-2xl shadow-lg text-base"
            >
              Next — Enter Result
            </button>
          </div>
        )}

        {/* ── STEP 3: Enter Results ────────────────────────────────────── */}
        {step === 'results' && selectedGame && (
          <div>
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{selectedGame.name}</span>
                {' · '}
                {selectedPlayers.length} players
              </p>
            </div>

            {/* Win/Loss — individual */}
            {selectedGame.scoring_type === 'win_loss' && !isTeamGame && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-600 mb-2">Who won?</p>
                {results.map(r => (
                  <button
                    key={r.playerId}
                    onClick={() => setWinner(r.playerId)}
                    className={`w-full rounded-2xl px-4 py-4 font-semibold text-sm border-2 transition-all
                      ${r.placement === 1
                        ? 'bg-amber-400 border-amber-400 text-white shadow-md'
                        : 'bg-white border-slate-100 text-slate-700 shadow-sm'}`}
                  >
                    {r.placement === 1 ? '🏆 ' : ''}{getPlayerName(r.playerId)}
                  </button>
                ))}
              </div>
            )}

            {/* Win/Loss — team */}
            {selectedGame.scoring_type === 'win_loss' && isTeamGame && (
              <div>
                <p className="text-sm font-semibold text-slate-600 mb-3">Assign teams</p>
                <div className="space-y-2 mb-5">
                  {results.map(r => (
                    <div key={r.playerId} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center justify-between">
                      <span className="font-medium text-slate-700">{getPlayerName(r.playerId)}</span>
                      <div className="flex gap-2">
                        {(['A', 'B'] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setTeam(r.playerId, t)}
                            className={`w-10 h-10 rounded-xl font-bold text-sm border-2 transition-all
                              ${r.team === t
                                ? t === 'A' ? 'bg-sky-500 border-sky-500 text-white' : 'bg-orange-500 border-orange-500 text-white'
                                : 'bg-white border-slate-200 text-slate-500'}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-sm font-semibold text-slate-600 mb-2">Winning team</p>
                <div className="flex gap-3">
                  {(['A', 'B'] as const).map(t => {
                    const teamWon = results.filter(r => r.team === t).every(r => r.placement === 1)
                    return (
                      <button
                        key={t}
                        onClick={() => {
                          setResults(prev => prev.map(r => ({
                            ...r,
                            placement: r.team === t ? 1 : 2,
                          })))
                        }}
                        className={`flex-1 py-4 rounded-2xl font-bold border-2 transition-all
                          ${teamWon
                            ? 'bg-amber-400 border-amber-400 text-white shadow-md'
                            : 'bg-white border-slate-200 text-slate-600 shadow-sm'}`}
                      >
                        {teamWon ? '🏆 ' : ''}Team {t}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Full Placement */}
            {selectedGame.scoring_type === 'placement' && (
              <div>
                <p className="text-sm font-semibold text-slate-600 mb-3">Enter final placement (1 = 1st)</p>
                <div className="space-y-2">
                  {results.map(r => (
                    <div key={r.playerId} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
                      <span className="flex-1 font-medium text-slate-700">{getPlayerName(r.playerId)}</span>
                      <div className="flex gap-1.5">
                        {Array.from({ length: selectedPlayers.length }, (_, i) => i + 1).map(pos => (
                          <button
                            key={pos}
                            onClick={() => setPlacement(r.playerId, pos)}
                            className={`w-10 h-10 rounded-xl font-bold text-sm border-2 transition-all
                              ${r.placement === pos
                                ? pos === 1 ? 'bg-amber-400 border-amber-400 text-white'
                                  : pos === 2 ? 'bg-slate-300 border-slate-300 text-slate-700'
                                  : pos === 3 ? 'bg-amber-600/70 border-amber-600/70 text-white'
                                  : 'bg-sky-500 border-sky-500 text-white'
                                : 'bg-white border-slate-200 text-slate-500'}`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Margin/Score */}
            {selectedGame.scoring_type === 'margin' && (
              <div>
                <p className="text-sm font-semibold text-slate-600 mb-3">
                  Enter final score for each player (winner auto-detected)
                </p>
                <div className="space-y-2">
                  {results.map(r => (
                    <div key={r.playerId} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
                      <span className="flex-1 font-medium text-slate-700">{getPlayerName(r.playerId)}</span>
                      <input
                        type="number"
                        value={r.score}
                        onChange={e => setScore(r.playerId, e.target.value)}
                        placeholder="0"
                        className="w-20 border-2 border-slate-200 rounded-xl px-3 py-2 text-center text-slate-800 font-bold focus:border-sky-400 focus:outline-none text-base"
                        min={0}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Note */}
            <div className="mt-5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Optional note
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder='e.g. "OT win", "Best of 3"'
                className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400 text-sm"
              />
            </div>

            <button
              onClick={handleResultsNext}
              className="mt-6 w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-4 rounded-2xl shadow-lg text-base"
            >
              Review & Submit
            </button>
          </div>
        )}

        {/* ── STEP 4: Confirm ──────────────────────────────────────────── */}
        {step === 'confirm' && selectedGame && (
          <div>
            <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-3">Game</p>
              <p className="font-bold text-slate-800 text-lg">{selectedGame.name}</p>
              {note && <p className="text-sm text-slate-500 mt-1">"{note}"</p>}
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-3">Results</p>
              <div className="space-y-2">
                {[...results]
                  .sort((a, b) => a.placement - b.placement)
                  .map(r => (
                    <div key={r.playerId} className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                        ${r.placement === 1 ? 'bg-amber-400 text-white' :
                          r.placement === 2 ? 'bg-slate-300 text-slate-700' :
                          r.placement === 3 ? 'bg-amber-600/70 text-white' :
                          'bg-slate-100 text-slate-500'}`}>
                        {r.placement}
                      </span>
                      <span className="flex-1 font-medium text-slate-700">{getPlayerName(r.playerId)}</span>
                      {r.team && <span className="text-xs text-slate-400">Team {r.team}</span>}
                      {r.score !== '' && <span className="text-sm text-slate-500">Score: {r.score}</span>}
                    </div>
                  ))}
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-bold py-4 rounded-2xl shadow-lg text-base transition-colors"
            >
              {submitting ? 'Saving…' : '✓ Submit Result'}
            </button>

            <button
              onClick={() => setStep('results')}
              className="mt-3 w-full text-slate-400 text-sm py-2"
            >
              ← Go back and edit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
