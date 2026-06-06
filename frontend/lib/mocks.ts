// Shape-accurate mock data so we can develop the UI before Harsh's APIs are
// deployed. Names + locations are fictional but the JSON shape matches
// openapi.yaml exactly.

import type {
  BridgeResponse,
  ConversationTurn,
  Cycle,
  CyclesResponse,
  DonorInsight,
  ForecastResponse,
  NotifyDonorResponse,
  RankDonorsResponse,
  Refusal,
  RunSummary,
  SaathiOutreachResponse,
} from './types'

const today = () => new Date().toISOString().slice(0, 10)
const isoNow = () => new Date().toISOString()

export const demoPatients = [
  { id: 'p_aarav', name: 'Aarav', age: 9, locality: 'Madhapur', blood_group: 'O Positive', parent: 'Lakshmi' },
  { id: 'p_meera', name: 'Meera', age: 7, locality: 'Banjara Hills', blood_group: 'B Positive', parent: 'Ramesh' },
  { id: 'p_kabir', name: 'Kabir', age: 11, locality: 'Kondapur', blood_group: 'A Positive', parent: 'Priya' },
] as const

const demoDonors = [
  { id: 'd_priya', name: 'Priya', distance_km: 4.2, last_msg: 'Was travelling till the 15th.' },
  { id: 'd_arjun', name: 'Arjun', distance_km: 2.1, last_msg: 'Will come by Saturday.' },
  { id: 'd_neha', name: 'Neha', distance_km: 6.8, last_msg: '' },
  { id: 'd_rohit', name: 'Rohit', distance_km: 3.5, last_msg: '' },
  { id: 'd_ananya', name: 'Ananya', distance_km: 9.0, last_msg: 'Had fever last time.' },
]

