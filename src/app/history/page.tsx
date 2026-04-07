import { createClient } from '@/lib/supabase/server'
import { GameHistory } from './GameHistory'
import { BottomNav } from '@/components/BottomNav'

export default async function HistoryPage() {
  const supabase = createClient()
  const [{ data: results }, { data: games }, { data: players }] = await Promise.all([
    supabase
      .from('game_results')
      .select('*, games(*), result_entries(*, players(id, display_name)), logger:players!game_results_logged_by_fkey(id, display_name)')
      .order('played_at', { ascending: false })
      .limit(200),
    supabase.from('games').select('id, name, category').order('name'),
    supabase.from('players').select('id, display_name').order('display_name'),
  ])

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <GameHistory results={results ?? []} games={games ?? []} players={players ?? []} />
      <BottomNav />
    </div>
  )
}
