import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogGameForm } from './LogGameForm'
import { BottomNav } from '@/components/BottomNav'

export default async function LogGamePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: games }, { data: players }, { data: profile }] = await Promise.all([
    supabase.from('games').select('*').eq('is_active', true).order('category').order('name'),
    supabase.from('users').select('id, display_name, is_commissioner').order('display_name'),
    supabase.from('users').select('is_commissioner').eq('id', user.id).single(),
  ])

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <LogGameForm
        games={games ?? []}
        players={players ?? []}
        currentUserId={user.id}
      />
      <BottomNav isCommissioner={profile?.is_commissioner ?? false} />
    </div>
  )
}
