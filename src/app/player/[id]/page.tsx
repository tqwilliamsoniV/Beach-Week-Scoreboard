import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlayerProfileView } from '@/components/PlayerProfileView'
import { BottomNav } from '@/components/BottomNav'

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('is_commissioner')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <PlayerProfileView playerId={id} />
      <BottomNav isCommissioner={profile?.is_commissioner ?? false} />
    </div>
  )
}
