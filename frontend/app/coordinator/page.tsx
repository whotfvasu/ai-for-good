'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { donorLabel, patientLabel } from '@/lib/labels'
import { useRequireRole } from '@/lib/useRequireRole'
import type { BridgeDonor, Cycle, CyclesResponse, InsightsResponse } from '@/lib/types'
import clsx from 'clsx'

// A cycle's human-readable stage, derived from the ledger fields.
type Stage = 'assigned' | 'asked' | 'secured' | 'scheduled' | 'exception'
function stageOf(c: Cycle): Stage {
  if (c.state === 'needs_coordinator') return 'exception'
  if (c.state === 'resolved') return 'scheduled'
  if (c.donor_status === 'confirmed') return 'secured'
  if (c.donor_notified_at) return 'asked'
  return 'assigned'
}

export default function CoordinatorPage() {
  const { ready } = useRequireRole('coordinator')
  const [data, setData] = useState<CyclesResponse | null>(null)
  const [insights, setInsights] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [openCycle, setOpenCycle] = useState<Cycle | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [cycles, ins] = await Promise.all([api.cycles(), api.insights()])
      setData(cycles)
      setInsights(ins)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (ready) refresh()
  }, [ready, refresh])

  if (!ready) return <div className="app-page text-center text-marrow-900/40 py-20">Loading…</div>

  const items = data?.items ?? []
  const needsYou = items.filter(c => c.state === 'needs_coordinator')
  const active = items.filter(c => c.state === 'auto_running')
  const scheduled = items.filter(c => c.state === 'resolved')

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
    <div className="app-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Coordinator</h1>
          <p className="page-sub">The bridge runs itself. You only work the exceptions.</p>
        </div>
        <button onClick={runPass} disabled={running} className="btn-primary btn-md">
          {running ? 'Running…' : 'Run autonomous pass'}
          <span aria-hidden>↻</span>
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-marrow-100 text-marrow-900 text-sm ring-1 ring-marrow-300">{error}</div>
      )}

      {/* ── Network insights (real, from the dataset) ───────────────────── */}
      <InsightsPanel insights={insights} needsYou={needsYou.length} active={active.length} scheduled={scheduled.length} />

      {/* ── Needs you ───────────────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Needs you</h2>
          <span className="pill-soft">{needsYou.length} exceptions</span>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {loading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-32 rounded-3xl bg-marrow-50 animate-pulse" />)}
          {!loading && needsYou.length === 0 && (
            <div className="md:col-span-2 card p-10 text-center">
              <div className="text-3xl">🎉</div>
              <p className="mt-3 font-semibold text-marrow-900">Inbox zero.</p>
              <p className="text-sm text-marrow-900/60">Every upcoming cycle is covered automatically. Nothing needs you right now.</p>
            </div>
          )}
          {needsYou.map(c => (
            <ExceptionCard key={c.cycle_id} cycle={c} onOpen={() => setOpenCycle(c)} />
          ))}
        </div>
      </section>

      {/* ── Active cycles (the loop) ─────────────────────────────────────── */}
      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Active cycles</h2>
          <span className="pill-soft">{active.length} running</span>
        </div>
        <div className="space-y-3">
          {!loading && active.length === 0 && (
            <div className="card p-10 text-center text-sm text-marrow-900/60">
              No cycles running. Hit “Run autonomous pass” to sweep upcoming patients.
            </div>
          )}
          {active.map(c => (
            <CycleCard key={c.cycle_id} cycle={c} onChange={refresh} />
          ))}
        </div>
      </section>

      {/* ── Scheduled (resolved) ─────────────────────────────────────────── */}
      {scheduled.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Scheduled</h2>
            <span className="pill-soft">{scheduled.length} locked in</span>
          </div>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-marrow-100 max-h-[300px] overflow-y-auto">
              {scheduled.map(c => (
                <li key={c.cycle_id} className="px-6 py-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-marrow-900">
                    {patientLabel(c.patient_id).display}
                    <span className="text-marrow-900/50 font-normal"> · {c.next_needed_date}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-marrow-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    {c.assigned_donor_id ? donorLabel(c.assigned_donor_id) : 'donor'} confirmed
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {openCycle && <ExceptionDrawer cycle={openCycle} onClose={() => setOpenCycle(null)} onResolved={refresh} />}
    </div>
  )
}

/* ── Insights ──────────────────────────────────────────────────────────── */

function InsightsPanel({
  insights,
  needsYou,
  active,
  scheduled,
}: {
  insights: InsightsResponse | null
  needsYou: number
  active: number
  scheduled: number
}) {
  const total = needsYou + active + scheduled
  const autonomyPct = total > 0 ? Math.round(((active + scheduled) / total) * 100) : 0

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          dark
          big={String(insights?.demand.next_7 ?? '—')}
          label="Due in 7 days"
          sub={insights ? `${insights.demand.next_14} in 14d · ${insights.demand.next_30} in 30d` : ''}
        />
        <Kpi
          big={insights ? insights.donor_pool.eligible.toLocaleString() : '—'}
          label="Donors eligible now"
          sub={insights ? `${insights.donor_pool.resting.toLocaleString()} resting` : ''}
        />
        <Kpi
          big={String(insights?.bridges_at_risk ?? '—')}
          label="Bridges at risk"
          sub={insights ? `of ${insights.totals.bridges} · under 2 ready donors` : ''}
          warn={(insights?.bridges_at_risk ?? 0) > 0}
        />
        <Kpi
          big={`${autonomyPct}%`}
          label="Autonomy rate"
          sub={`${active} running · ${needsYou} need you`}
        />
      </div>

      {/* Blood-group pressure + re-engagement */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold tracking-tightest text-marrow-900">Blood-group pressure</h3>
            <span className="eyebrow">demand vs eligible supply · 30d</span>
          </div>
          <div className="mt-4 space-y-3">
            {(insights?.blood_groups ?? []).filter(g => g.due_30 > 0).slice(0, 5).map(g => (
              <GroupBar key={g.group} group={g.group} demand={g.due_30} supply={g.eligible_supply} status={g.status} />
            ))}
            {insights && insights.blood_groups.filter(g => g.due_30 > 0).length === 0 && (
              <p className="text-sm text-marrow-900/60">No demand in the next 30 days.</p>
            )}
          </div>
        </div>

        <div className="card-dark p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold tracking-tightest">Re-engagement</h3>
            <p className="mt-1 text-sm text-marrow-100/70">Lapsed donors worth a warm nudge.</p>
          </div>
          <div className="mt-4">
            <div className="text-5xl font-extrabold tracking-tightest">
              {insights ? insights.reengagement_opportunity.toLocaleString() : '—'}
            </div>
            <div className="mt-1 text-xs text-marrow-200/70">
              no donation in 180+ days · {insights ? `${Math.round(insights.avg_responsiveness * 100)}% avg responsiveness` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({ big, label, sub, dark, warn }: { big: string; label: string; sub?: string; dark?: boolean; warn?: boolean }) {
  return (
    <div className={clsx('p-5 rounded-3xl', dark ? 'card-dark' : 'card', warn && !dark && 'ring-marrow-300')}>
      <div className={clsx('text-4xl font-extrabold tracking-tightest', dark ? 'text-marrow-50' : warn ? 'text-marrow-700' : 'text-marrow-900')}>
        {big}
      </div>
      <div className={clsx('mt-2 text-sm font-semibold', dark ? 'text-marrow-100' : 'text-marrow-900')}>{label}</div>
      {sub && <div className={clsx('mt-0.5 text-xs', dark ? 'text-marrow-200/70' : 'text-marrow-900/55')}>{sub}</div>}
    </div>
  )
}

function GroupBar({ group, demand, supply, status }: { group: string; demand: number; supply: number; status: string }) {
  const meta: Record<string, { color: string; label: string }> = {
    shortage: { color: 'bg-marrow-600', label: 'shortage' },
    tight: { color: 'bg-amber-400', label: 'tight' },
    ok: { color: 'bg-green-500', label: 'healthy' },
    idle: { color: 'bg-marrow-200', label: 'idle' },
  }
  const m = meta[status] ?? meta.ok
  // Bar shows how much of demand is covered (capped, supply is usually >> demand).
  const coverage = demand > 0 ? Math.min(supply / demand, 4) / 4 : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-sm font-medium text-marrow-900">{group}</div>
      <div className="flex-1 h-2 rounded-full bg-marrow-100 overflow-hidden">
        <div className={clsx('h-full rounded-full', m.color)} style={{ width: `${Math.max(coverage * 100, 6)}%` }} />
      </div>
      <div className="w-32 shrink-0 text-right text-xs text-marrow-900/60">
        {demand} due · {supply.toLocaleString()} ready
      </div>
      <span className={clsx('pill', status === 'shortage' ? 'bg-marrow-600 text-white' : status === 'tight' ? 'bg-amber-100 text-amber-800' : 'bg-marrow-100 text-marrow-700')}>
        {m.label}
      </span>
    </div>
  )
}

/* ── Cycle cards ───────────────────────────────────────────────────────── */

const STEPS: { key: Stage; label: string }[] = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'asked', label: 'Donor asked' },
  { key: 'secured', label: 'Secured' },
  { key: 'scheduled', label: 'Scheduled' },
]

function Stepper({ stage }: { stage: Stage }) {
  const order = ['assigned', 'asked', 'secured', 'scheduled']
  const current = order.indexOf(stage)
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = i <= current
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors',
                done ? 'bg-marrow-900 text-marrow-50' : 'bg-marrow-50 text-marrow-900/40 ring-1 ring-marrow-100'
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className={clsx('w-3 h-px', done ? 'bg-marrow-300' : 'bg-marrow-100')} />}
          </div>
        )
      })}
    </div>
  )
}

