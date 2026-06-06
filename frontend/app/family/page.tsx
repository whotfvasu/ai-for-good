'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { patientLabel } from '@/lib/labels'
import type { ForecastItem } from '@/lib/types'

export default function FamilyPage() {
  // Pull the first upcoming patient from the live forecast and use it as the
  // family-side perspective. In production the logged-in family would resolve
  // to their own patient row; the demo just uses index 0.
  const [item, setItem] = useState<ForecastItem | null>(null)
  const [acked, setAcked] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .forecast({ window: 14, sort: 'date' })
      .then(res => setItem(res.items[0] ?? null))
      .catch(() => setItem(null))
      .finally(() => setLoading(false))
  }, [])

  const label = item ? patientLabel(item.patient_id) : { display: 'Patient', shortId: '' }
  const cycleId = item ? `cyc_${item.patient_id}_${item.next_needed_date}` : 'cyc_demo'
  const nextDate = item ? formatDate(item.next_needed_date) : '—'

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-16">
      <div className="rounded-5xl bg-fade-pink ring-1 ring-marrow-200/60 p-10 lg:p-14 shadow-soft">
        <span className="pill bg-white text-marrow-700 ring-1 ring-marrow-200/60">
          Family view · {label.display}
        </span>

        <h1 className="mt-8 text-4xl md:text-5xl font-extrabold tracking-tightest text-marrow-900 leading-tight">
          We've already started looking for donors for your child's next transfusion.
        </h1>

        <p className="mt-6 text-lg text-marrow-900/70 leading-relaxed">
          {loading ? (
            'Loading forecast…'
          ) : item ? (
            <>
              The next transfusion is scheduled for <strong>{nextDate}</strong> — that's <strong>{item.days_to_needed} day{item.days_to_needed === 1 ? '' : 's'}</strong> from now.
              Saathi is already reaching the top compatible donors nearby. We'll let you know the moment one confirms; you don't need to call us first.
            </>
          ) : (
            <>No upcoming transfusion in the next 14 days for this patient.</>
          )}
        </p>

        {item && (
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-marrow-900/60">
            <span className="font-mono">{item.patient_id.slice(0, 12)}…</span>
            <span>·</span>
            <span>{item.blood_group}</span>
            <span>·</span>
            <span>confidence {item.confidence}</span>
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button
            disabled={acked || !item}
            onClick={async () => {
              try {
                await api.familyAck(cycleId)
              } finally {
                setAcked(true)
              }
            }}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-marrow-900 hover:bg-marrow-800 text-marrow-50 font-semibold disabled:opacity-60 transition-colors"
          >
            {acked ? '✓ Acknowledged' : 'Got it 🙏'}
          </button>
          <a className="text-sm text-marrow-700 underline-offset-4 hover:underline" href="tel:+910000000000">
            Call coordinator
          </a>
        </div>

        {acked && (
          <p className="mt-10 text-sm text-marrow-800 animate-fade-in">
            Thank you — your acknowledgement helps our team know one fewer family is anxious right now.
          </p>
        )}
      </div>

      <div className="mt-10 grid sm:grid-cols-2 gap-5">
        <InfoCard
          title="What happens next"
          body="Saathi reaches out to ranked donors in their preferred language. We confirm one within 48 hours, and you get a notification."
        />
        <InfoCard
          title="Why you didn't have to ask"
          body="We forecast each patient's transfusion 14 days ahead from their last cycle. That window is when relationships form."
        />
      </div>
    </div>
  )
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-6 rounded-4xl bg-white ring-1 ring-marrow-200/60">
      <h3 className="font-bold tracking-tightest text-marrow-900">{title}</h3>
      <p className="mt-2 text-sm text-marrow-900/60 leading-relaxed">{body}</p>
    </div>
  )
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}
