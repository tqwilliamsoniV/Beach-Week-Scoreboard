import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { displayName, password } = await request.json()

  if (!displayName?.trim() || displayName.trim().length < 2) {
    return NextResponse.json({ error: 'Name must be at least 2 characters.' }, { status: 400 })
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }

  const fakeEmail = `${displayName.trim().toLowerCase().replace(/\s+/g, '.')}@beachweek.local`

  // Use admin client to create user with email_confirm: true (bypasses email confirmation)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check if display name already taken
  const { data: existing } = await adminClient
    .from('users')
    .select('id')
    .eq('display_name', displayName.trim())
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'That name is already taken. Choose a different one.' }, { status: 409 })
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: fakeEmail,
    password,
    user_metadata: { display_name: displayName.trim() },
    email_confirm: true, // auto-confirm — no email sent
  })

  if (error) {
    if (error.message.includes('already been registered')) {
      return NextResponse.json({ error: 'That name is already taken. Choose a different one.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email: fakeEmail })
}
