// Lightweight client-side session. Demo-grade — no real passwords, no JWT.
// The dataset has no names, so a "login" picks a real DynamoDB row id and a
// role, and we remember it in localStorage. Route guards read this to gate
// each dashboard. Static export can't run middleware, so guards are
// client-side redirects (see useRequireRole).

export type Role = 'patient' | 'donor' | 'coordinator'

export interface Session {
  role: Role
  id: string // real DB row id (patient_id / donor_id), or 'admin' for coordinator
  name: string // friendly display label
}

const KEY = 'marrow-session'

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function setSession(s: Session): void {
  window.localStorage.setItem(KEY, JSON.stringify(s))
}

export function logout(): void {
  window.localStorage.removeItem(KEY)
}

// Where each role lands after login.
export const HOME_FOR: Record<Role, string> = {
  patient: '/patient',
  donor: '/donor',
  coordinator: '/coordinator',
}

export const ROLE_LABEL: Record<Role, string> = {
  patient: 'Patient',
  donor: 'Donor',
  coordinator: 'Coordinator',
}
