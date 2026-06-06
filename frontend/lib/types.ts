// Types mirror the schemas in openapi.yaml at the repo root.
// One source of truth for both backend and frontend.

export type Role = 'coordinator' | 'donor' | 'patient'

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
  ml_propensity?: number | null
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
  whatsapp?: { sent: boolean; reason?: string; status?: string; sid?: string }
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

export type RotationState = 'ready' | 'recently_donated' | 'resting'

export interface BridgeDonor {
  donor_id: string
  blood_group: string
  donor_type: string | null
  rotation_state: RotationState
  eligible: boolean
  days_since_last: number | null
  responsiveness: number
  ml_propensity?: number | null
  last_bridge_donation_date: string | null
  score: number
}

export interface BridgeResponse {
  patient_id: string
  bridge_id: string | null
  bridge_blood_group: string
  next_needed_date: string | null
  pool_size: number
  ready_count: number
  donors: BridgeDonor[]
  ml_importance?: Record<string, number>
}

export type CycleState = 'auto_running' | 'needs_coordinator' | 'resolved'

export interface Cycle {
  cycle_id: string
  patient_id: string
  bridge_id: string | null
  bridge_blood_group: string
  assigned_donor_id: string | null
  next_needed_date: string
  donor_status: 'pending' | 'confirmed' | 'declined'
  patient_status: 'pending' | 'confirmed'
  state: CycleState
  note: string
  updated_at: string
  donor_notified_at?: string
  last_notified_donor_id?: string
  last_message_text?: string
  whatsapp_status?: { sent: boolean; reason?: string; status?: string; sid?: string }
}

export interface CyclesResponse {
  items: Cycle[]
  counts: Partial<Record<CycleState, number>>
}

export interface RunSummary {
  anchor_date: string
  window: number
  max_cycles?: number | null
  summary: {
    created: number
    auto_running: number
    needs_coordinator: number
    resolved: number
    skipped: number
    processed?: number
    limited?: boolean
  }
}
