'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { demoPatients } from '@/lib/mocks'
import type { ForecastItem, RankedDonor } from '@/lib/types'
import clsx from 'clsx'

export default function CoordinatorPage() {
  const [forecast, setForecast] = useState<ForecastItem[]>([])
  const [activePatient, setActivePatient] = useState<string | null>(null)
  const [donors, setDonors] = useState<RankedDonor[]>([])
  const [loadingForecast, setLoadingForecast] = useState(true)
  const [loadingDonors, setLoadingDonors] = useState(false)
  const reassuredThisWeek = 31 // hero metric; will pull from cycles when live

  useEffect(() => {
    api
      .forecast({ window: 7, sort: 'date' })
      .then(res => {
        setForecast(res.items)
        if (res.items[0]) setActivePatient(res.items[0].patient_id)
      })
      .finally(() => setLoadingForecast(false))
  }, [])

  useEffect(() => {
    if (!activePatient) return
    setLoadingDonors(true)
    api
      .rankDonors(activePatient, 5)
      .then(res => setDonors(res.items))
      .finally(() => setLoadingDonors(false))
  }, [activePatient])

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
      {/* Hero strip */}
      <div className="grid lg:grid-cols-3 gap-5">
        <HeroMetric
          big={String(reassuredThisWeek)}
          label="Families reassured this week"
          sub="Reached before they had to ask"
          variant="primary"
        />
        <HeroMetric big={String(forecast.length)} label="Patients due in 7 days" sub="From the predictive forecast" />
        <HeroMetric big="8h 14m" label="Phone time saved" sub="Saathi handled outreach drafts" />
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
          <ul className="divide-y divide-marrow-100">
            {loadingForecast && <Skeleton lines={3} />}
            {!loadingForecast && forecast.length === 0 && <Empty label="No patients due this window." />}
            {forecast.map(item => (
              <li key={item.patient_id}>
                <button
                  onClick={() => setActivePatient(item.patient_id)}
                  className={clsx(
                    'w-full text-left px-6 py-4 flex items-center justify-between gap-4 transition-colors',
                    activePatient === item.patient_id ? 'bg-marrow-50' : 'hover:bg-marrow-50/60'
                  )}
                >
                  <div>
                    <div className="font-semibold text-marrow-900">{patientLabel(item.patient_id)}</div>
                    <div className="text-xs text-marrow-900/60 mt-0.5">
                      {item.blood_group} · in {item.days_to_needed} days · {item.next_needed_date}
                    </div>
                  </div>
                  <ConfidencePill confidence={item.confidence} worry={item.worry_score} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Ranked donors */}
        <section className="lg:col-span-3 bg-white rounded-4xl ring-1 ring-marrow-200/60 overflow-hidden">
          <header className="px-6 pt-6 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tightest text-marrow-900">
                Ranked donors {activePatient && <span className="text-marrow-600">· {patientLabel(activePatient)}</span>}
              </h2>
              <p className="text-xs text-marrow-900/60 mt-0.5">Score factors are shown in plain English</p>
            </div>
            <span className="pill bg-marrow-100 text-marrow-700">Top 5</span>
          </header>
          <ul className="divide-y divide-marrow-100">
            {loadingDonors && <Skeleton lines={3} />}
            {!loadingDonors && donors.map(d => <DonorRow key={d.donor_id} donor={d} />)}
          </ul>
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

function DonorRow({ donor }: { donor: RankedDonor }) {
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
          {f.distance_km ? `${f.distance_km.toFixed(1)} km` : 'distance unknown'}
          {' · '}
          last {f.days_since_last ?? '–'}d ago
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ScoreRing score={donor.score} />
        <button className="px-3.5 py-2 rounded-full bg-marrow-900 hover:bg-marrow-800 text-white text-xs font-semibold transition-colors">
          Approve outreach
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

// Demo-friendly labels: if the patient is from our seed list, use the name;
// otherwise show a shortened id.
function patientLabel(id: string) {
  return demoPatients.find(p => p.id === id)?.name ?? id.slice(0, 10) + '…'
}
function donorLabel(id: string) {
  const known: Record<string, string> = {
    d_priya: 'Priya R.',
    d_arjun: 'Arjun M.',
    d_neha: 'Neha S.',
    d_rohit: 'Rohit T.',
    d_ananya: 'Ananya K.',
  }
  return known[id] ?? id.slice(0, 10) + '…'
}
