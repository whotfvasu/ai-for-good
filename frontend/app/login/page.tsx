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
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      {/* Left — brand panel (full height, occupies the space) */}
      <div className="relative hidden lg:flex flex-col justify-between p-14 bg-marrow-900 text-marrow-50 overflow-hidden">
        <div className="absolute -right-24 -top-24 w-[28rem] h-[28rem] rounded-full bg-marrow-700/40 blur-3xl" />
        <div className="absolute -left-16 bottom-0 w-72 h-72 rounded-full bg-marrow-600/20 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <Drop />
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tightest">Marrow</div>
            <div className="eyebrow text-marrow-200/70">Living Blood Network</div>
          </div>
        </div>

        <div className="relative">
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tightest leading-[1.05]">
            One secure login.<br />Three focused workspaces.
          </h1>
          <p className="mt-5 text-marrow-100/80 max-w-md leading-relaxed">
            Marrow derives your workspace from the signed-in account. Coordinators, patients, and
            donors each see only what they need — never an in-app switcher.
          </p>

          <ul className="mt-10 space-y-4 max-w-md">
            <Feature title="Coordinator" body="An autonomous command center — work only the exceptions." />
            <Feature title="Patient" body="See your Blood Bridge and your next tentative date." />
            <Feature title="Donor" body="Saathi remembers you, and your impact, every cycle." />
          </ul>
        </div>

        <div className="relative eyebrow text-marrow-200/50">Checkpoint demo access · password is cosmetic</div>
      </div>

      {/* Right — form, vertically centered in a real card */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <form onSubmit={submit} className="w-full max-w-md card p-8 shadow-soft">
          {/* compact brand for mobile where the left panel is hidden */}
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <Drop dark />
            <span className="font-bold tracking-tightest text-marrow-900">Marrow</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tightest text-marrow-900">Sign in</h2>
          <p className="mt-1 text-sm text-marrow-900/60">Use the assigned account. The workspace is derived automatically.</p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="field-label">Email</label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@bloodwarriors.org"
                className="input"
              />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </div>
            <div>
              <label className="field-label">Demo account</label>
              <select
                value={selectedKey}
                onChange={e => setSelectedKey(e.target.value)}
                className="input"
              >
                {loading && <option>Loading live identities…</option>}
                {accounts.map(account => (
                  <option key={account.key} value={account.key}>
                    {account.name} · {ROLE_LABEL[account.role]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" disabled={!email.trim()} className="btn-primary btn-lg w-full mt-6">
            Sign in
          </button>
          <p className="mt-3 text-center text-xs text-marrow-900/45">
            Demo shortcut. In production this is replaced by Cognito / SSO claims.
          </p>
        </form>
      </div>
    </div>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full bg-marrow-300" />
      <div>
        <div className="font-semibold text-marrow-50">{title}</div>
        <div className="text-sm text-marrow-100/70 leading-snug">{body}</div>
      </div>
    </li>
  )
}

function Drop({ dark }: { dark?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none" aria-hidden>
      <defs>
        <radialGradient id="ld" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ECA0A0" />
          <stop offset="100%" stopColor={dark ? '#BB2B29' : '#FFE8E8'} />
        </radialGradient>
      </defs>
      <path d="M16 3C10 12 6 17 6 22a10 10 0 0 0 20 0c0-5-4-10-10-19Z" fill="url(#ld)" />
    </svg>
  )
}