export const mocks = {
  forecast: ({ window = 7 }: { window?: number }): ForecastResponse => ({
    anchor_date: today(),
    window,
    items: demoPatients.map((p, i) => ({
      patient_id: p.id,
      blood_group: p.blood_group,
      quantity_required: 1,
      last_transfusion_date: '2025-08-02',
      next_needed_date: new Date(Date.now() + (i + 2) * 86400000).toISOString().slice(0, 10),
      days_to_needed: i + 2,
      frequency_in_days: 21,
      confidence: 'high' as const,
      worry_score: 1 - (i + 2) / 14,
    })),
  }),

  rankDonors: (patient_id: string, limit: number): RankDonorsResponse => ({
    patient_id,
    anchor_date: today(),
    items: demoDonors.slice(0, limit).map((d, i) => ({
      donor_id: d.id,
      blood_group: 'O Positive',
      donor_type: i === 0 ? 'Regular Donor' : 'One-Time Donor',
      score: Math.round((0.92 - i * 0.06) * 1000) / 1000,
      factors: {
        eligible: true,
        days_since_last: 84 + i * 12,
        responsiveness: 0.91 - i * 0.07,
        distance_km: d.distance_km,
        group_compat: 1,
        recency_weight: 0.93 - i * 0.05,
      },
    })),
  }),

  saathiOutreach: ({ donor_id, patient_id }: { donor_id: string; patient_id: string }): SaathiOutreachResponse => {
    const d = demoDonors.find(d => d.id === donor_id) ?? demoDonors[0]
    const p = demoPatients.find(p => p.id === patient_id) ?? demoPatients[0]
    return {
      message:
        `Hi ${d.name} — ${d.last_msg ? d.last_msg + ' Hope that’s settled. ' : ''}` +
        `You and ${p.name} both live in ${p.locality}, you have O+ which is exactly what ${p.name}'s treatment needs. ` +
        `${p.name}'s next transfusion is in 3 days. Could you make an hour for it?`,
      model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      usage: { input_tokens: 312, output_tokens: 58 },
    }
  },

  notifyDonor: ({ donor_id, patient_id, trigger }: { donor_id: string; patient_id: string; trigger: string }): NotifyDonorResponse => {
    const outreach = mocks.saathiOutreach({ donor_id, patient_id })
    return {
      donor_id,
      ts: isoNow(),
      message: `[${trigger}] ${outreach.message}`,
      model: outreach.model,
      usage: outreach.usage,
      channel: 'whatsapp',
      language: 'en',
    }
  },

  chatOpen: (donor_id: string) => {
    const d = demoDonors.find(d => d.id === donor_id) ?? demoDonors[0]
    return {
      donor_id,
      opening_message:
        `Hi ${d.name} — last donation was 14 Jul at Apollo. You become eligible again in 23 days. ` +
        `Aarav's family sent you a small note. Want me to put a tentative slot for then?`,
      history: [] as ConversationTurn[],
    }
  },

  chatTurn: (donor_id: string, text: string, language: string): ConversationTurn => ({
    donor_id,
    ts: isoNow(),
    role: 'saathi',
    text: `Got it. I'll let the coordinator know. (You said: "${text}")`,
    lang: language,
  }),

  familyAck: (cycle_id: string) => ({
    cycle_id,
    family_reassured_at: isoNow(),
    status: 'acknowledged',
  }),

  refuse: ({ donor_id, reason_bucket, text }: { donor_id: string; reason_bucket?: Refusal['reason_bucket']; text?: string }): Refusal => ({
    donor_id,
    ts: isoNow(),
    reason_bucket: reason_bucket ?? 'tired',
    text: text ?? '',
    expires_at: new Date(Date.now() + 21 * 86400000).toISOString(),
  }),

  bridge: (patient_id: string): BridgeResponse => ({
    patient_id,
    bridge_id: 'bridge_demo',
    bridge_blood_group: 'O Positive',
    next_needed_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    pool_size: 6,
    ready_count: 2,
    donors: demoDonors.slice(0, 6).map((d, i) => ({
      donor_id: d.id,
      blood_group: 'O Positive',
      donor_type: i % 2 === 0 ? 'Bridge Donor' : 'Regular Donor',
      rotation_state: i < 2 ? 'ready' : i < 4 ? 'recently_donated' : 'resting',
      eligible: i < 2,
      days_since_last: 95 - i * 12,
      responsiveness: 0.8 - i * 0.08,
      last_bridge_donation_date: '2025-05-12',
      score: 0.9 - i * 0.1,
    })),
  }),

  runCycles: (): RunSummary => ({
    anchor_date: today(),
    window: 14,
    summary: { created: 12, auto_running: 9, needs_coordinator: 3, resolved: 0, skipped: 0 },
  }),

  cycles: (state?: string): CyclesResponse => {
    const make = (i: number, st: Cycle['state']): Cycle => ({
      cycle_id: `${demoPatients[i % 3].id}::2025-08-${18 + i}`,
      patient_id: demoPatients[i % 3].id,
      bridge_id: 'bridge_demo',
      bridge_blood_group: 'O Positive',
      assigned_donor_id: st === 'needs_coordinator' ? null : demoDonors[i % demoDonors.length].id,
      next_needed_date: `2025-08-${18 + i}`,
      donor_status: st === 'resolved' ? 'confirmed' : 'pending',
      patient_status: st === 'resolved' ? 'confirmed' : 'pending',
      state: st,
      note:
        st === 'needs_coordinator'
          ? 'No bridge donor is eligible right now — needs a human to widen the search.'
          : st === 'resolved'
            ? 'Donor and patient both confirmed.'
            : 'Donor assigned from bridge rotation. Awaiting confirmation.',
      updated_at: isoNow(),
    })
    const all: Cycle[] = [
      ...Array.from({ length: 9 }, (_, i) => make(i, 'auto_running')),
      ...Array.from({ length: 3 }, (_, i) => make(i + 9, 'needs_coordinator')),
    ]
    const items = state ? all.filter(c => c.state === state) : all
    return { items, counts: { auto_running: 9, needs_coordinator: 3, resolved: 0 } }
  },

  confirm: (cycle_id: string, party: 'donor' | 'patient', decision: 'yes' | 'no'): Cycle => ({
    cycle_id,
    patient_id: demoPatients[0].id,
    bridge_id: 'bridge_demo',
    bridge_blood_group: 'O Positive',
    assigned_donor_id: demoDonors[0].id,
    next_needed_date: '2025-08-18',
    donor_status: party === 'donor' ? (decision === 'yes' ? 'confirmed' : 'declined') : 'pending',
    patient_status: party === 'patient' ? (decision === 'yes' ? 'confirmed' : 'pending') : 'pending',
    state: 'auto_running',
    note: 'Updated.',
    updated_at: isoNow(),
  }),

  assignCycle: (cycle_id: string, donor_id: string): Cycle => ({
    cycle_id,
    patient_id: demoPatients[0].id,
    bridge_id: 'bridge_demo',
    bridge_blood_group: 'O Positive',
    assigned_donor_id: donor_id,
    next_needed_date: '2025-08-18',
    donor_status: 'pending',
    patient_status: 'pending',
    state: 'auto_running',
    note: 'Coordinator manually assigned a donor.',
    updated_at: isoNow(),
  }),

  notifyCycle: (cycle_id: string): Cycle => ({
    cycle_id,
    patient_id: demoPatients[0].id,
    bridge_id: 'bridge_demo',
    bridge_blood_group: 'O Positive',
    assigned_donor_id: demoDonors[0].id,
    next_needed_date: '2025-08-18',
    donor_status: 'pending',
    patient_status: 'pending',
    state: 'auto_running',
    note: 'WhatsApp confirmation request sent. Awaiting donor response.',
    updated_at: isoNow(),
    donor_notified_at: isoNow(),
    last_notified_donor_id: demoDonors[0].id,
    whatsapp_status: { sent: true, status: 'queued' },
  }),

  donorInsight: (donor_id: string): DonorInsight => ({
    donor_id,
    engagement_state: 'warm',
    preferred_channel: 'whatsapp',
    preferred_language: 'en',
    preferred_time_window: 'evening',
    name_used: 'Priya',
    last_refusal_reason: 'travel',
    last_refusal_expires_at: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    lifetime_donations: 8,
    patient_bond: 'Has asked about Aarav twice in the last month',
    what_motivates: ['seeing impact updates', 'knowing the patient by name'],
    what_to_avoid: ['formal language', 'urgency language'],
    summary_120w:
      'Regular O+ donor for three years. Last donation 14 Jul at Apollo Madhapur. Currently travelling till the 15th. Prefers casual messages in the evening. Has bonded with one specific patient family (Aarav).',
    updated_at: isoNow(),
  }),
}
