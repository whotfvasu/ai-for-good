'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getSession, logout, ROLE_LABEL, HOME_FOR, type Session } from '@/lib/auth'

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSessionState] = useState<Session | null>(null)

  // Re-read session on every navigation so login/logout reflect immediately.
  useEffect(() => {
    setSessionState(getSession())
  }, [pathname])

  const onLogout = () => {
    logout()
    setSessionState(null)
    router.replace('/login')
  }

  // Hide the nav chrome entirely on the login page for a clean focus.
  const onLogin = pathname === '/login'

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-paper/70 border-b border-marrow-100/60">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link href={session ? HOME_FOR[session.role] : '/'} className="flex items-center gap-2 group">
          <Logo />
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tightest text-marrow-900">Marrow</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-marrow-600/70">Living Blood Network</div>
          </div>
        </Link>

        {!onLogin && session && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-semibold text-marrow-900 max-w-[200px] truncate">{session.name}</span>
              <span className="text-[10px] uppercase tracking-[0.15em] text-marrow-600/70">
                {ROLE_LABEL[session.role]}
              </span>
            </div>
            <div className="w-9 h-9 rounded-full bg-marrow-900 text-marrow-50 grid place-items-center text-sm font-semibold">
              {session.name.slice(0, 1).toUpperCase()}
            </div>
            <button
              onClick={onLogout}
              className="px-3.5 py-1.5 rounded-full text-sm font-medium text-marrow-800 ring-1 ring-marrow-200/60 hover:bg-marrow-50 transition-colors"
            >
              Logout
            </button>
          </div>
        )}

        {!onLogin && !session && (
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-marrow-600 hover:bg-marrow-700 text-white text-sm font-semibold transition-colors"
          >
            Sign in
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </header>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none" aria-hidden>
      <defs>
        <radialGradient id="g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ECA0A0" />
          <stop offset="100%" stopColor="#BB2B29" />
        </radialGradient>
      </defs>
      <path d="M16 3C10 12 6 17 6 22a10 10 0 0 0 20 0c0-5-4-10-10-19Z" fill="url(#g)" />
      <path d="M16 3C10 12 6 17 6 22a10 10 0 0 0 20 0c0-5-4-10-10-19Z" stroke="#530404" strokeOpacity="0.18" />
    </svg>
  )
}
