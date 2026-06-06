// Defensive cleanup of Saathi / notification output before it ever reaches a
// user-facing bubble. The model is *prompted* not to emit rationale, but in a
// live demo we never want to rely on that alone. This strips the failure modes
// we've actually seen: a trailing "Why this works" rationale block, leading
// markdown headings ("# Opening message for ..."), horizontal rules, and bold
// markers. User-typed messages are never passed through this.

const CUT_MARKERS: RegExp[] = [
  /\n\s*-{3,}\s*\n/i,                          // a "---" horizontal rule line
  /\*\*\s*why\b/i,                             // "**Why this works**"
  /\bwhy this (works|approach|message|matters)\b/i,
  /\n\s*(notes?|rationale|explanation|reasoning)\s*:/i,
  /\bhere'?s why\b/i,
]

export function sanitizeSaathiMessage(raw: string): string {
  if (!raw) return raw
  let text = raw

  // 1. Cut everything from the first rationale/separator marker onward.
  let cutIndex = text.length
  for (const re of CUT_MARKERS) {
    const m = text.match(re)
    if (m && m.index !== undefined && m.index < cutIndex) cutIndex = m.index
  }
  text = text.slice(0, cutIndex)

  // 2. Drop any markdown heading lines ("# Opening message for ...").
  text = text.replace(/^\s*#{1,6}\s.*$/gm, '')

  // 3. Strip bold markers but keep the inner words.
  text = text.replace(/\*\*(.+?)\*\*/g, '$1')

  // 4. Drop stray leading list bullets the model sometimes prepends.
  text = text.replace(/^\s*[-*]\s+/gm, '')

  // 5. Collapse excess blank lines, trim.
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  return text
}
