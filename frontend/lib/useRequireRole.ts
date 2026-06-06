'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, type Role, type Session } from './auth'

// Client-side route guard. Static export has no middleware, so each dashboard
// calls this. Returns the session once confirmed; redirects to /login if the
// visitor is missing a session or has the wrong role.
export function useRequireRole(role: Role): { session: Session | null; ready: boolean } {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const s = getSession()
    if (!s || s.role !== role) {
      router.replace('/login')
      return
    }
    setSession(s)
    setReady(true)
  }, [role, router])

  return { session, ready }
}
