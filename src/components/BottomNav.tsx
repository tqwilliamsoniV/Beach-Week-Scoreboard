'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Trophy, History, User, Settings } from 'lucide-react'

const links = [
  { href: '/',        label: 'Leaderboard', icon: Trophy },
  { href: '/history', label: 'History',     icon: History },
  { href: '/profile', label: 'My Stats',    icon: User },
  { href: '/admin',   label: 'Admin',       icon: Settings },
]

export function BottomNav() {
  const path = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex">
      {links.map(({ href, label, icon: Icon }) => {
        const active = path === href || (href !== '/' && path.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors
              ${active ? 'text-sky-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
