'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const NAV = [
  { href: '/coordinator', label: 'Coordinator' },
  { href: '/donor', label: 'Donor' },
  { href: '/family', label: 'Family' },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-paper/70 border-b border-marrow-100/60">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <Logo />
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tightest text-marrow-900">Marrow</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-marrow-600/70">Living Blood Network</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1 p-1 rounded-full bg-marrow-100/70 ring-1 ring-marrow-200/60">
          {NAV.map(item => {
            const active = pathname?.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-marrow-900 text-marrow-50 shadow-soft'
                    : 'text-marrow-800 hover:bg-white/60'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <Link
          href="/coordinator"
          className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-marrow-600 hover:bg-marrow-700 text-white text-sm font-semibold transition-colors"
        >
          Open dashboard
          <span aria-hidden>→</span>
        </Link>
      </div>
    </header>
  )
}

function Logo() {
  // Inline SVG keeps the navbar render path zero-dependency.
  return (
    <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none" aria-hidden>
      <defs>
        <radialGradient id="g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ECA0A0" />
          <stop offset="100%" stopColor="#BB2B29" />
        </radialGradient>
      </defs>
      <path
        d="M16 3C10 12 6 17 6 22a10 10 0 0 0 20 0c0-5-4-10-10-19Z"
        fill="url(#g)"
      />
      <path
        d="M16 3C10 12 6 17 6 22a10 10 0 0 0 20 0c0-5-4-10-10-19Z"
        stroke="#530404"
        strokeOpacity="0.18"
      />
    </svg>
  )
}
