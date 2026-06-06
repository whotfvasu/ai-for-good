'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { donorLabel, patientLabel } from '@/lib/labels'
import { HOME_FOR, ROLE_LABEL, setSession, type Role } from '@/lib/auth'
import clsx from 'clsx'

interface Identity {
  id: string
  name: string
}

const ROLES: Role[] = ['coordinator', 'patient', 'donor']

export default function LoginPage() {
  const router = useRouter()
  const [role, setRole] = useState<Role>('coordinator')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [identities, setIdentities] = useState<Record<Role, Identity[]>>({
    coordinator: [{ id: 'admin', name: 'Blood Warriors Admin' }],
    patient: [],
    donor: [],
  })
  const [selectedId, setSelectedId] = useState<string>('admin')
  const [loading, setLoading] = useState(true)

  // Pull real DB identities so "logging in" maps to actual rows.
  useEffect(() => {
    let cancelled = false
    api
      .forecast({ window: 60, sort: 'date' })
      .then(async forecast => {
        const patients: Identity[] = forecast.items.slice(0, 12).map(p => ({
          id: p.patient_id,
          name: `${patientLabel(p.patient_id).display} · ${p.blood_group}`,
        }))
        // Donors: take the bridge / ranked donors of the first patient.
        let donors: Identity[] = []
        if (forecast.items[0]) {
          const ranked = await api.rankDonors(forecast.items[0].patient_id, 8)
          donors = ranked.items.map(d => ({
            id: d.donor_id,
            name: `${donorLabel(d.donor_id)} · ${d.blood_group}`,
          }))
        }
        if (cancelled) return
        setIdentities(prev => ({ ...prev, patient: patients, donor: donors }))
      })
      .catch(() => {
        /* leave coordinator-only; demo still works */
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // Keep the selected identity valid as role changes.
  useEffect(() => {
    const list = identities[role]
    setSelectedId(list[0]?.id ?? '')
  }, [role, identities])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const list = identities[role]
    const chosen = list.find(i => i.id === selectedId) ?? list[0]
    if (!chosen) return
    setSession({ role, id: chosen.id, name: chosen.name })
    router.replace(HOME_FOR[role])
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
            One network.<br />Three people who matter.
          </h1>
          <p className="mt-4 text-marrow-100/80 max-w-sm leading-relaxed">
            Sign in as a coordinator, a patient, or a donor — Marrow shows each person exactly the
            slice of the bridge they need, and quietly runs the rest.
          </p>
        </div>
        <div className="relative text-xs text-marrow-200/60">Demo access · no password needed</div>
      </div>

      {/* Right — form */}
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tightest text-marrow-900">Sign in</h2>
          <p className="mt-1 text-sm text-marrow-900/60">Choose how you're joining today.</p>

          {/* Role tabs */}
          <div className="mt-6 grid grid-cols-3 gap-1 p-1 rounded-2xl bg-marrow-100/70 ring-1 ring-marrow-200/60">
            {ROLES.map(r => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                className={clsx(
                  'py-2 rounded-xl text-sm font-medium transition-all',
                  role === r ? 'bg-marrow-900 text-marrow-50 shadow-soft' : 'text-marrow-800 hover:bg-white/60'
                )}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>

          {/* Cosmetic email/password */}
          <label className="block mt-5 text-xs font-medium text-marrow-900/70">Email</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={`${role}@bloodwarriors.org`}
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

          {/* Identity picker (the real bit) */}
          {role !== 'coordinator' && (
            <>
              <label className="block mt-4 text-xs font-medium text-marrow-900/70">
                {role === 'patient' ? 'Which patient are you?' : 'Which donor are you?'}
              </label>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-marrow-50 ring-1 ring-marrow-200/60 focus:outline-none focus:ring-2 focus:ring-marrow-400"
              >
                {loading && <option>Loading identities…</option>}
                {!loading && identities[role].length === 0 && <option value="">No identities found</option>}
                {identities[role].map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <button
            type="submit"
            disabled={role !== 'coordinator' && !selectedId}
            className="mt-6 w-full py-3 rounded-full bg-marrow-600 hover:bg-marrow-700 text-white font-semibold transition-colors disabled:opacity-50"
          >
            Enter as {ROLE_LABEL[role]}
          </button>
        </form>
      </div>
    </div>
  )
}
