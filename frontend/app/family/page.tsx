'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { demoPatients } from '@/lib/mocks'

export default function FamilyPage() {
  const patient = demoPatients[0]
  const cycleId = 'cyc_aarav_2025-11-24'
  const [acked, setAcked] = useState(false)
  const nextDate = '24 November 2025'

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-16">
      <div className="rounded-5xl bg-fade-pink ring-1 ring-marrow-200/60 p-10 lg:p-14 shadow-soft">
        <span className="pill bg-white text-marrow-700 ring-1 ring-marrow-200/60">
          For {patient.parent}, {patient.name}'s parent
        </span>

        <h1 className="mt-8 text-4xl md:text-5xl font-extrabold tracking-tightest text-marrow-900 leading-tight">
          We've already started looking for donors for {patient.name}'s next transfusion.
        </h1>

        <p className="mt-6 text-lg text-marrow-900/70 leading-relaxed">
          {patient.name}'s next transfusion is scheduled for <strong>{nextDate}</strong>. Two compatible donors near you have
          already been contacted. We'll let you know the moment one confirms — you don't need to call us first.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button
            disabled={acked}
            onClick={async () => {
              await api.familyAck(cycleId)
              setAcked(true)
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
