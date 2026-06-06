'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { donorLabel, patientLabel } from '@/lib/labels'
import { useRequireRole } from '@/lib/useRequireRole'
import type { BridgeDonor, Cycle, CyclesResponse } from '@/lib/types'
import clsx from 'clsx'

export default function CoordinatorPage() {
  const { ready } = useRequireRole('coordinator')
  const [data, setData] = useState<CyclesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [openCycle, setOpenCycle] = useState<Cycle | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await api.cycles()
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cycles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (ready) refresh()
  }, [ready, refresh])

  if (!ready) return <div className="max-w-7xl mx-auto px-6 py-20 text-center text-marrow-900/40">Loading…</div>

  const counts = data?.counts ?? {}
  const autoRunning = (data?.items ?? []).filter(c => c.state === 'auto_running')
  const needsYou = (data?.items ?? []).filter(c => c.state === 'needs_coordinator')
  const resolved = counts.resolved ?? 0
  const total = (counts.auto_running ?? 0) + (counts.needs_coordinator ?? 0) + resolved
  const autonomyPct = total > 0 ? Math.round(((counts.auto_running ?? 0) + resolved) / total * 100) : 0

  const runPass = async () => {
    setRunning(true)
    try {
      await api.runCycles(14)
      await refresh()
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tightest text-marrow-900">Coordinator</h1>
          <p className="mt-1 text-marrow-900/60">
            The bridge runs itself. You only work the exceptions.
          </p>
        </div>
        <button
          onClick={runPass}
          disabled={running}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-marrow-900 hover:bg-marrow-800 text-marrow-50 text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {running ? 'Running…' : 'Run autonomous pass'}
          <span aria-hidden>↻</span>
        </button>
      </div>

      {error && (
        <div className="mt-5 p-4 rounded-2xl bg-marrow-100 text-marrow-900 text-sm ring-1 ring-marrow-300">{error}</div>
      )}

      {/* Hero strip */}
      <div className="mt-6 grid lg:grid-cols-3 gap-5">
        <div className="p-6 rounded-4xl bg-marrow-900 text-marrow-50 shadow-glow">
          <div className="text-5xl font-extrabold tracking-tightest">{counts.auto_running ?? 0}</div>
          <div className="mt-2 font-semibold text-marrow-100">Running autonomously</div>
          <div className="mt-1 text-xs text-marrow-200/70">Donor assigned, awaiting confirmation — no human needed</div>
        </div>
        <div className={clsx('p-6 rounded-4xl ring-1', (counts.needs_coordinator ?? 0) > 0 ? 'bg-white ring-marrow-300' : 'bg-white ring-marrow-200/60')}>
          <div className="text-5xl font-extrabold tracking-tightest text-marrow-700">{counts.needs_coordinator ?? 0}</div>
          <div className="mt-2 font-semibold text-marrow-900">Need you</div>
          <div className="mt-1 text-xs text-marrow-900/60">Gaps the system couldn't auto-resolve</div>
        </div>
        <div className="p-6 rounded-4xl bg-white ring-1 ring-marrow-200/60">
          <div className="text-5xl font-extrabold tracking-tightest text-marrow-900">{autonomyPct}%</div>
          <div className="mt-2 font-semibold text-marrow-900">Autonomy rate</div>
          <div className="mt-1 text-xs text-marrow-900/60">{resolved} resolved · {total} cycles this window</div>
        </div>
      </div>

      {/* Exception queue */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tightest text-marrow-900">Needs you</h2>
          <span className="pill bg-marrow-100 text-marrow-700">{needsYou.length} exceptions</span>
        </div>
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {loading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-32 rounded-3xl bg-marrow-50 animate-pulse" />)}
          {!loading && needsYou.length === 0 && (
            <div className="md:col-span-2 p-8 rounded-3xl bg-marrow-50/60 ring-1 ring-marrow-100 text-center">
              <div className="text-2xl">🎉</div>
              <p className="mt-2 font-semibold text-marrow-900">Inbox zero.</p>
              <p className="text-sm text-marrow-900/60">Every upcoming cycle is covered automatically. Nothing needs you right now.</p>
            </div>
          )}
          {needsYou.map(c => (
            <ExceptionCard key={c.cycle_id} cycle={c} onOpen={() => setOpenCycle(c)} />
          ))}
        </div>
      </section>

      {/* Autonomous list */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tightest text-marrow-900">Running autonomously</h2>
          <span className="pill bg-marrow-100 text-marrow-700">{autoRunning.length} cycles</span>
        </div>
        <div className="mt-4 bg-white rounded-4xl ring-1 ring-marrow-200/60 overflow-hidden">
          <ul className="divide-y divide-marrow-100 max-h-[420px] overflow-y-auto">
            {autoRunning.map(c => (
              <AutoRow key={c.cycle_id} cycle={c} onChange={refresh} />
            ))}
            {!loading && autoRunning.length === 0 && (
              <li className="px-6 py-10 text-center text-sm text-marrow-900/60">
                No cycles running yet. Hit “Run autonomous pass”.
              </li>
            )}
          </ul>
        </div>
      </section>

      {openCycle && <ExceptionDrawer cycle={openCycle} onClose={() => setOpenCycle(null)} onResolved={refresh} />}
    </div>
  )
}

function ExceptionCard({ cycle, onOpen }: { cycle: Cycle; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="text-left p-5 rounded-3xl bg-white ring-1 ring-marrow-300 hover:shadow-soft hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold text-marrow-900">{patientLabel(cycle.patient_id).display}</div>
        <span className="pill bg-marrow-100 text-marrow-700">{cycle.bridge_blood_group}</span>
      </div>
      <div className="mt-1 text-xs text-marrow-900/60">needs blood on {cycle.next_needed_date}</div>
      <p className="mt-3 text-sm text-marrow-900/70">{cycle.note}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-marrow-700">
        Resolve <span aria-hidden>→</span>
      </div>
    </button>
  )
}

function AutoRow({ cycle, onChange }: { cycle: Cycle; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const act = async (party: 'donor' | 'patient', decision: 'yes' | 'no') => {
    setBusy(true)
    try {
      await api.confirm(cycle.cycle_id, party, decision)
      await onChange()
    } finally {
      setBusy(false)
    }
  }
  const sendWhatsApp = async () => {
    setSending(true)
    try {
      await api.notifyCycle(cycle.cycle_id)
      await onChange()
    } finally {
      setSending(false)
    }
  }
  const canSend = Boolean(cycle.assigned_donor_id && cycle.donor_status === 'pending')
  return (
    <li className="px-6 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-semibold text-marrow-900">
          {patientLabel(cycle.patient_id).display}
          <span className="text-marrow-900/50 font-normal"> · {cycle.next_needed_date}</span>
        </div>
        <div className="text-xs text-marrow-900/60 mt-0.5">
          {cycle.assigned_donor_id ? `→ ${donorLabel(cycle.assigned_donor_id)}` : 'unassigned'} ·
          donor {cycle.donor_status} · patient {cycle.patient_status}
          {cycle.whatsapp_status && ` · WhatsApp ${cycle.whatsapp_status.sent ? cycle.whatsapp_status.status ?? 'sent' : cycle.whatsapp_status.reason ?? 'skipped'}`}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusDot status={cycle.donor_status} />
        <button
          onClick={sendWhatsApp}
          disabled={!canSend || sending || Boolean(cycle.donor_notified_at)}
          className="px-2.5 py-1 rounded-full text-xs font-medium bg-marrow-900 text-marrow-50 hover:bg-marrow-800 disabled:opacity-40"
        >
          {cycle.donor_notified_at ? 'sent' : sending ? 'sending...' : 'send WhatsApp'}
        </button>
        {/* Demo controls to simulate confirmations landing */}
        <button
          onClick={() => act('donor', 'yes')}
          disabled={busy || cycle.donor_status === 'confirmed'}
          className="px-2.5 py-1 rounded-full text-xs font-medium bg-marrow-50 ring-1 ring-marrow-200/60 hover:bg-marrow-100 text-marrow-800 disabled:opacity-40"
        >
          donor ✓
        </button>
        <button
          onClick={() => act('patient', 'yes')}
          disabled={busy || cycle.patient_status === 'confirmed'}
          className="px-2.5 py-1 rounded-full text-xs font-medium bg-marrow-50 ring-1 ring-marrow-200/60 hover:bg-marrow-100 text-marrow-800 disabled:opacity-40"
        >
          patient ✓
        </button>
      </div>
    </li>
  )
}

function StatusDot({ status }: { status: string }) {
  const c = status === 'confirmed' ? 'bg-green-500' : status === 'declined' ? 'bg-red-500' : 'bg-amber-400'
  return <span className={clsx('w-2 h-2 rounded-full', c)} />
}

// Drill-in: pull the patient's bridge, let the coordinator assign a donor.
function ExceptionDrawer({ cycle, onClose, onResolved }: { cycle: Cycle; onClose: () => void; onResolved: () => void }) {
  const [donors, setDonors] = useState<BridgeDonor[]>([])
  const [importance, setImportance] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)

  useEffect(() => {
    api
      .bridge(cycle.patient_id)
      .then(b => {
        setDonors(b.donors)
        setImportance(b.ml_importance ?? {})
      })
      .finally(() => setLoading(false))
  }, [cycle.patient_id])

  const assign = async (donorId: string) => {
    setAssigning(donorId)
    try {
      await api.assignCycle(cycle.cycle_id, donorId)
      await onResolved()
      onClose()
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-paper shadow-glow overflow-y-auto animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-marrow-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold tracking-tightest text-marrow-900">{patientLabel(cycle.patient_id).display}</h3>
            <p className="text-xs text-marrow-900/60">needs {cycle.bridge_blood_group} on {cycle.next_needed_date}</p>
          </div>
          <button onClick={onClose} className="text-marrow-900/50 hover:text-marrow-900 text-xl">×</button>
        </div>
        <div className="p-6">
          <p className="text-sm text-marrow-900/70">{cycle.note}</p>
          <h4 className="mt-6 text-xs uppercase tracking-[0.15em] text-marrow-700/70">Their bridge — assign a donor</h4>
          <div className="mt-3 space-y-2">
            {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-marrow-50 animate-pulse" />)}
            {!loading && donors.map(d => (
              <div key={d.donor_id} className="p-3 rounded-2xl bg-white ring-1 ring-marrow-200/60 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-marrow-900">{donorLabel(d.donor_id)}</div>
                  <div className="text-xs text-marrow-900/60">
                    {d.rotation_state.replace('_', ' ')} · last {d.days_since_last ?? '–'}d ago
                    {d.ml_propensity != null && ` · ${Math.round(d.ml_propensity * 100)}% likely`}
                  </div>
                </div>
                <button
                  onClick={() => assign(d.donor_id)}
                  disabled={assigning !== null}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-marrow-900 hover:bg-marrow-800 text-white disabled:opacity-50"
                >
                  {assigning === d.donor_id ? '…' : 'Assign'}
                </button>
              </div>
            ))}
            {!loading && donors.length === 0 && (
              <p className="text-sm text-marrow-900/60">This bridge has no donors — widen to compatible donors nearby (roadmap).</p>
            )}
          </div>

          {Object.keys(importance).length > 0 && (
            <div className="mt-6 p-4 rounded-2xl bg-marrow-50/60 ring-1 ring-marrow-100">
              <div className="text-[10px] uppercase tracking-[0.15em] text-marrow-700/70">
                What the model weighs (XGBoost)
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.keys(importance).map(k => (
                  <span key={k} className="pill bg-marrow-100 text-marrow-700">{k.replace(/_/g, ' ')}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
