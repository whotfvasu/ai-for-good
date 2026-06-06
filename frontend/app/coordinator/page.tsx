'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { donorLabel, patientLabel } from '@/lib/labels'
import type { ForecastItem, RankedDonor } from '@/lib/types'
import clsx from 'clsx'

export default function CoordinatorPage() {
  const [forecast, setForecast] = useState<ForecastItem[]>([])
  const [activePatient, setActivePatient] = useState<string | null>(null)
  const [donors, setDonors] = useState<RankedDonor[]>([])
  const [notifyingDonorId, setNotifyingDonorId] = useState<string | null>(null)
  const [latestOutreach, setLatestOutreach] = useState<string | null>(null)
  const [loadingForecast, setLoadingForecast] = useState(true)
  const [loadingDonors, setLoadingDonors] = useState(false)
  const [errors, setErrors] = useState<string | null>(null)

  // The hero metric is computed from the live forecast: how many high-confidence
  // patients in the window we *could* reassure proactively. Once /family/ack
  // backs onto Cycles, this swaps to the persisted count.
  const reassuredThisWeek = useMemo(
    () => forecast.filter(f => f.confidence === 'high').length,
    [forecast]
  )

  useEffect(() => {
    api
      .forecast({ window: 7, sort: 'date' })
      .then(res => {
        setForecast(res.items)
        if (res.items[0]) setActivePatient(res.items[0].patient_id)
      })
      .catch(e => setErrors(`Forecast failed: ${e.message}. Showing empty state.`))
      .finally(() => setLoadingForecast(false))
  }, [])

  useEffect(() => {
    if (!activePatient) return
    setLoadingDonors(true)
    api
      .rankDonors(activePatient, 5)
      .then(res => setDonors(res.items))
      .catch(e => setErrors(`Donor ranking failed: ${e.message}.`))
      .finally(() => setLoadingDonors(false))
  }, [activePatient])

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
      {errors && (
        <div className="mb-6 p-4 rounded-2xl bg-marrow-100 text-marrow-900 text-sm ring-1 ring-marrow-300">
          {errors}
        </div>
      )}

      {/* Hero strip */}
      <div className="grid lg:grid-cols-3 gap-5">
        <HeroMetric
          big={String(reassuredThisWeek)}
          label="Families to reassure"
          sub="High-confidence forecasts in the next 7 days"
          variant="primary"
        />
        <HeroMetric big={String(forecast.length)} label="Patients due in 7 days" sub="From the predictive forecast" />
        <HeroMetric big="8h 14m" label="Phone time saved" sub="Saathi handles outreach drafts" />
      </div>

      {/* Two-pane */}
      <div className="mt-8 grid lg:grid-cols-5 gap-5">
        {/* Upcoming demand */}
        <section className="lg:col-span-2 bg-white rounded-4xl ring-1 ring-marrow-200/60 overflow-hidden">
          <header className="px-6 pt-6 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tightest text-marrow-900">Upcoming demand</h2>
              <p className="text-xs text-marrow-900/60 mt-0.5">Sorted by next-needed date</p>
            </div>
            <span className="pill bg-marrow-100 text-marrow-700">Next 7d</span>
          </header>
          <ul className="divide-y divide-marrow-100 max-h-[520px] overflow-y-auto">
            {loadingForecast && <Skeleton lines={3} />}
            {!loadingForecast && forecast.length === 0 && <Empty label="No patients due in this window." />}
            {forecast.map(item => {
              const label = patientLabel(item.patient_id)
              return (
                <li key={item.patient_id}>
                  <button
                    onClick={() => setActivePatient(item.patient_id)}
                    className={clsx(
                      'w-full text-left px-6 py-4 flex items-center justify-between gap-4 transition-colors',
                      activePatient === item.patient_id ? 'bg-marrow-50' : 'hover:bg-marrow-50/60'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-marrow-900">{label.display}</div>
                      <div className="text-xs text-marrow-900/60 mt-0.5">
                        {item.blood_group} · in {item.days_to_needed}d · {item.next_needed_date}
                      </div>
                    </div>
                    <ConfidencePill confidence={item.confidence} worry={item.worry_score} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Ranked donors */}
        <section className="lg:col-span-3 bg-white rounded-4xl ring-1 ring-marrow-200/60 overflow-hidden">
          <header className="px-6 pt-6 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tightest text-marrow-900">
                Ranked donors{' '}
                {activePatient && (
                  <span className="text-marrow-600">· {patientLabel(activePatient).display}</span>
                )}
              </h2>
              <p className="text-xs text-marrow-900/60 mt-0.5">Score factors in plain English</p>
            </div>
            <span className="pill bg-marrow-100 text-marrow-700">Top 5</span>
          </header>
          <ul className="divide-y divide-marrow-100">
            {loadingDonors && <Skeleton lines={3} />}
            {!loadingDonors && donors.length === 0 && <Empty label="No compatible donors found." />}
            {!loadingDonors && donors.map(d => (
              <DonorRow
                key={d.donor_id}
                donor={d}
                notifying={notifyingDonorId === d.donor_id}
                onApprove={async () => {
                  if (!activePatient) return
                  setNotifyingDonorId(d.donor_id)
                  try {
                    const result = await api.notifyDonor({
                      donor_id: d.donor_id,
                      patient_id: activePatient,
                      trigger: 'approval',
                    })
                    setLatestOutreach(result.message)
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown outreach error'
                    setErrors(`Outreach failed: ${message}.`)
                  } finally {
                    setNotifyingDonorId(null)
                  }
                }}
              />
            ))}
          </ul>
          {latestOutreach && (
            <div className="px-6 py-4 border-t border-marrow-100 bg-marrow-50/60">
              <div className="text-xs uppercase tracking-[0.12em] text-marrow-700/70">Latest outreach draft</div>
              <p className="mt-2 text-sm leading-relaxed text-marrow-900">{latestOutreach}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function HeroMetric({
  big,
  label,
  sub,
  variant,
}: {
  big: string
  label: string
  sub: string
  variant?: 'primary'
}) {
  return (
    <div
      className={clsx(
        'p-6 rounded-4xl',
        variant === 'primary'
          ? 'bg-marrow-900 text-marrow-50 shadow-glow'
          : 'bg-white ring-1 ring-marrow-200/60'
      )}
    >
      <div className={clsx('text-5xl font-extrabold tracking-tightest', variant && 'text-marrow-50')}>{big}</div>
      <div className={clsx('mt-2 font-semibold', variant ? 'text-marrow-100' : 'text-marrow-900')}>{label}</div>
      <div className={clsx('mt-1 text-xs', variant ? 'text-marrow-200/70' : 'text-marrow-900/60')}>{sub}</div>
    </div>
  )
}

function DonorRow({
  donor,
  notifying,
  onApprove,
}: {
  donor: RankedDonor
  notifying: boolean
  onApprove: () => Promise<void>
}) {
  const f = donor.factors
  return (
    <li className="px-6 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-semibold text-marrow-900">{donorLabel(donor.donor_id)}</div>
        <div className="text-xs text-marrow-900/60 mt-0.5">
          {f.eligible ? '✓ eligible' : '✕ not eligible'}
          {' · '}
          {Math.round(f.responsiveness * 100)}% responsive
          {' · '}
          {/* Dataset reality: every CSV row shares the same default lat/lng,
             so haversine returns 0. We treat exact-zero as unknown instead of
             pretending the donor lives in the patient's bed. */}
          {f.distance_km === null || f.distance_km === 0
            ? 'distance unknown'
            : `${f.distance_km.toFixed(1)} km`}
          {' · '}
          last {f.days_since_last ?? '–'}d ago
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ScoreRing score={donor.score} />
        <button
          onClick={onApprove}
          disabled={notifying}
          className="px-3.5 py-2 rounded-full bg-marrow-900 hover:bg-marrow-800 text-white text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {notifying ? 'Drafting...' : 'Approve outreach'}
        </button>
      </div>
    </li>
  )
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score))
  const circumference = 2 * Math.PI * 18
  return (
    <div className="relative w-12 h-12">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="#FCD2D2" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="#BB2B29"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[11px] font-bold text-marrow-900">
        {Math.round(pct * 100)}
      </div>
    </div>
  )
}

function ConfidencePill({ confidence, worry }: { confidence: string; worry: number }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={clsx(
          'pill',
          confidence === 'high' ? 'bg-marrow-100 text-marrow-700' : 'bg-marrow-50 text-marrow-700/70'
        )}
      >
        {confidence}
      </span>
      <span className="text-[10px] text-marrow-900/60">worry {worry.toFixed(2)}</span>
    </div>
  )
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <li className="px-6 py-4 space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-12 rounded-2xl bg-marrow-50 animate-pulse" />
      ))}
    </li>
  )
}

function Empty({ label }: { label: string }) {
  return <li className="px-6 py-10 text-center text-sm text-marrow-900/60">{label}</li>
}
