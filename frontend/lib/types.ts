// Types mirror the schemas in openapi.yaml at the repo root.
// One source of truth for both backend and frontend.

export type Role = 'coordinator' | 'donor' | 'family'

export interface ForecastItem {
  patient_id: string
  blood_group: string
  quantity_required: number | null
  last_transfusion_date: string | null
  next_needed_date: string
  days_to_needed: number
  frequency_in_days: number | null
  confidence: 'high' | 'medium'
  worry_score: number
}

export interface ForecastResponse {
  anchor_date: string
  window: number
  items: ForecastItem[]
}

export interface RankedDonorFactors {
  eligible: boolean
  days_since_last: number | null
  responsiveness: number
  distance_km: number | null
  group_compat: number
  recency_weight: number
}

export interface RankedDonor {
  donor_id: string
  blood_group: string
  donor_type: string | null
  score: number
  factors: RankedDonorFactors
}

export interface RankDonorsResponse {
  patient_id: string
  anchor_date: string
  items: RankedDonor[]
}

export interface ConversationTurn {
  donor_id: string
  ts: string
  role: 'user' | 'saathi' | 'coordinator' | 'family'
  text: string
  lang?: string
  meta?: Record<string, unknown>
}

export interface Refusal {
  donor_id: string
  ts: string
  reason_bucket: 'medical' | 'travel' | 'work' | 'fear' | 'tired' | 'trust'
  text?: string
  expires_at?: string | null
}

export interface SaathiOutreachResponse {
  message: string
  model: string
  usage?: { input_tokens: number; output_tokens: number }
}

export interface NotifyDonorResponse {
  donor_id: string
  ts: string
  message: string
  model: string
  usage?: { input_tokens: number; output_tokens: number }
  channel: string
  language: string
}

// The cold-memory record — produced by the distill_insight Lambda from up to
// 30 raw chat turns, stored as a single DynamoDB row per donor, and loaded
// on every notification call to keep prompt size bounded.
export interface DonorInsight {
  donor_id: string
  engagement_state: 'warm' | 'drifting' | 'dormant' | 'lapsed'
  preferred_channel: 'whatsapp' | 'sms' | 'voice' | 'email'
  preferred_language: 'en' | 'hi' | 'te'
  preferred_time_window: 'morning' | 'evening' | 'weekend' | 'any'
  name_used: string
  last_refusal_reason: 'medical' | 'travel' | 'work' | 'fear' | 'tired' | 'trust' | null
  last_refusal_expires_at: string | null
  lifetime_donations: number
  patient_bond: string
  what_motivates: string[]
  what_to_avoid: string[]
  summary_120w: string
  updated_at: string
}

export interface ConversationsResponse {
  donor_id: string
  items: ConversationTurn[]
}
