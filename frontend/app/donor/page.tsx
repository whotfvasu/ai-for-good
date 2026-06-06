'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { ConversationTurn } from '@/lib/types'

const DEMO_DONOR_ID = 'd_priya'
const QUICK_NOS = ['Medical', 'Travel', 'Work', 'Fear', 'Tired', 'Trust'] as const

export default function DonorPage() {
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [opener, setOpener] = useState<string>('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.chatOpen(DEMO_DONOR_ID).then(res => {
      setOpener(res.opening_message)
      setTurns(res.history)
    })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const send = async (text: string) => {
    if (!text.trim()) return
    setSending(true)
    const userTurn: ConversationTurn = {
      donor_id: DEMO_DONOR_ID,
      ts: new Date().toISOString(),
      role: 'user',
      text,
    }
    setTurns(t => [...t, userTurn])
    setDraft('')
    const reply = await api.chatTurn(DEMO_DONOR_ID, text)
    setTurns(t => [...t, reply])
    setSending(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-8">
      <div className="rounded-5xl ring-1 ring-marrow-200/60 bg-white shadow-soft overflow-hidden">
        {/* Donor header */}
        <header className="px-6 py-4 border-b border-marrow-100 flex items-center gap-3 bg-fade-pink">
          <div className="w-10 h-10 rounded-full bg-marrow-900 text-marrow-50 grid place-items-center font-semibold">
            P
          </div>
          <div className="flex-1">
            <div className="font-semibold text-marrow-900">Priya R.</div>
            <div className="text-xs text-marrow-900/60">O Positive · Madhapur · Saathi is listening</div>
          </div>
          <span className="pill bg-marrow-100 text-marrow-700">
            <span className="w-1.5 h-1.5 rounded-full bg-marrow-600 animate-pulse" />
            Eligible in 23 days
          </span>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="h-[460px] overflow-y-auto px-6 py-6 space-y-3 bg-paper">
          {opener && <Bubble role="saathi" text={opener} />}
          {turns.map((t, i) => (
            <Bubble key={i} role={t.role} text={t.text} />
          ))}
          {sending && <Bubble role="saathi" text="…" muted />}
        </div>

        {/* Refusal chips — the “refusal dictionary” surface */}
        <div className="px-6 py-3 border-t border-marrow-100 flex items-center gap-2 flex-wrap bg-marrow-50/60">
          <span className="text-[10px] uppercase tracking-[0.15em] text-marrow-700/70 mr-1">
            If it's a no — tell me why:
          </span>
          {QUICK_NOS.map(reason => (
            <button
              key={reason}
              onClick={() =>
                send(`I can't this time — ${reason.toLowerCase()}.`)
              }
              className="px-3 py-1 text-xs rounded-full bg-white ring-1 ring-marrow-200/60 hover:bg-marrow-100 text-marrow-800 transition-colors"
            >
              {reason}
            </button>
          ))}
        </div>

        {/* Composer */}
        <form
          onSubmit={e => {
            e.preventDefault()
            send(draft)
          }}
          className="px-6 py-4 flex items-center gap-3 border-t border-marrow-100"
        >
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Type a reply…"
            className="flex-1 px-4 py-2.5 rounded-full bg-marrow-50 ring-1 ring-marrow-200/60 placeholder:text-marrow-700/40 focus:outline-none focus:ring-2 focus:ring-marrow-400"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-full bg-marrow-600 hover:bg-marrow-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            disabled={!draft.trim() || sending}
          >
            Send
          </button>
        </form>
      </div>

      {/* Diary peek — link to richer L2 page */}
      <div className="mt-8 p-6 rounded-4xl bg-white ring-1 ring-marrow-200/60">
        <div className="flex items-center justify-between">
          <h2 className="font-bold tracking-tightest text-marrow-900">Your story so far</h2>
          <span className="text-xs text-marrow-900/60">8 patients sustained</span>
        </div>
        <div className="mt-4 grid grid-cols-8 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl bg-gradient-to-br from-marrow-200 to-marrow-400 shadow-inset"
              title={`Patient ${i + 1}`}
            />
          ))}
        </div>
        <p className="mt-4 text-sm text-marrow-900/60 italic">
          "Aarav started 3rd grade — thank you." — Aarav's amma
        </p>
      </div>
    </div>
  )
}

function Bubble({
  role,
  text,
  muted,
}: {
  role: ConversationTurn['role']
  text: string
  muted?: boolean
}) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed rounded-3xl shadow-sm ${
          isUser
            ? 'bg-marrow-900 text-marrow-50 rounded-br-md'
            : 'bg-white ring-1 ring-marrow-200/60 text-marrow-900 rounded-bl-md'
        } ${muted ? 'opacity-60' : ''}`}
      >
        {text}
      </div>
    </div>
  )
}
