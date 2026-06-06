// Thin typed fetch wrapper. No SWR/React-Query — we don't need them at our scale,
// and skipping them saves ~30KB of client JS.
//
// Toggle NEXT_PUBLIC_USE_MOCKS=true in .env.local to render mock data while
// Harsh wires up the live API. The mock pathway uses the exact same return
// types, so swapping is a no-op for components.

import { mocks } from './mocks'
import type {
  ConversationTurn,
  ForecastResponse,
  RankDonorsResponse,
  Refusal,
  SaathiOutreachResponse,
} from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true' || !API_URL

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    // Static export → calls hit the public API Gateway URL from the browser.
    // No-store: keep the demo always fresh; APIGW + Lambda are sub-200ms.
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

export const api = {
  health: () =>
    USE_MOCKS ? Promise.resolve({ ok: true, service: 'mock' }) : request<{ ok: boolean; service: string }>('/health'),

  forecast: (params: { window?: number; sort?: 'date' | 'worry'; anchor_date?: string } = {}) => {
    if (USE_MOCKS) return Promise.resolve(mocks.forecast(params))
    const q = new URLSearchParams()
    if (params.window) q.set('window', String(params.window))
    if (params.sort) q.set('sort', params.sort)
    if (params.anchor_date) q.set('anchor_date', params.anchor_date)
    return request<ForecastResponse>(`/forecast?${q.toString()}`)
  },

  rankDonors: (patient_id: string, limit = 5) => {
    if (USE_MOCKS) return Promise.resolve(mocks.rankDonors(patient_id, limit))
    const q = new URLSearchParams({ patient_id, limit: String(limit) })
    return request<RankDonorsResponse>(`/rank-donors?${q.toString()}`)
  },

  saathiOutreach: (body: { donor_id: string; patient_id: string; language: string; register: 'formal' | 'intimate' }) => {
    if (USE_MOCKS) return Promise.resolve(mocks.saathiOutreach(body))
    return request<SaathiOutreachResponse>('/saathi/outreach', { method: 'POST', body: JSON.stringify(body) })
  },

  chatOpen: (donor_id: string) => {
    if (USE_MOCKS) return Promise.resolve(mocks.chatOpen(donor_id))
    return request<{ donor_id: string; opening_message: string; history: ConversationTurn[] }>(
      `/saathi/chat/open?donor_id=${encodeURIComponent(donor_id)}`
    )
  },

  chatTurn: (donor_id: string, text: string, language = 'en') => {
    if (USE_MOCKS) return Promise.resolve(mocks.chatTurn(donor_id, text, language))
    return request<ConversationTurn>('/saathi/chat/turn', {
      method: 'POST',
      body: JSON.stringify({ donor_id, text, language }),
    })
  },

  familyAck: (cycle_id: string) => {
    if (USE_MOCKS) return Promise.resolve(mocks.familyAck(cycle_id))
    return request<{ cycle_id: string; family_reassured_at: string; status: string }>('/family/ack', {
      method: 'POST',
      body: JSON.stringify({ cycle_id }),
    })
  },

  refuse: (body: { donor_id: string; reason_bucket?: Refusal['reason_bucket']; text?: string }) => {
    if (USE_MOCKS) return Promise.resolve(mocks.refuse(body))
    return request<Refusal>('/refusals', { method: 'POST', body: JSON.stringify(body) })
  },
}
