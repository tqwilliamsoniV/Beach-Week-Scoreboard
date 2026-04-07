import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminPanel } from './AdminPanel'
import { BottomNav } from '@/components/BottomNav'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('is_commissioner')
    .eq('id', user.id)
    .single()

  if (!profile?.is_commissioner) redirect('/')

  const [{ data: games }, { data: players }, { data: settings }] = await Promise.all([
    supabase.from('games').select('*').order('category').order('name'),
    supabase.from('users').select('*').order('display_name'),
    supabase.from('settings').select('*'),
  ])

  const settingsMap = Object.fromEntries((settings ?? []).map(s => [s.key, s.value]))

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <AdminPanel
        initialGames={games ?? []}
        initialPlayers={players ?? []}
        settings={settingsMap}
      />
      <BottomNav isCommissioner />
    </div>
  )
}
