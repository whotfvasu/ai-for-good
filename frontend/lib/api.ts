// Thin typed fetch wrapper. No SWR/React-Query — we don't need them at our
// scale, and skipping them saves ~30KB of client JS.
//
// Three runtime modes are controlled via env vars at build time:
//
//   NEXT_PUBLIC_USE_MOCKS=true        → all routes use mocks. Useful before
//                                       any backend exists.
//   NEXT_PUBLIC_USE_L2_MOCKS=true     → L1 routes (forecast, rank-donors,
//                                       family/ack, health) hit the live API;
//                                       L2 routes (saathi/*, /refusals,
//                                       /conversations, /donor/*/diary,
//                                       /coordinator/*/pulse) stay mocked.
//                                       This is checkpoint mode.
//   NEXT_PUBLIC_API_URL=https://...   → required for any live route.
//
// Plus a demo anchor date — the dataset is dated 2025-08-XX, so we pass
// anchor_date through to /forecast and /rank-donors so the demo works without
// time-warping the database.
//
//   NEXT_PUBLIC_DEMO_ANCHOR_DATE=2025-08-17

import { mocks } from './mocks'
import type {
  ConversationTurn,
  ForecastResponse,
  RankDonorsResponse,
  Refusal,
  SaathiOutreachResponse,
} from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''
const FULL_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true' || !API_URL
const L2_MOCKS = process.env.NEXT_PUBLIC_USE_L2_MOCKS === 'true' || FULL_MOCKS
export const DEMO_ANCHOR_DATE = process.env.NEXT_PUBLIC_DEMO_ANCHOR_DATE || ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    // No-store: keep the demo always fresh; APIGW + Lambda are sub-200ms.
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

// Helper: prepend the anchor date when set, without overriding an explicit one.
function withAnchor<T extends { anchor_date?: string }>(params: T): T {
  if (params.anchor_date) return params
  if (DEMO_ANCHOR_DATE) return { ...params, anchor_date: DEMO_ANCHOR_DATE }
  return params
}

export const api = {
  health: () =>
    FULL_MOCKS
      ? Promise.resolve({ ok: true, service: 'mock' })
      : request<{ ok: boolean; service: string }>('/health'),

  // L1 — goes live in checkpoint mode
  forecast: (params: { window?: number; sort?: 'date' | 'worry'; anchor_date?: string } = {}) => {
    if (FULL_MOCKS) return Promise.resolve(mocks.forecast(params))
    const merged = withAnchor(params)
    const q = new URLSearchParams()
    if (merged.window) q.set('window', String(merged.window))
    if (merged.sort) q.set('sort', merged.sort)
    if (merged.anchor_date) q.set('anchor_date', merged.anchor_date)
    return request<ForecastResponse>(`/forecast?${q.toString()}`)
  },

  // L1 — goes live in checkpoint mode
  rankDonors: (patient_id: string, limit = 5, anchor_date?: string) => {
    if (FULL_MOCKS) return Promise.resolve(mocks.rankDonors(patient_id, limit))
    const merged = withAnchor({ anchor_date })
    const q = new URLSearchParams({ patient_id, limit: String(limit) })
    if (merged.anchor_date) q.set('anchor_date', merged.anchor_date)
    return request<RankDonorsResponse>(`/rank-donors?${q.toString()}`)
  },

  // L1 — goes live in checkpoint mode
  familyAck: (cycle_id: string) => {
    if (FULL_MOCKS) return Promise.resolve(mocks.familyAck(cycle_id))
    return request<{ cycle_id: string; family_reassured_at: string; status: string }>('/family/ack', {
      method: 'POST',
      body: JSON.stringify({ cycle_id }),
    })
  },

  // L2 — mocked until backend ships
  saathiOutreach: (body: { donor_id: string; patient_id: string; language: string; register: 'formal' | 'intimate' }) => {
    if (L2_MOCKS) return Promise.resolve(mocks.saathiOutreach(body))
    return request<SaathiOutreachResponse>('/saathi/outreach', { method: 'POST', body: JSON.stringify(body) })
  },

  chatOpen: (donor_id: string) => {
    if (L2_MOCKS) return Promise.resolve(mocks.chatOpen(donor_id))
    return request<{ donor_id: string; opening_message: string; history: ConversationTurn[] }>(
      `/saathi/chat/open?donor_id=${encodeURIComponent(donor_id)}`
    )
  },

  chatTurn: (donor_id: string, text: string, language = 'en') => {
    if (L2_MOCKS) return Promise.resolve(mocks.chatTurn(donor_id, text, language))
    return request<ConversationTurn>('/saathi/chat/turn', {
      method: 'POST',
      body: JSON.stringify({ donor_id, text, language }),
    })
  },

  refuse: (body: { donor_id: string; reason_bucket?: Refusal['reason_bucket']; text?: string }) => {
    if (L2_MOCKS) return Promise.resolve(mocks.refuse(body))
    return request<Refusal>('/refusals', { method: 'POST', body: JSON.stringify(body) })
  },
}
