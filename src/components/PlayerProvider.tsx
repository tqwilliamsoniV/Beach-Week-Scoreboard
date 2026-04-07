'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Player } from '@/types'

interface PlayerCtx {
  player: Player | null
  setPlayer: (p: Player) => void
  clearPlayer: () => void
  ready: boolean
}

const Ctx = createContext<PlayerCtx>({
  player: null, setPlayer: () => {}, clearPlayer: () => {}, ready: false,
})

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayerState] = useState<Player | null>(null)
  const [ready, setReady]        = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [allPlayers, setAllPlayers] = useState<Player[]>([])

  useEffect(() => {
    const stored = localStorage.getItem('beach_player')
    if (stored) {
      try { setPlayerState(JSON.parse(stored)) } catch {}
    }
    setReady(true)
  }, [])

  // If ready and no player chosen, load player list and show picker
  useEffect(() => {
    if (!ready || player) return
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('players').select('*').order('display_name')
      setAllPlayers(data ?? [])
      if ((data ?? []).length > 0) setShowPicker(true)
    }
    load()
  }, [ready, player])

  function setPlayer(p: Player) {
    localStorage.setItem('beach_player', JSON.stringify(p))
    setPlayerState(p)
    setShowPicker(false)
  }

  function clearPlayer() {
    localStorage.removeItem('beach_player')
    setPlayerState(null)
  }

  return (
    <Ctx.Provider value={{ player, setPlayer, clearPlayer, ready }}>
      {children}
      {showPicker && (
        <PlayerPickerModal
          players={allPlayers}
          onSelect={setPlayer}
        />
      )}
    </Ctx.Provider>
  )
}

export const usePlayer = () => useContext(Ctx)

function PlayerPickerModal({
  players,
  onSelect,
}: {
  players: Player[]
  onSelect: (p: Player) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gradient-to-b from-sky-500/90 to-sky-700/90 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl p-6 pb-10 sm:pb-6">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏖️</div>
          <h2 className="text-2xl font-bold text-slate-800">Who are you?</h2>
          <p className="text-slate-500 text-sm mt-1">Tap your name to get started</p>
        </div>
        {players.length === 0 ? (
          <p className="text-center text-slate-400 py-4">
            No players set up yet. Ask the commissioner to add players in the Admin panel.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {players.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className="bg-sky-50 hover:bg-sky-100 active:bg-sky-200 border-2 border-sky-200 hover:border-sky-400 rounded-2xl px-4 py-4 font-semibold text-slate-700 text-sm transition-all"
              >
                {p.display_name}
              </button>
            ))}
          </div>
        )}
        <p className="text-center text-xs text-slate-300 mt-5">
          You can change this anytime from your profile
        </p>
      </div>
    </div>
  )
}
