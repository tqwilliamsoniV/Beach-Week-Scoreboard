'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Waves } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword]       = useState('')
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    // We use display_name as the "email" field with a fake domain so Supabase auth works
    const fakeEmail = `${displayName.toLowerCase().replace(/\s+/g, '.')}@beachweek.local`

    const { error: err } = await supabase.auth.signInWithPassword({
      email: fakeEmail,
      password,
    })

    if (err) {
      setError('Incorrect name or password. Ask the commissioner if you need help.')
    } else {
      router.push('/')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-sky-400 to-sky-600 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="bg-white/20 rounded-full p-4">
              <Waves size={40} className="text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">Beach Week</h1>
          <p className="text-sky-100 mt-1">Scoreboard</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-5">Sign in</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Your name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. Uncle Tim"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 text-base"
                required
                autoComplete="username"
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
                placeholder="••••••••"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 text-base"
                required
                autoComplete="current-password"
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
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-4">
            New player?{' '}
            <Link href="/register" className="text-sky-600 font-medium">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
