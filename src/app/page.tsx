import { Leaderboard } from '@/components/Leaderboard'
import { BottomNav } from '@/components/BottomNav'

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Leaderboard />
      <BottomNav />
    </div>
  )
}
