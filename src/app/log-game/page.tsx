import { createClient } from '@/lib/supabase/server'
import { LogGameForm } from './LogGameForm'
import { BottomNav } from '@/components/BottomNav'

export const dynamic = 'force-dynamic'

export default async function LogGamePage() {
  const supabase = createClient()
  const [{ data: games }, { data: players }] = await Promise.all([
    supabase.from('games').select('*').eq('is_active', true).order('category').order('name'),
    supabase.from('players').select('id, display_name').order('display_name'),
  ])

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <LogGameForm games={games ?? []} players={players ?? []} />
      <BottomNav />
    </div>
  )
}
