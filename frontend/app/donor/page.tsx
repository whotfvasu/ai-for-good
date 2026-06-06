'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { donorLabel } from '@/lib/labels'
import type { ConversationTurn, DonorInsight } from '@/lib/types'

const QUICK_NOS = ['Medical', 'Travel', 'Work', 'Fear', 'Tired', 'Trust'] as const
const POLL_INTERVAL_MS = 4000
const DEDUPE_WINDOW_MS = 5 * 60 * 1000  // optimistic+polled merge window

export default function DonorPage() {
  // Real donor id resolved at runtime: ?donor_id=… override, else first
  // upcoming patient's top-ranked donor. Same DynamoDB row the coordinator
  // is approving outreach for.
  const [donorId, setDonorId] = useState<string | null>(null)
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [insight, setInsight] = useState<DonorInsight | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── 1. Resolve donor id ──────────────────────────────────────────────────
  useEffect(() => {
    const url = new URL(window.location.href)
    const overrideId = url.searchParams.get('donor_id')
    if (overrideId) {
      setDonorId(overrideId)
      return
    }
    api
      .forecast({ window: 14, sort: 'date' })
      .then(forecast => {
        const firstPatient = forecast.items[0]
        if (!firstPatient) throw new Error('no upcoming patients in forecast window')
        return api.rankDonors(firstPatient.patient_id, 1)
      })
      .then(rank => {
        const top = rank.items[0]
        if (!top) throw new Error('no compatible donor for top patient')
        setDonorId(top.donor_id)
      })
      .catch(err =>
        setError(
          `Could not resolve a demo donor (${err.message}). Pin one manually with ?donor_id=<hex>.`
        )
      )
  }, [])

  // ── 2. Fetch opener + insight + initial history ──────────────────────────
  // The chatOpen call generates and persists a fresh opener every time, so we
  // treat opening_message as just another turn and let the merge logic dedupe
  // it against whatever /conversations brings back. No separate "opener"
  // bubble in the render — the model output never gets rendered twice.
  useEffect(() => {
    if (!donorId) return
    api
      .chatOpen(donorId)
      .then(res => {
        const history = res.history ?? []
        const opener: ConversationTurn = {
          donor_id: donorId,
          ts: new Date().toISOString(),
          role: 'saathi',
          text: res.opening_message,
        }
        setTurns(mergeTurns([], [...history, opener]))
      })
      .catch(err => setError(`Chat open failed: ${err.message}`))

    api
      .donorInsight(donorId)
      .then(setInsight)
      .catch(() => setInsight(null))
  }, [donorId])

  // ── 3. Live poll /conversations for inbound notifications ────────────────
  useEffect(() => {
    if (!donorId) return
    const tick = async () => {
      try {
        const res = await api.conversations(donorId, 20)
        setTurns(prev => mergeTurns(prev, res.items ?? []))
      } catch {
        // Network blips are non-fatal — next tick retries.
      }
    }
    const id = window.setInterval(tick, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [donorId])

  // ── 4. Autoscroll on new turn ────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !donorId || sending) return
    setSending(true)
    const optimistic: ConversationTurn = {
      donor_id: donorId,
      ts: new Date().toISOString(),
      role: 'user',
      text: trimmed,
    }
    setTurns(prev => mergeTurns(prev, [optimistic]))
    setDraft('')
    try {
      const reply = await api.chatTurn(donorId, trimmed, insight?.preferred_language ?? 'en')
      if (reply) setTurns(prev => mergeTurns(prev, [reply]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-8">
      <ChatCard
        donorId={donorId}
        turns={turns}
        sending={sending}
        scrollRef={scrollRef}
        insight={insight}
        draft={draft}
        setDraft={setDraft}
        send={send}
        error={error}
      />
      <InsightPill insight={insight} donorId={donorId} />
    </div>
  )
}

// Merge two turn lists into a single sorted, deduplicated list.
// Dedupe rule: a polled or optimistic turn matches an existing turn if they
// share the same role and exact text within DEDUPE_WINDOW_MS of each other.
// This handles two real cases at once:
//   - Optimistic user turn vs polled user turn (different timestamps, same body)
//   - Pre-persisted opener returned by /conversations vs the opener we already
//     rendered from /chat/open's response.
function mergeTurns(existing: ConversationTurn[], incoming: ConversationTurn[]): ConversationTurn[] {
  const merged = [...existing]
  for (const inc of incoming) {
    const dup = merged.find(e => {
      if (e.role !== inc.role) return false
      if (e.text.trim() !== inc.text.trim()) return false
      const dtMs = Math.abs(new Date(e.ts).getTime() - new Date(inc.ts).getTime())
      return dtMs < DEDUPE_WINDOW_MS
    })
    if (!dup) merged.push(inc)
  }
  return merged.sort((a, b) => a.ts.localeCompare(b.ts))
}

function ChatCard({
  donorId,
  turns,
  sending,
  scrollRef,
  insight,
  draft,
  setDraft,
  send,
  error,
}: {
  donorId: string | null
  turns: ConversationTurn[]
  sending: boolean
  scrollRef: React.RefObject<HTMLDivElement>
  insight: DonorInsight | null
  draft: string
  setDraft: (s: string) => void
  send: (text: string) => Promise<void>
  error: string | null
}) {
  const headerName = insight?.name_used || (donorId ? donorLabel(donorId) : 'Loading…')
  const headerLang = insight?.preferred_language ?? 'en'
  const eligibilityChip = useMemo(() => eligibilityLabel(insight), [insight])

  return (
    <div className="rounded-5xl ring-1 ring-marrow-200/60 bg-white shadow-soft overflow-hidden">
      <header className="px-6 py-4 border-b border-marrow-100 flex items-center gap-3 bg-fade-pink">
        <div className="w-10 h-10 rounded-full bg-marrow-900 text-marrow-50 grid place-items-center font-semibold">
          {(insight?.name_used || 'D').slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-marrow-900 truncate">{headerName}</div>
          <div className="text-xs text-marrow-900/60 truncate">
            Saathi is listening · prefers {headerLang.toUpperCase()}
          </div>
        </div>
        <span className="pill bg-marrow-100 text-marrow-700">
          <span className="w-1.5 h-1.5 rounded-full bg-marrow-600 animate-pulse" />
          {eligibilityChip}
        </span>
      </header>

      {error && (
        <div className="mx-6 mt-3 px-3 py-2 rounded-2xl bg-marrow-100 text-marrow-900 text-xs ring-1 ring-marrow-300">
          {error}
        </div>
      )}

      <div ref={scrollRef} className="h-[460px] overflow-y-auto px-6 py-6 space-y-3 bg-paper">
        {turns.map((t, i) => (
          <Bubble key={`${t.ts}-${i}`} role={t.role} text={t.text} />
        ))}
        {sending && <Bubble role="saathi" text="…" muted />}
        {!turns.length && !error && (
          <div className="text-center text-sm text-marrow-900/40 pt-20">Loading conversation…</div>
        )}
      </div>

      <div className="px-6 py-3 border-t border-marrow-100 flex items-center gap-2 flex-wrap bg-marrow-50/60">
        <span className="text-[10px] uppercase tracking-[0.15em] text-marrow-700/70 mr-1">
          If it's a no — tell me why:
        </span>
        {QUICK_NOS.map(reason => (
          <button
            key={reason}
            onClick={() => send(`I can't this time — ${reason.toLowerCase()}.`)}
            className="px-3 py-1 text-xs rounded-full bg-white ring-1 ring-marrow-200/60 hover:bg-marrow-100 text-marrow-800 transition-colors disabled:opacity-40"
            disabled={!donorId || sending}
          >
            {reason}
          </button>
        ))}
      </div>

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
          placeholder={donorId ? 'Type a reply…' : 'Resolving donor…'}
          className="flex-1 px-4 py-2.5 rounded-full bg-marrow-50 ring-1 ring-marrow-200/60 placeholder:text-marrow-700/40 focus:outline-none focus:ring-2 focus:ring-marrow-400 disabled:opacity-50"
          disabled={!donorId}
        />
        <button
          type="submit"
          className="px-5 py-2.5 rounded-full bg-marrow-600 hover:bg-marrow-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          disabled={!draft.trim() || sending || !donorId}
        >
          Send
        </button>
      </form>
    </div>
  )
}

function InsightPill({ insight, donorId }: { insight: DonorInsight | null; donorId: string | null }) {
  if (!donorId) return null
  if (!insight) {
    return (
      <div className="mt-8 p-6 rounded-4xl bg-white ring-1 ring-marrow-200/60">
        <h2 className="font-bold tracking-tightest text-marrow-900">About you (cold memory)</h2>
        <p className="mt-2 text-sm text-marrow-900/60">
          No distilled insight yet — this donor's chat history hasn't been compressed by Saathi.
        </p>
      </div>
    )
  }
  return (
    <div className="mt-8 p-6 rounded-4xl bg-white ring-1 ring-marrow-200/60">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold tracking-tightest text-marrow-900">About you (cold memory)</h2>
        <span className="text-[10px] uppercase tracking-[0.15em] text-marrow-700/70">
          updated {timeAgo(insight.updated_at)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-marrow-900">{insight.summary_120w}</p>
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Fact label="Engagement" value={insight.engagement_state} />
        <Fact label="Language" value={insight.preferred_language.toUpperCase()} />
        <Fact label="Best time" value={insight.preferred_time_window} />
        <Fact label="Channel" value={insight.preferred_channel} />
      </div>
      {(insight.what_motivates?.length || 0) > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.15em] text-marrow-700/70 mr-1">Motivates:</span>
          {insight.what_motivates.map(m => (
            <span key={m} className="pill bg-marrow-100 text-marrow-700">{m}</span>
          ))}
        </div>
      )}
      {insight.last_refusal_reason && (
        <div className="mt-3 text-xs text-marrow-700">
          Last "no" — <strong>{insight.last_refusal_reason}</strong>
          {insight.last_refusal_expires_at && ` · respect until ${insight.last_refusal_expires_at}`}
        </div>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-2xl bg-marrow-50/60 ring-1 ring-marrow-100">
      <div className="text-[10px] uppercase tracking-[0.12em] text-marrow-700/70">{label}</div>
      <div className="mt-0.5 font-semibold text-marrow-900 capitalize">{value}</div>
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
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-up`}>
      <div
        className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line rounded-3xl shadow-sm ${
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

function eligibilityLabel(insight: DonorInsight | null): string {
  if (!insight) return 'Saathi'
  if (insight.engagement_state === 'warm') return 'Active'
  if (insight.engagement_state === 'drifting') return 'Drifting'
  if (insight.engagement_state === 'dormant') return 'Dormant'
  return 'Lapsed'
}

function timeAgo(iso: string): string {
  try {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
    if (diffSec < 60) return 'just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    return `${Math.floor(diffSec / 86400)}d ago`
  } catch {
    return ''
  }
}
