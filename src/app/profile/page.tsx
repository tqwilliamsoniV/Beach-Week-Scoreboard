'use client'
import { usePlayer } from '@/components/PlayerProvider'
import { PlayerProfileView } from '@/components/PlayerProfileView'
import { BottomNav } from '@/components/BottomNav'
import { useRouter } from 'next/navigation'

export default function MyProfilePage() {
  const { player, clearPlayer } = usePlayer()
  const router = useRouter()

  if (!player) {
    return (
      <div className="flex flex-col min-h-screen pb-20">
        <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-4 pt-12 pb-6 text-white">
          <h1 className="text-2xl font-bold">My Stats</h1>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
          <p className="text-slate-400 mb-4">No player selected. Tap your name on the leaderboard.</p>
          <button onClick={() => router.push('/')} className="bg-sky-500 text-white font-bold px-6 py-3 rounded-2xl">
            Go to Leaderboard
          </button>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <PlayerProfileView playerId={player.id} />
      <div className="px-4 pb-4">
        <button
          onClick={() => {
            clearPlayer()
            router.push('/')
          }}
          className="w-full text-slate-400 text-sm py-3 border border-slate-200 rounded-2xl"
        >
          Switch player
        </button>
      </div>
      <BottomNav />
    </div>
  )
}
