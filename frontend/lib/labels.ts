// Display helpers for the demo.
//
// The dataset has no name column. So we never invent identities on the
// coordinator surface — every patient and donor renders as "Patient
// <prefix>" or "Donor <prefix>" using the first 6 chars of their real
// DynamoDB row id. The id IS the identity, displayed honestly.
//
// The family page is the one exception: a family logging in would see
// their own child's name from their own context, not from the dataset.
// We keep one demo placeholder there for storytelling, clearly marked.

export interface PatientLabel {
  display: string
  shortId: string
}

export function patientLabel(id: string): PatientLabel {
  const shortId = id.slice(0, 6)
  return {
    display: `Patient ${shortId}`,
    shortId,
  }
}

export function donorLabel(id: string): string {
  if (!id) return 'Donor'
  return `Donor ${id.slice(0, 6)}`
}

// First patient returned by the live forecast becomes the family demo target.
// No hard-coded ID — family page reads it from the API response at runtime.
export const FAMILY_DEMO_CHILD_NAME = 'your child'
