'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { donorLabel, patientLabel } from '@/lib/labels'
import { useRequireRole } from '@/lib/useRequireRole'
import type { BridgeResponse, BridgeDonor } from '@/lib/types'
import clsx from 'clsx'

export default function PatientPage() {
  const { session, ready } = useRequireRole('patient')
  const [bridge, setBridge] = useState<BridgeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready || !session) return
    api
      .bridge(session.id)
      .then(setBridge)
      .catch(e => setError(`Could not load your bridge: ${e.message}`))
      .finally(() => setLoading(false))
  }, [ready, session])

  if (!ready) return <Loading />

  const nextDate = bridge?.next_needed_date ? formatDate(bridge.next_needed_date) : '—'
  const name = session ? patientLabel(session.id).display : 'Patient'

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-10 py-10">
      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-marrow-100 text-marrow-900 text-sm ring-1 ring-marrow-300">{error}</div>
      )}

      {/* Tentative date alert */}
      <div className="rounded-5xl bg-fade-pink ring-1 ring-marrow-200/60 p-8 lg:p-12 shadow-soft">
        <span className="pill bg-white text-marrow-700 ring-1 ring-marrow-200/60">
          <span className="w-1.5 h-1.5 rounded-full bg-marrow-600 animate-pulse" />
          Tentative transfusion alert
        </span>
        <h1 className="mt-6 text-3xl md:text-4xl font-extrabold tracking-tightest text-marrow-900 leading-tight">
          Your next transfusion looks like <span className="text-marrow-600">{nextDate}</span>.
        </h1>
        <p className="mt-4 text-marrow-900/70 leading-relaxed max-w-2xl">
          {loading
            ? 'Loading your bridge…'
            : bridge && bridge.ready_count > 0
              ? `${bridge.ready_count} of your ${bridge.pool_size} bridge donors are ready to give. Saathi is already lining up the next one — you don't need to chase anyone.`
              : `Your bridge of ${bridge?.pool_size ?? 0} donors is resting and recovering eligibility. Saathi is tracking who becomes ready first.`}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            disabled={confirmed}
            onClick={async () => {
              try {
                await api.familyAck(
                  bridge ? `cyc_${bridge.patient_id}_${bridge.next_needed_date}` : 'cyc_demo'
                )
              } finally {
                setConfirmed(true)
              }
            }}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-marrow-900 hover:bg-marrow-800 text-marrow-50 font-semibold disabled:opacity-60 transition-colors"
          >
            {confirmed ? '✓ Date confirmed' : 'Confirm this date works'}
          </button>
          <a className="text-sm text-marrow-700 underline-offset-4 hover:underline" href="tel:+910000000000">
            Talk to my coordinator
          </a>
        </div>

        {confirmed && (
          <p className="mt-6 text-sm text-marrow-800 animate-fade-in">
            Thank you — your coordinator and bridge donors have been notified that {nextDate} works for you.
          </p>
        )}
      </div>

      {/* The bridge */}
      <section className="mt-8">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tightest text-marrow-900">Your Blood Bridge</h2>
            <p className="mt-1 text-sm text-marrow-900/60">
              {bridge
                ? `${bridge.pool_size} donors share your blood group (${bridge.bridge_blood_group}) and rotate to sustain you`
                : 'Loading…'}
            </p>
          </div>
          {bridge && (
            <div className="text-right">
              <div className="text-3xl font-extrabold text-marrow-900 tracking-tightest">{bridge.ready_count}</div>
              <div className="text-xs text-marrow-900/60">ready now</div>
            </div>
          )}
        </div>

        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-3xl bg-marrow-50 animate-pulse" />
            ))}
          {!loading && bridge?.donors.map(d => <BridgeDonorCard key={d.donor_id} donor={d} />)}
          {!loading && bridge && bridge.donors.length === 0 && (
            <div className="col-span-full text-center text-sm text-marrow-900/60 py-10">
              No bridge is set up for you yet — your coordinator will assemble one.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function BridgeDonorCard({ donor }: { donor: BridgeDonor }) {
  const stateMeta: Record<string, { label: string; color: string; dot: string }> = {
    ready: { label: 'Ready to give', color: 'text-marrow-700 bg-marrow-100', dot: 'bg-green-500' },
    recently_donated: { label: 'Recently donated', color: 'text-marrow-700/70 bg-marrow-50', dot: 'bg-amber-400' },
    resting: { label: 'Resting', color: 'text-marrow-900/40 bg-marrow-50', dot: 'bg-marrow-200' },
  }
  const m = stateMeta[donor.rotation_state]
  return (
    <div className="p-5 rounded-3xl bg-white ring-1 ring-marrow-200/60">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-marrow-900 text-marrow-50 grid place-items-center font-semibold">
          {donorLabel(donor.donor_id).slice(6, 7).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-marrow-900 truncate">{donorLabel(donor.donor_id)}</div>
          <div className="text-xs text-marrow-900/60">{donor.blood_group}</div>
        </div>
      </div>
      <div className={clsx('mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', m.color)}>
        <span className={clsx('w-1.5 h-1.5 rounded-full', m.dot)} />
        {m.label}
      </div>
      <div className="mt-3 text-xs text-marrow-900/50">
        {donor.days_since_last !== null ? `last gave ${donor.days_since_last}d ago` : 'no prior donation logged'}
      </div>
    </div>
  )
}

function Loading() {
  return <div className="max-w-5xl mx-auto px-6 py-20 text-center text-marrow-900/40">Loading…</div>
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}
