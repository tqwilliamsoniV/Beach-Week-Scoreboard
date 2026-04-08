'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePlayer } from '@/components/PlayerProvider'
import type { Game, GameVariant } from '@/types'
import { calcPlacementPoints, calcMarginBonus, CATEGORY_EMOJI } from '@/lib/scoring'
import { useToast } from '@/components/ui/Toast'
import { ChevronLeft, X, Search } from 'lucide-react'

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

// ─── Team Drag Board ──────────────────────────────────────────────────────────
function TeamDragBoard({
  teamA,
  teamB,
  getName,
  onSwap,
}: {
  teamA: string[]
  teamB: string[]
  getName: (id: string) => string
  onSwap: (id1: string, id2: string) => void
}) {
  const [dragging, setDragging] = useState<{ id: string; fromTeam: 'A' | 'B' } | null>(null)
  const [hoverTarget, setHoverTarget] = useState<{ id: string; team: 'A' | 'B' } | null>(null)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  function handlePointerDown(e: React.PointerEvent, id: string, fromTeam: 'A' | 'B') {
    e.preventDefault()
    setDragging({ id, fromTeam })
    setGhostPos({ x: e.clientX, y: e.clientY })
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return
    e.preventDefault()
    setGhostPos({ x: e.clientX, y: e.clientY })

    const els = document.elementsFromPoint(e.clientX, e.clientY)
    let found: { id: string; team: 'A' | 'B' } | null = null
    for (const el of els) {
      const pid = (el as HTMLElement).dataset?.playerId
      const team = (el as HTMLElement).dataset?.team as 'A' | 'B' | undefined
      if (pid && pid !== dragging.id && team && team !== dragging.fromTeam) {
        found = { id: pid, team }
        break
      }
    }
    setHoverTarget(found)
  }

  function handlePointerUp() {
    if (dragging && hoverTarget) {
      onSwap(dragging.id, hoverTarget.id)
    }
    setDragging(null)
    setHoverTarget(null)
    setGhostPos(null)
  }

  const swapPreviewing = dragging !== null && hoverTarget !== null

  function renderColumn(team: 'A' | 'B') {
    const members = team === 'A' ? teamA : teamB
    const chipBg = team === 'A' ? 'bg-sky-500' : 'bg-orange-500'
    const colBorder = team === 'A' ? 'border-sky-200 bg-sky-50' : 'border-orange-200 bg-orange-50'
    const headerColor = team === 'A' ? 'text-sky-600' : 'text-orange-600'
    const incomingChipBg = team === 'A' ? 'bg-orange-300' : 'bg-sky-300'

    return (
      <div className={`flex-1 rounded-2xl border-2 ${colBorder} p-3 min-h-[160px]`}>
        <p className={`text-xs font-bold ${headerColor} uppercase tracking-wider mb-3`}>
          {team === 'A' ? '🔵 Team A' : '🟠 Team B'}
        </p>
        <div className="space-y-2">
          {members.map(pid => {
            const isDraggingThis = dragging?.id === pid
            const isDropTarget = swapPreviewing && hoverTarget?.id === pid
            return (
              <div
                key={pid}
                data-player-id={pid}
                data-team={team}
                onPointerDown={e => handlePointerDown(e, pid, team)}
                style={{ touchAction: 'none' }}
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${chipBg} text-white cursor-grab select-none transition-all duration-150
                  ${isDraggingThis ? 'opacity-25 scale-95' : ''}
                  ${isDropTarget ? 'opacity-40 scale-95 ring-2 ring-white ring-offset-1' : ''}
                `}
              >
                <span className="mr-1.5 opacity-50">⠿</span>{getName(pid)}
              </div>
            )
          })}
          {/* Preview: shows the dragged player's target arriving in this column */}
          {swapPreviewing && dragging!.fromTeam === team && hoverTarget !== null && (
            <div className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${incomingChipBg} text-white opacity-75 select-none border-2 border-dashed border-white`}>
              <span className="mr-1.5 opacity-50">⠿</span>{getName(hoverTarget.id)}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={boardRef}
      className="relative"
      style={{ touchAction: 'none', userSelect: 'none' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="flex gap-3">
        {renderColumn('A')}
        {renderColumn('B')}
      </div>

      {/* Floating drag ghost */}
      {dragging && ghostPos && (
        <div
          className={`fixed pointer-events-none z-50 rounded-xl px-3 py-2.5 text-sm font-semibold text-white shadow-2xl
            ${dragging.fromTeam === 'A' ? 'bg-sky-500' : 'bg-orange-500'}`}
          style={{
            left: ghostPos.x,
            top: ghostPos.y,
            transform: 'translate(-50%, -50%) rotate(4deg)',
          }}
        >
          <span className="mr-1.5 opacity-50">⠿</span>{getName(dragging.id)}
        </div>
      )}
    </div>
  )
}

// ─── Main Form ────────────────────────────────────────────────────────────────
export function LogGameForm({
  games,
  players,
  variants,
}: {
  games: Game[]
  players: { id: string; display_name: string }[]
  variants: GameVariant[]
}) {
  const router = useRouter()
  const { player: currentPlayer } = usePlayer()
  const { show, ToastEl } = useToast()

  const [step, setStep]                     = useState<Step>('game')
  const [selectedGame, setSelectedGame]     = useState<Game | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<GameVariant | null>(null)
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [search, setSearch]                 = useState('')
  const [showDropdown, setShowDropdown]     = useState(false)
  const [results, setResults]               = useState<PlayerResult[]>([])
  const [teamA, setTeamA]                   = useState<string[]>([])
  const [teamB, setTeamB]                   = useState<string[]>([])
  const [winningTeam, setWinningTeam]       = useState<'A' | 'B' | null>(null)
  const [note, setNote]                     = useState('')
  const [submitting, setSubmitting]         = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Build variants lookup
  const variantsByGame = new Map<string, GameVariant[]>()
  for (const v of variants) {
    if (!variantsByGame.has(v.game_id)) variantsByGame.set(v.game_id, [])
    variantsByGame.get(v.game_id)!.push(v)
  }

  const categoryMap = groupByCategory(games)

  function getName(id: string) {
    return players.find(p => p.id === id)?.display_name ?? id
  }

  // Autocomplete suggestions
  const suggestions = search.trim()
    ? players
        .filter(p =>
          p.display_name.toLowerCase().includes(search.toLowerCase()) &&
          !selectedPlayers.includes(p.id)
        )
        .slice(0, 6)
    : []

  function addPlayer(id: string) {
    if (!selectedGame) return
    const max = selectedGame.max_players
    if (max != null && selectedPlayers.length >= max) {
      show(`Max ${max} players for this game.`, 'error')
      return
    }
    setSelectedPlayers(prev => [...prev, id])
    setSearch('')
    setShowDropdown(false)
    searchRef.current?.focus()
  }

  function removePlayer(id: string) {
    setSelectedPlayers(prev => prev.filter(p => p !== id))
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault()
      addPlayer(suggestions[0].id)
    }
    if (e.key === 'Escape') {
      setShowDropdown(false)
      setSearch('')
    }
  }

  function handleSelectGame(game: Game, variant: GameVariant | null = null) {
    setSelectedGame(game)
    setSelectedVariant(variant)
    setStep('players')
  }

  function handlePlayersNext() {
    if (!selectedGame) return
    const min = selectedGame.min_players ?? 2
    if (selectedPlayers.length < min) {
      show(`Need at least ${min} players.`, 'error')
      return
    }
    setResults(selectedPlayers.map((pid, i) => ({ playerId: pid, placement: i + 1, score: '', team: null })))

    if (selectedGame.scoring_type === 'win_loss' && selectedPlayers.length > 2) {
      const sorted = [...selectedPlayers].sort((a, b) => getName(a).localeCompare(getName(b)))
      const half = Math.ceil(sorted.length / 2)
      setTeamA(sorted.slice(0, half))
      setTeamB(sorted.slice(half))
      setWinningTeam(null)
    }

    setStep('results')
  }

  function handleSwapTeams(id1: string, id2: string) {
    const id1InA = teamA.includes(id1)
    if (id1InA) {
      setTeamA(prev => prev.map(p => (p === id1 ? id2 : p)))
      setTeamB(prev => prev.map(p => (p === id2 ? id1 : p)))
    } else {
      setTeamA(prev => prev.map(p => (p === id2 ? id1 : p)))
      setTeamB(prev => prev.map(p => (p === id1 ? id2 : p)))
    }
  }

  function setWinner(playerId: string) {
    setResults(prev => prev.map(r => ({ ...r, placement: r.playerId === playerId ? 1 : 2 })))
  }

  function setPlacement(playerId: string, placement: number) {
    setResults(prev => prev.map(r => r.playerId === playerId ? { ...r, placement } : r))
  }

  function setScore(playerId: string, score: string) {
    setResults(prev => prev.map(r => r.playerId === playerId ? { ...r, score } : r))
  }

  function handleResultsNext() {
    if (!selectedGame) return
    const type = selectedGame.scoring_type

    if (type === 'win_loss') {
      if (selectedPlayers.length === 2) {
        if (results.filter(r => r.placement === 1).length !== 1) {
          show('Select a winner.', 'error')
          return
        }
      } else {
        if (!winningTeam) {
          show('Select a winning team.', 'error')
          return
        }
        const winners = winningTeam === 'A' ? teamA : teamB
        setResults(
          selectedPlayers.map(pid => ({
            playerId: pid,
            placement: winners.includes(pid) ? 1 : 2,
            score: '',
            team: teamA.includes(pid) ? ('A' as const) : ('B' as const),
          }))
        )
      }
    }

    if (type === 'placement') {
      const placements = results.map(r => r.placement)
      if (new Set(placements).size !== placements.length) {
        show('Each player needs a unique placement.', 'error')
        return
      }
    }

    if (type === 'margin') {
      if (results.some(r => r.score.trim() === '')) {
        show('Enter a score for every player.', 'error')
        return
      }
      const sorted = [...results].sort((a, b) => Number(b.score) - Number(a.score))
      setResults(prev => prev.map(r => ({ ...r, placement: sorted.findIndex(s => s.playerId === r.playerId) + 1 })))
    }

    setStep('confirm')
  }

  async function handleSubmit() {
    if (!selectedGame) return
    setSubmitting(true)
    const supabase = createClient()

    const { data: resultRow, error: resultErr } = await supabase
      .from('game_results')
      .insert({
        game_id: selectedGame.id,
        logged_by: currentPlayer?.id ?? null,
        note: note.trim() || null,
        variant_label: selectedVariant?.label ?? null,
      })
      .select()
      .single()

    if (resultErr || !resultRow) {
      show('Failed to save result. Try again.', 'error')
      setSubmitting(false)
      return
    }

    const type = selectedGame.scoring_type
    const winScore  = type === 'margin' ? Number(results.find(r => r.placement === 1)?.score ?? 0) : 0
    const loseScore = type === 'margin' ? Number(results.find(r => r.placement === 2)?.score ?? 0) : 0

    const entries = results.map(r => {
      let points = calcPlacementPoints(r.placement, selectedGame)
      if (type === 'margin' && r.placement === 1 && winScore > 0) {
        points += calcMarginBonus(winScore, loseScore, selectedGame)
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

  function handleBack() {
    if (step === 'game') router.back()
    else if (step === 'players') setStep('game')
    else if (step === 'results') setStep('players')
    else setStep('results')
  }

  const progressPct =
    step === 'game' ? '25%' : step === 'players' ? '50%' : step === 'results' ? '75%' : '100%'

  const stepLabel =
    step === 'game'    ? 'Step 1 of 4 — Pick a game'
    : step === 'players' ? 'Step 2 of 4 — Who played?'
    : step === 'results' ? 'Step 3 of 4 — Enter result'
    : 'Step 4 of 4 — Confirm'

  return (
    <div className="flex flex-col min-h-screen bg-sky-50">
      {ToastEl}

      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={handleBack} className="text-slate-400 hover:text-slate-600 p-1">
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Log a Game</h1>
          <p className="text-xs text-slate-400">{stepLabel}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100">
        <div className="h-1 bg-sky-500 transition-all duration-300" style={{ width: progressPct }} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* ── STEP 1: Pick a Game ─────────────────────────────────────── */}
        {step === 'game' && (
          <div className="space-y-5">
            {Array.from(categoryMap.entries()).map(([cat, catGames]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {CATEGORY_EMOJI[cat]} {cat}
                </p>
                <div className="space-y-2">
                  {catGames.map(game => {
                    const gameVariants = variantsByGame.get(game.id) ?? []
                    return (
                      <div key={game.id} className="bg-white rounded-2xl shadow-sm px-4 py-3.5">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-slate-800">{game.name}</p>
                          {gameVariants.length === 0 && (
                            <button
                              onClick={() => handleSelectGame(game, null)}
                              className="text-sky-600 font-semibold text-sm px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 active:bg-sky-200"
                            >
                              Select
                            </button>
                          )}
                        </div>
                        {gameVariants.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2.5">
                            {gameVariants.map(v => (
                              <button
                                key={v.id}
                                onClick={() => handleSelectGame(game, v)}
                                className="px-3 py-1.5 rounded-xl bg-sky-100 text-sky-700 font-semibold text-sm hover:bg-sky-200 active:bg-sky-300"
                              >
                                {v.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── STEP 2: Pick Players ─────────────────────────────────────── */}
        {step === 'players' && selectedGame && (
          <div>
            {/* Selected game pill */}
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3 mb-4">
              <p className="text-sm font-semibold text-slate-700">
                {selectedGame.name}
                {selectedVariant && (
                  <span className="text-sky-500"> · {selectedVariant.label}</span>
                )}
              </p>
            </div>

            {/* Search input + autocomplete */}
            <div className="relative mb-3">
              <div className="flex items-center gap-2 bg-white rounded-2xl shadow-sm border-2 border-slate-100 px-4 py-3 focus-within:border-sky-400 transition-colors">
                <Search size={16} className="text-slate-300 shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder="Search players…"
                  className="flex-1 text-sm text-slate-800 focus:outline-none bg-transparent"
                  autoComplete="off"
                />
                {search && (
                  <button onClick={() => { setSearch(''); setShowDropdown(false) }}>
                    <X size={14} className="text-slate-300" />
                  </button>
                )}
              </div>
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-slate-100 z-20 overflow-hidden">
                  {suggestions.map((p, i) => (
                    <button
                      key={p.id}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => addPlayer(p.id)}
                      className={`w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-sky-50 flex items-center
                        ${i < suggestions.length - 1 ? 'border-b border-slate-50' : ''}`}
                    >
                      {p.display_name}
                      {i === 0 && <span className="ml-auto text-xs text-slate-300">↵</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected players chips */}
            {selectedPlayers.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedPlayers.map(pid => (
                  <div
                    key={pid}
                    className="flex items-center gap-1.5 bg-sky-500 text-white rounded-xl px-3 py-1.5 text-sm font-semibold"
                  >
                    {getName(pid)}
                    <button onClick={() => removePlayer(pid)} className="opacity-70 hover:opacity-100">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* All players grid */}
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">All Players</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {players.map(p => {
                const isSelected = selectedPlayers.includes(p.id)
                const atMax = selectedGame.max_players != null && selectedPlayers.length >= selectedGame.max_players
                return (
                  <button
                    key={p.id}
                    onClick={() => (isSelected ? removePlayer(p.id) : addPlayer(p.id))}
                    disabled={!isSelected && !!atMax}
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold border-2 transition-all
                      ${isSelected
                        ? 'bg-sky-500 border-sky-500 text-white shadow-md'
                        : atMax
                          ? 'bg-white border-slate-100 text-slate-300 cursor-not-allowed'
                          : 'bg-white border-slate-100 text-slate-700 shadow-sm active:bg-sky-50'
                      }`}
                  >
                    {p.display_name}
                  </button>
                )
              })}
            </div>

            <p className="text-xs text-slate-400 text-center mb-5">
              {selectedPlayers.length} selected
              {selectedGame.min_players != null && ` · min ${selectedGame.min_players}`}
              {selectedGame.max_players != null && ` · max ${selectedGame.max_players}`}
            </p>

            <button
              onClick={handlePlayersNext}
              disabled={selectedPlayers.length < (selectedGame.min_players ?? 2)}
              className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 rounded-2xl shadow-lg text-base transition-colors"
            >
              Next — Enter Result
            </button>
          </div>
        )}

        {/* ── STEP 3: Results ──────────────────────────────────────────── */}
        {step === 'results' && selectedGame && (
          <div>
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3 mb-4">
              <p className="text-sm font-semibold text-slate-700">
                {selectedGame.name}
                {selectedVariant && <span className="text-sky-500"> · {selectedVariant.label}</span>}
                <span className="text-slate-400 font-normal"> · {selectedPlayers.length} players</span>
              </p>
            </div>

            {/* win_loss — 1v1 individual */}
            {selectedGame.scoring_type === 'win_loss' && selectedPlayers.length === 2 && (
              <div>
                <p className="text-sm font-semibold text-slate-600 mb-3">Who won?</p>
                <div className="space-y-2">
                  {results.map(r => (
                    <button
                      key={r.playerId}
                      onClick={() => setWinner(r.playerId)}
                      className={`w-full rounded-2xl px-4 py-4 font-semibold text-sm border-2 transition-all
                        ${r.placement === 1
                          ? 'bg-amber-400 border-amber-400 text-white shadow-md'
                          : 'bg-white border-slate-100 text-slate-700 shadow-sm'
                        }`}
                    >
                      {r.placement === 1 ? '🏆 ' : ''}{getName(r.playerId)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* win_loss — team game (3+ players) */}
            {selectedGame.scoring_type === 'win_loss' && selectedPlayers.length > 2 && (
              <div>
                <p className="text-sm font-semibold text-slate-600 mb-2">Assign teams — hold & drag to swap</p>
                <p className="text-xs text-slate-400 mb-3">Auto-split alphabetically. Drag a name across to swap.</p>
                <TeamDragBoard
                  teamA={teamA}
                  teamB={teamB}
                  getName={getName}
                  onSwap={handleSwapTeams}
                />
                <p className="text-sm font-semibold text-slate-600 mt-5 mb-3">Winning team</p>
                <div className="flex gap-3">
                  {(['A', 'B'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setWinningTeam(t)}
                      className={`flex-1 py-4 rounded-2xl font-bold border-2 transition-all
                        ${winningTeam === t
                          ? t === 'A'
                            ? 'bg-sky-500 border-sky-500 text-white shadow-md'
                            : 'bg-orange-500 border-orange-500 text-white shadow-md'
                          : 'bg-white border-slate-200 text-slate-600 shadow-sm'
                        }`}
                    >
                      {winningTeam === t ? '🏆 ' : ''}{t === 'A' ? '🔵 Team A' : '🟠 Team B'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* placement */}
            {selectedGame.scoring_type === 'placement' && (
              <div>
                <p className="text-sm font-semibold text-slate-600 mb-3">Final placement (1 = 1st)</p>
                <div className="space-y-2">
                  {results.map(r => (
                    <div key={r.playerId} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
                      <span className="flex-1 font-medium text-slate-700">{getName(r.playerId)}</span>
                      <div className="flex gap-1.5">
                        {Array.from({ length: selectedPlayers.length }, (_, i) => i + 1).map(pos => (
                          <button
                            key={pos}
                            onClick={() => setPlacement(r.playerId, pos)}
                            className={`w-10 h-10 rounded-xl font-bold text-sm border-2 transition-all
                              ${r.placement === pos
                                ? pos === 1 ? 'bg-amber-400 border-amber-400 text-white'
                                  : pos === 2 ? 'bg-slate-300 border-slate-300 text-slate-700'
                                  : pos === 3 ? 'bg-amber-700/70 border-amber-700/70 text-white'
                                  : 'bg-sky-500 border-sky-500 text-white'
                                : 'bg-white border-slate-200 text-slate-500'
                              }`}
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

            {/* margin / score */}
            {selectedGame.scoring_type === 'margin' && (
              <div>
                <p className="text-sm font-semibold text-slate-600 mb-3">Final scores (highest wins)</p>
                <div className="space-y-2">
                  {results.map(r => (
                    <div key={r.playerId} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
                      <span className="flex-1 font-medium text-slate-700">{getName(r.playerId)}</span>
                      <input
                        type="number"
                        value={r.score}
                        onChange={e => setScore(r.playerId, e.target.value)}
                        placeholder="0"
                        min={0}
                        inputMode="numeric"
                        className="w-20 border-2 border-slate-200 rounded-xl px-3 py-2 text-center text-slate-800 font-bold focus:border-sky-400 focus:outline-none text-base"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optional note */}
            <div className="mt-5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Optional note</label>
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
              Review & Submit →
            </button>
          </div>
        )}

        {/* ── STEP 4: Confirm ──────────────────────────────────────────── */}
        {step === 'confirm' && selectedGame && (
          <div>
            <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Game</p>
              <p className="font-bold text-slate-800 text-lg">
                {selectedGame.name}
                {selectedVariant && (
                  <span className="text-sky-500 font-semibold"> · {selectedVariant.label}</span>
                )}
              </p>
              {note && <p className="text-sm text-slate-500 mt-1">"{note}"</p>}
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-3">Results</p>
              <div className="space-y-2">
                {[...results].sort((a, b) => a.placement - b.placement).map(r => (
                  <div key={r.playerId} className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                        ${r.placement === 1 ? 'bg-amber-400 text-white'
                          : r.placement === 2 ? 'bg-slate-300 text-slate-700'
                          : r.placement === 3 ? 'bg-amber-700/70 text-white'
                          : 'bg-slate-100 text-slate-500'
                        }`}
                    >
                      {r.placement}
                    </span>
                    <span className="flex-1 font-medium text-slate-700">{getName(r.playerId)}</span>
                    {r.team && (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-lg
                          ${r.team === 'A' ? 'bg-sky-100 text-sky-600' : 'bg-orange-100 text-orange-600'}`}
                      >
                        Team {r.team}
                      </span>
                    )}
                    {r.score !== '' && (
                      <span className="text-sm text-slate-500">{r.score} pts</span>
                    )}
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
            <button onClick={() => setStep('results')} className="mt-3 w-full text-slate-400 text-sm py-2">
              ← Edit result
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