function CycleCard({ cycle, onChange }: { cycle: Cycle; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const stage = stageOf(cycle)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      await onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold text-marrow-900">
            {patientLabel(cycle.patient_id).display}
            <span className="text-marrow-900/50 font-normal"> · {cycle.bridge_blood_group} · {cycle.next_needed_date}</span>
          </div>
          <div className="text-xs text-marrow-900/60 mt-0.5">
            {cycle.assigned_donor_id ? `Donor: ${donorLabel(cycle.assigned_donor_id)}` : 'No donor assigned'}
            {cycle.whatsapp_status && ` · WhatsApp ${cycle.whatsapp_status.sent ? cycle.whatsapp_status.status ?? 'sent' : 'not sent'}`}
          </div>
        </div>
        <Stepper stage={stage} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-marrow-900/60 flex-1 min-w-0">{cycle.note}</p>

        {/* ONE contextual action per stage */}
        <div className="flex items-center gap-2">
          {stage === 'assigned' && (
            <button onClick={() => run(() => api.notifyCycle(cycle.cycle_id))} disabled={busy} className="btn-primary btn-sm">
              {busy ? 'Sending…' : 'Send WhatsApp to donor'}
            </button>
          )}

          {stage === 'asked' && (
            <>
              <span className="text-xs text-marrow-900/50 mr-1">Awaiting donor reply…</span>
              <button onClick={() => run(() => api.confirm(cycle.cycle_id, 'donor', 'yes'))} disabled={busy} className="btn-secondary btn-sm">
                Simulate yes
              </button>
              <button onClick={() => run(() => api.confirm(cycle.cycle_id, 'donor', 'no'))} disabled={busy} className="btn-secondary btn-sm">
                Simulate no
              </button>
            </>
          )}

          {stage === 'secured' && (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-marrow-700 mr-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Donor confirmed · awaiting family
              </span>
              <button onClick={() => run(() => api.confirm(cycle.cycle_id, 'patient', 'yes'))} disabled={busy} className="btn-dark btn-sm">
                Mark family confirmed
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ExceptionCard({ cycle, onOpen }: { cycle: Cycle; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="card ring-marrow-300 text-left p-5 hover:shadow-soft hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold text-marrow-900">{patientLabel(cycle.patient_id).display}</div>
        <span className="pill-soft">{cycle.bridge_blood_group}</span>
      </div>
      <div className="mt-1 text-xs text-marrow-900/60">needs blood on {cycle.next_needed_date}</div>
      <p className="mt-3 text-sm text-marrow-900/70">{cycle.note}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-marrow-700">
        Resolve <span aria-hidden>→</span>
      </div>
    </button>
  )
}

/* ── Exception drawer ──────────────────────────────────────────────────── */

function ExceptionDrawer({ cycle, onClose, onResolved }: { cycle: Cycle; onClose: () => void; onResolved: () => void }) {
  const [donors, setDonors] = useState<BridgeDonor[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)

  useEffect(() => {
    api
      .bridge(cycle.patient_id)
      .then(b => setDonors(b.donors))
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
      <div className="w-full max-w-md h-full bg-paper shadow-glow overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-marrow-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold tracking-tightest text-marrow-900">{patientLabel(cycle.patient_id).display}</h3>
            <p className="text-xs text-marrow-900/60">needs {cycle.bridge_blood_group} on {cycle.next_needed_date}</p>
          </div>
          <button onClick={onClose} className="text-marrow-900/50 hover:text-marrow-900 text-xl">×</button>
        </div>
        <div className="p-6">
          <p className="text-sm text-marrow-900/70">{cycle.note}</p>
          <h4 className="mt-6 eyebrow">Their bridge — assign a donor (ranked by likelihood)</h4>
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
                  disabled={assigning !== null || !d.eligible}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-marrow-900 hover:bg-marrow-800 text-white disabled:opacity-40"
                >
                  {assigning === d.donor_id ? '…' : d.eligible ? 'Assign' : 'resting'}
                </button>
              </div>
            ))}
            {!loading && donors.length === 0 && (
              <p className="text-sm text-marrow-900/60">This bridge has no donors — widen to compatible donors nearby (roadmap).</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
