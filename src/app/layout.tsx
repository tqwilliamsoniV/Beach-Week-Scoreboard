import type { Metadata, Viewport } from 'next'
import { PlayerProvider } from '@/components/PlayerProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Beach Week Scoreboard',
  description: 'Family beach trip game tracker with live leaderboard',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0369a1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full min-h-screen bg-sky-50">
        <PlayerProvider>
          {children}
        </PlayerProvider>
      </body>
    </html>
  )
}
