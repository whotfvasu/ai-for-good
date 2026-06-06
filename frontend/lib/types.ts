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
