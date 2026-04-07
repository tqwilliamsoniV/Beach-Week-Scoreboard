import { createClient } from '@/lib/supabase/server'
import { AdminPanel } from './AdminPanel'
import { BottomNav } from '@/components/BottomNav'

export default async function AdminPage() {
  const supabase = createClient()
  const [{ data: games }, { data: players }, { data: settings }] = await Promise.all([
    supabase.from('games').select('*').order('category').order('name'),
    supabase.from('players').select('*').order('display_name'),
    supabase.from('settings').select('*'),
  ])
  const settingsMap = Object.fromEntries((settings ?? []).map(s => [s.key, s.value]))

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <AdminPanel initialGames={games ?? []} initialPlayers={players ?? []} settings={settingsMap} />
      <BottomNav />
    </div>
  )
}
