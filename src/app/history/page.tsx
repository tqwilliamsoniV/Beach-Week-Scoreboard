import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GameHistory } from './GameHistory'
import { BottomNav } from '@/components/BottomNav'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: results }, { data: games }, { data: players }, { data: profile }] = await Promise.all([
    supabase
      .from('game_results')
      .select('*, games(*), result_entries(*, users(id, display_name)), logger:users!game_results_logged_by_fkey(id, display_name)')
      .order('played_at', { ascending: false })
      .limit(200),
    supabase.from('games').select('id, name, category').order('name'),
    supabase.from('users').select('id, display_name').order('display_name'),
    supabase.from('users').select('is_commissioner').eq('id', user.id).single(),
  ])

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <GameHistory
        results={results ?? []}
        games={games ?? []}
        players={players ?? []}
        isCommissioner={profile?.is_commissioner ?? false}
        currentUserId={user.id}
      />
      <BottomNav isCommissioner={profile?.is_commissioner ?? false} />
    </div>
  )
}
