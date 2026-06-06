'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { donorLabel, patientLabel } from '@/lib/labels'
import { HOME_FOR, ROLE_LABEL, setSession, type Role } from '@/lib/auth'

interface Account {
  key: string
  role: Role
  id: string
  name: string
  email: string
}

const COORDINATOR: Account = {
  key: 'coordinator:admin',
  role: 'coordinator',
  id: 'admin',
  name: 'Blood Warriors Admin',
  email: 'coordinator@bloodwarriors.org',
}

function accountKey(role: Role, id: string) {
  return `${role}:${id}`
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([COORDINATOR])
  const [selectedKey, setSelectedKey] = useState(COORDINATOR.key)
  const [loading, setLoading] = useState(true)

  // Pull real DB identities so the role is derived from the signed-in account,
  // not selected through visible app-wide role switches.
  useEffect(() => {
    let cancelled = false
    api
      .forecast({ window: 60, sort: 'date' })
      .then(async forecast => {
        const patients: Account[] = forecast.items.slice(0, 12).map(p => ({
          key: accountKey('patient', p.patient_id),
          role: 'patient',
          id: p.patient_id,
          name: `${patientLabel(p.patient_id).display} · ${p.blood_group}`,
          email: `${p.patient_id.slice(0, 10).toLowerCase()}@patients.marrow.demo`,
        }))
        // Donors: take the bridge / ranked donors of the first patient.
        let donors: Account[] = []
        if (forecast.items[0]) {
          const ranked = await api.rankDonors(forecast.items[0].patient_id, 8)
          donors = ranked.items.map(d => ({
            key: accountKey('donor', d.donor_id),
            role: 'donor',
            id: d.donor_id,
            name: `${donorLabel(d.donor_id)} · ${d.blood_group}`,
            email: `${d.donor_id.slice(0, 10).toLowerCase()}@donors.marrow.demo`,
          }))
        }
        if (cancelled) return
        setAccounts([COORDINATOR, ...patients, ...donors])
      })
      .catch(() => {
        /* leave coordinator-only; demo still works */
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // Selecting a demo account fills the email field. In production, the typed
  // email/JWT would be the thing that determines this account + role.
  useEffect(() => {
    const account = accounts.find(a => a.key === selectedKey)
    if (account) setEmail(account.email)
  }, [selectedKey, accounts])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    const chosen =
      accounts.find(a => a.email.toLowerCase() === normalizedEmail) ??
      accounts.find(a => a.key === selectedKey) ??
      COORDINATOR
    if (!chosen) return
    setSession({ role: chosen.role, id: chosen.id, name: chosen.name })
    router.replace(HOME_FOR[chosen.role])
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      {/* Left — brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-marrow-900 text-marrow-50 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-96 h-96 rounded-full bg-marrow-700/40 blur-3xl" />
        <div className="relative">
          <div className="text-sm uppercase tracking-[0.2em] text-marrow-200/70">Marrow</div>
          <div className="mt-1 font-bold text-lg">Living Blood Network</div>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-extrabold tracking-tightest leading-tight">
            One secure login.<br />Three focused workspaces.
          </h1>
          <p className="mt-4 text-marrow-100/80 max-w-sm leading-relaxed">
            Marrow derives the workspace from the signed-in account. Coordinators, patients, and
            donors never see an in-app switcher that breaks the CRM model.
          </p>
        </div>
        <div className="relative text-xs text-marrow-200/60">Checkpoint demo access · password is cosmetic</div>
      </div>

      {/* Right — form */}
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tightest text-marrow-900">Sign in</h2>
          <p className="mt-1 text-sm text-marrow-900/60">Use the assigned account. The workspace is derived automatically.</p>

          <label className="block mt-6 text-xs font-medium text-marrow-900/70">Email</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="name@bloodwarriors.org"
            className="mt-1 w-full px-4 py-2.5 rounded-xl bg-marrow-50 ring-1 ring-marrow-200/60 placeholder:text-marrow-700/30 focus:outline-none focus:ring-2 focus:ring-marrow-400"
          />
          <label className="block mt-4 text-xs font-medium text-marrow-900/70">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1 w-full px-4 py-2.5 rounded-xl bg-marrow-50 ring-1 ring-marrow-200/60 placeholder:text-marrow-700/30 focus:outline-none focus:ring-2 focus:ring-marrow-400"
          />

          <label className="block mt-4 text-xs font-medium text-marrow-900/70">Demo account</label>
          <select
            value={selectedKey}
            onChange={e => setSelectedKey(e.target.value)}
            className="mt-1 w-full px-4 py-2.5 rounded-xl bg-marrow-50 ring-1 ring-marrow-200/60 focus:outline-none focus:ring-2 focus:ring-marrow-400"
          >
            {loading && <option>Loading live identities…</option>}
            {accounts.map(account => (
              <option key={account.key} value={account.key}>
                {account.name} · {ROLE_LABEL[account.role]}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-marrow-900/45">
            Demo shortcut only. In production this selector is replaced by Cognito/SSO claims.
          </p>

          <button
            type="submit"
            disabled={!email.trim()}
            className="mt-6 w-full py-3 rounded-full bg-marrow-600 hover:bg-marrow-700 text-white font-semibold transition-colors disabled:opacity-50"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
