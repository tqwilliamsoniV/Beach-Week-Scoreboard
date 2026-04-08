'use client'
import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Game, Player, GameVariant } from '@/types'
import { CATEGORY_EMOJI } from '@/lib/scoring'
import { useToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Plus, Pencil, Trash2, RotateCcw, Save, Lock } from 'lucide-react'

type AdminTab = 'games' | 'players' | 'settings'
const CATEGORIES = ['Beach', 'Pool', 'Board', 'Card', 'Other'] as const
const SCORING_TYPES = [
  { value: 'win_loss',  label: 'Win / Loss' },
  { value: 'placement', label: 'Full Placement' },
  { value: 'margin',    label: 'Score / Margin' },
] as const
const DEFAULT_GAME: Omit<Game, 'id' | 'created_at'> = {
  name: '', category: 'Beach', scoring_type: 'win_loss',
  weight: 1.0, min_players: 2, max_players: 8, notes: null, is_active: true,
}

// ─── PIN Gate ─────────────────────────────────────────────────────────────────
function PinGate({ correctPin, onUnlock }: { correctPin: string; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  function check() {
    if (pin === correctPin) {
      sessionStorage.setItem('beach_admin', '1')
      onUnlock()
    } else {
      setError(true)
      setPin('')
      setTimeout(() => setError(false), 1500)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-8">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-xs text-center">
        <div className="w-14 h-14 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock size={24} className="text-sky-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">Commissioner Access</h2>
        <p className="text-sm text-slate-400 mb-6">Enter the admin PIN</p>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && check()}
          placeholder="PIN"
          className={`w-full border-2 rounded-xl px-4 py-3 text-center text-2xl font-bold tracking-widest focus:outline-none mb-4 transition-colors
            ${error ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-sky-400'}`}
          autoFocus
        />
        {error && <p className="text-red-500 text-sm mb-3">Wrong PIN. Try again.</p>}
        <button onClick={check}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl">
          Unlock
        </button>
        <p className="text-xs text-slate-300 mt-4">Default PIN: 1234</p>
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function AdminPanel({
  initialGames,
  initialPlayers,
  settings: initialSettings,
}: {
  initialGames: Game[]
  initialPlayers: Player[]
  settings: Record<string, string>
}) {
  const router = useRouter()
  const [unlocked, setUnlocked]       = useState(false)
  const [tab, setTab]                 = useState<AdminTab>('players')
  const [games, setGames]             = useState(initialGames)
  const [players, setPlayers]         = useState(initialPlayers)
  const [settings, setSettings]       = useState(initialSettings)
  const [editingGame, setEditingGame] = useState<Partial<Game> | null>(null)
  const [editingPlayer, setEditingPlayer] = useState<Partial<Player> | null>(null)
  const [variantsByGame, setVariantsByGame] = useState<Map<string, GameVariant[]>>(new Map())
  const [newVariantLabel, setNewVariantLabel] = useState('')
  const [, startTransition]           = useTransition()
  const { show, ToastEl }             = useToast()

  useEffect(() => {
    setUnlocked(sessionStorage.getItem('beach_admin') === '1')
  }, [])

  useEffect(() => {
    if (!unlocked) return
    supabase.from('game_variants').select('*').order('sort_order').then(({ data }) => {
      if (!data) return
      const map = new Map<string, GameVariant[]>()
      for (const v of data) {
        if (!map.has(v.game_id)) map.set(v.game_id, [])
        map.get(v.game_id)!.push(v)
      }
      setVariantsByGame(map)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked])

  const supabase = createClient()
  const correctPin = settings.commissioner_pin ?? '1234'

  if (!unlocked) {
    return (
      <div>
        <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-3">
          <h1 className="text-xl font-bold text-slate-800">Admin Panel</h1>
        </div>
        <PinGate correctPin={correctPin} onUnlock={() => setUnlocked(true)} />
        <BottomNavSpacer />
      </div>
    )
  }

  // ── GAMES ──────────────────────────────────────────────────────────────────
  async function saveGame() {
    if (!editingGame || !editingGame.name?.trim()) { show('Game name is required.', 'error'); return }
    const isNew = !editingGame.id

    if (isNew) {
      const { data, error } = await supabase.from('games').insert({
        name: editingGame.name.trim(), category: editingGame.category!,
        scoring_type: editingGame.scoring_type!, weight: Number(editingGame.weight),
        min_players: editingGame.min_players ?? null, max_players: editingGame.max_players ?? null,
        notes: editingGame.notes ?? null, is_active: true,
      }).select().single()
      if (error) { show(error.message, 'error'); return }
      setGames(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    } else {
      const existing = games.find(g => g.id === editingGame.id)
      const weightChanged = existing && Number(existing.weight) !== Number(editingGame.weight)
      if (weightChanged) {
        if (!confirm('Changing this weight will recalculate all historical results. Continue?')) return
        // Recalculate points for existing entries
        const { data: affected } = await supabase
          .from('result_entries').select('id, placement')
          .eq('result_id', supabase.from('game_results').select('id').eq('game_id', editingGame.id!) as never)
        // Simple recalc: re-fetch all entries for this game via join
        const { data: gameEntries } = await supabase
          .from('result_entries')
          .select('id, placement, game_results!inner(game_id)')
          .eq('game_results.game_id', editingGame.id!)
        if (gameEntries) {
          const newWeight = Number(editingGame.weight)
          const type = editingGame.scoring_type!
          for (const entry of gameEntries) {
            let pts = 0
            if (entry.placement === 1) pts = 1.0 * newWeight
            else if (type === 'placement' && entry.placement === 2) pts = 0.6 * newWeight
            else if (type === 'placement' && entry.placement === 3) pts = 0.3 * newWeight
            await supabase.from('result_entries').update({ points_earned: pts }).eq('id', entry.id)
          }
        }
      }
      const { error } = await supabase.from('games').update({
        name: editingGame.name.trim(), category: editingGame.category!,
        scoring_type: editingGame.scoring_type!, weight: Number(editingGame.weight),
        min_players: editingGame.min_players ?? null, max_players: editingGame.max_players ?? null,
        notes: editingGame.notes ?? null,
      }).eq('id', editingGame.id!)
      if (error) { show(error.message, 'error'); return }
      setGames(prev => prev.map(g => g.id === editingGame.id ? { ...g, ...editingGame } as Game : g))
    }
    setEditingGame(null)
    show(isNew ? 'Game added!' : 'Game updated!', 'success')
  }

  async function deleteGame(game: Game) {
    const { count } = await supabase.from('game_results').select('id', { count: 'exact', head: true }).eq('game_id', game.id)
    const msg = count && count > 0 ? `Delete "${game.name}" and all ${count} result(s)? Cannot be undone.` : `Delete "${game.name}"?`
    if (!confirm(msg)) return
    const { error } = await supabase.from('games').delete().eq('id', game.id)
    if (error) { show(error.message, 'error'); return }
    setGames(prev => prev.filter(g => g.id !== game.id))
    show('Game deleted.', 'success')
  }

  // ── VARIANTS ───────────────────────────────────────────────────────────────
  async function addVariant(gameId: string) {
    const label = newVariantLabel.trim()
    if (!label) return
    const existing = variantsByGame.get(gameId) ?? []
    const { data, error } = await supabase
      .from('game_variants')
      .insert({ game_id: gameId, label, sort_order: existing.length })
      .select()
      .single()
    if (error) { show(error.message, 'error'); return }
    setVariantsByGame(prev => {
      const next = new Map(prev)
      next.set(gameId, [...(next.get(gameId) ?? []), data])
      return next
    })
    setNewVariantLabel('')
    show('Variant added!', 'success')
  }

  async function deleteVariant(variantId: string, gameId: string) {
    await supabase.from('game_variants').delete().eq('id', variantId)
    setVariantsByGame(prev => {
      const next = new Map(prev)
      next.set(gameId, (next.get(gameId) ?? []).filter(v => v.id !== variantId))
      return next
    })
  }

  // ── PLAYERS ────────────────────────────────────────────────────────────────
  async function savePlayer() {
    if (!editingPlayer) return
    const isNew = !editingPlayer.id
    if (!editingPlayer.display_name?.trim()) { show('Name is required.', 'error'); return }

    if (isNew) {
      const { data, error } = await supabase.from('players').insert({
        display_name: editingPlayer.display_name.trim(),
        is_eligible: editingPlayer.is_eligible ?? true,
      }).select().single()
      if (error) { show(error.message, 'error'); return }
      setPlayers(prev => [...prev, data].sort((a, b) => a.display_name.localeCompare(b.display_name)))
    } else {
      const { error } = await supabase.from('players').update({
        display_name: editingPlayer.display_name.trim(),
        is_eligible: editingPlayer.is_eligible,
      }).eq('id', editingPlayer.id!)
      if (error) { show(error.message, 'error'); return }
      setPlayers(prev => prev.map(p => p.id === editingPlayer.id ? { ...p, ...editingPlayer } as Player : p))
    }
    setEditingPlayer(null)
    show(isNew ? 'Player added!' : 'Player updated!', 'success')
    startTransition(() => router.refresh())
  }

  async function deletePlayer(player: Player) {
    if (!confirm(`Remove ${player.display_name}? Their game history will be kept.`)) return
    const { error } = await supabase.from('players').delete().eq('id', player.id)
    if (error) { show(error.message, 'error'); return }
    setPlayers(prev => prev.filter(p => p.id !== player.id))
    show('Player removed.', 'success')
  }

  // ── SETTINGS ───────────────────────────────────────────────────────────────
  async function saveSettings() {
    for (const [key, value] of Object.entries(settings)) {
      await supabase.from('settings').upsert({ key, value })
    }
    show('Settings saved!', 'success')
  }

  async function resetAllResults() {
    if (!confirm('Delete ALL game results? This cannot be undone.')) return
    const typed = prompt('Type RESET to confirm:')
    if (typed !== 'RESET') { show('Reset cancelled.', 'error'); return }
    await supabase.from('game_results').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    show('All results deleted. Fresh start!', 'success')
    startTransition(() => router.refresh())
  }

  const TABS: { id: AdminTab; label: string }[] = [
    { id: 'players',  label: 'Players' },
    { id: 'games',    label: 'Games' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="flex flex-col">
      {ToastEl}
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-slate-800">Admin Panel</h1>
          <button onClick={() => { sessionStorage.removeItem('beach_admin'); setUnlocked(false) }}
            className="text-xs text-slate-400 px-3 py-1.5 rounded-xl border border-slate-200">
            Lock
          </button>
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors
                ${tab === t.id ? 'bg-sky-100 text-sky-700' : 'text-slate-400 hover:text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">

        {/* ── PLAYERS ─────────────────────────────────────────────────── */}
        {tab === 'players' && (
          <div>
            <button onClick={() => setEditingPlayer({ display_name: '', is_eligible: true })}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 mb-4">
              <Plus size={18} /> Add Player
            </button>
            <div className="space-y-2">
              {players.map(player => (
                <div key={player.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{player.display_name}</p>
                    {!player.is_eligible && <p className="text-xs text-slate-400">Ineligible for awards</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditingPlayer({ ...player })} className="p-2 text-slate-400 hover:text-sky-500">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => deletePlayer(player)} className="p-2 text-slate-400 hover:text-red-400">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── GAMES ───────────────────────────────────────────────────── */}
        {tab === 'games' && (
          <div>
            <button onClick={() => setEditingGame({ ...DEFAULT_GAME })}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 mb-4">
              <Plus size={18} /> Add Game
            </button>
            <div className="space-y-2">
              {games.map(game => (
                <div key={game.id} className="bg-white rounded-2xl shadow-sm px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{CATEGORY_EMOJI[game.category]} {game.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {game.scoring_type === 'win_loss' ? 'Win/Loss' : game.scoring_type === 'placement' ? 'Full Placement' : 'Score/Margin'}
                        {' · '}Weight {game.weight}{game.notes ? ` · ${game.notes}` : ''}
                        {(variantsByGame.get(game.id)?.length ?? 0) > 0 && ` · ${variantsByGame.get(game.id)!.length} variant${variantsByGame.get(game.id)!.length > 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditingGame({ ...game })} className="p-2 text-slate-400 hover:text-sky-500"><Pencil size={15} /></button>
                      <button onClick={() => deleteGame(game)} className="p-2 text-slate-400 hover:text-red-400"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS ─────────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <h2 className="font-bold text-slate-700">Leaderboard</h2>
              <SettingField label="Min games for Champion eligibility" value={settings.min_game_threshold ?? '15'} onChange={v => setSettings(p => ({ ...p, min_game_threshold: v }))} type="number" />
              <SettingField label="Bayesian prior (default 0.4)" value={settings.bayesian_prior ?? '0.4'} onChange={v => setSettings(p => ({ ...p, bayesian_prior: v }))} type="number" />
              <SettingField label="Bayesian C weight (default 5.0)" value={settings.bayesian_c ?? '5.0'} onChange={v => setSettings(p => ({ ...p, bayesian_c: v }))} type="number" />
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <h2 className="font-bold text-slate-700">Security</h2>
              <SettingField label="Admin PIN" value={settings.commissioner_pin ?? '1234'} onChange={v => setSettings(p => ({ ...p, commissioner_pin: v }))} type="password" />
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <h2 className="font-bold text-slate-700">Trip Dates (display only)</h2>
              <SettingField label="Trip start" value={settings.trip_start ?? ''} onChange={v => setSettings(p => ({ ...p, trip_start: v }))} type="date" />
              <SettingField label="Trip end"   value={settings.trip_end ?? ''}   onChange={v => setSettings(p => ({ ...p, trip_end: v }))}   type="date" />
            </div>
            <button onClick={saveSettings}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2">
              <Save size={18} /> Save Settings
            </button>
            <div className="bg-red-50 rounded-2xl p-5 border border-red-100">
              <h2 className="font-bold text-red-700 mb-2">Danger Zone</h2>
              <p className="text-xs text-red-500 mb-3">Permanently deletes all logged game results.</p>
              <button onClick={resetAllResults}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-5 rounded-xl text-sm flex items-center gap-2">
                <RotateCcw size={16} /> Reset All Results
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Game Modal */}
      {editingGame && (
        <Modal title={editingGame.id ? 'Edit Game' : 'Add Game'} onClose={() => { setEditingGame(null); setNewVariantLabel('') }}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Game Name *</label>
              <input type="text" value={editingGame.name ?? ''} onChange={e => setEditingGame(g => ({ ...g, name: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                placeholder="e.g. Spikeball" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
                <select value={editingGame.category ?? 'Beach'} onChange={e => setEditingGame(g => ({ ...g, category: e.target.value as Game['category'] }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Scoring</label>
                <select value={editingGame.scoring_type ?? 'win_loss'} onChange={e => setEditingGame(g => ({ ...g, scoring_type: e.target.value as Game['scoring_type'] }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                  {SCORING_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Weight</label>
                <input type="number" step="0.5" min="0.5" max="5" value={editingGame.weight ?? 1.0}
                  onChange={e => setEditingGame(g => ({ ...g, weight: Number(e.target.value) }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Min Players</label>
                <input type="number" min="2" value={editingGame.min_players ?? ''}
                  onChange={e => setEditingGame(g => ({ ...g, min_players: Number(e.target.value) || null }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Max Players</label>
                <input type="number" min="2" value={editingGame.max_players ?? ''}
                  onChange={e => setEditingGame(g => ({ ...g, max_players: Number(e.target.value) || null }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Notes (optional)</label>
              <input type="text" value={editingGame.notes ?? ''} onChange={e => setEditingGame(g => ({ ...g, notes: e.target.value || null }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                placeholder='e.g. "Teams of 2"' />
            </div>
            <button onClick={saveGame} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl mt-1">
              {editingGame.id ? 'Save Changes' : 'Add Game'}
            </button>

            {/* Variants — only for saved games */}
            {editingGame.id ? (
              <div className="border-t border-slate-100 pt-4 mt-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Variants</label>
                <p className="text-xs text-slate-400 mb-2">e.g. "to 11", "to 21", "30 min game"</p>
                <div className="space-y-1.5 mb-2">
                  {(variantsByGame.get(editingGame.id) ?? []).map(v => (
                    <div key={v.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                      <span className="text-sm text-slate-700">{v.label}</span>
                      <button onClick={() => deleteVariant(v.id, editingGame.id!)} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newVariantLabel}
                    onChange={e => setNewVariantLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addVariant(editingGame.id!)}
                    placeholder='e.g. "to 21"'
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                  <button
                    onClick={() => addVariant(editingGame.id!)}
                    className="bg-sky-100 hover:bg-sky-200 text-sky-700 font-semibold px-4 py-2 rounded-xl text-sm"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 border-t border-slate-100 pt-3 mt-1">
                Save the game first, then edit it to add variants.
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* Edit Player Modal */}
      {editingPlayer && (
        <Modal title={editingPlayer.id ? 'Edit Player' : 'Add Player'} onClose={() => setEditingPlayer(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Display Name *</label>
              <input type="text" value={editingPlayer.display_name ?? ''} onChange={e => setEditingPlayer(p => p ? { ...p, display_name: e.target.value } : p)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                placeholder="e.g. Uncle Tim" autoFocus />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setEditingPlayer(p => p ? { ...p, is_eligible: !p.is_eligible } : p)}
                className={`w-12 h-6 rounded-full transition-colors relative ${editingPlayer.is_eligible !== false ? 'bg-sky-500' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                  ${editingPlayer.is_eligible !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Eligible for awards</p>
                <p className="text-xs text-slate-400">Turn off for kids or guests who shouldn't compete</p>
              </div>
            </label>
            <button onClick={savePlayer} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl">
              {editingPlayer.id ? 'Save Changes' : 'Add Player'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SettingField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400" />
    </div>
  )
}

function BottomNavSpacer() { return <div className="h-20" /> }
