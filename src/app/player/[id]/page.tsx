import { PlayerProfileView } from '@/components/PlayerProfileView'
import { BottomNav } from '@/components/BottomNav'

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="flex flex-col min-h-screen pb-20">
      <PlayerProfileView playerId={id} />
      <BottomNav />
    </div>
  )
}
