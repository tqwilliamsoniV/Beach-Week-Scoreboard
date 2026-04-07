'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Waves } from 'lucide-react'

export default function RegisterPage() {
  const router  = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (displayName.trim().length < 2) {
      setError('Name must be at least 2 characters.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase  = createClient()
    const fakeEmail = `${displayName.trim().toLowerCase().replace(/\s+/g, '.')}@beachweek.local`

    const { error: signUpErr } = await supabase.auth.signUp({
      email: fakeEmail,
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: undefined,
      },
    })

    if (signUpErr) {
      if (signUpErr.message.includes('already registered')) {
        setError('That name is already taken. Choose a different one.')
      } else {
        setError(signUpErr.message)
      }
      setLoading(false)
      return
    }

    // Auto-sign in after registration
    await supabase.auth.signInWithPassword({ email: fakeEmail, password })
    router.push('/')
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-sky-400 to-sky-600 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="bg-white/20 rounded-full p-4">
              <Waves size={40} className="text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">Beach Week</h1>
          <p className="text-sky-100 mt-1">Scoreboard</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-5">Create account</h2>
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Your name (shown on leaderboard)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. Uncle Tim"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 text-base"
                required
                autoComplete="name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 text-base"
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 text-base"
                required
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm bg-red-50 rounded-xl px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white font-bold py-3.5 rounded-xl text-base transition-colors"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-sky-600 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
