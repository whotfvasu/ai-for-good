// Strava-style shareable impact placards, rendered on a <canvas> → PNG.
// Entirely client-side: no server, no AWS cost. Every share is organic reach
// for Blood Warriors.
//
// Supports the formats people actually post in, plus a transparent variant for
// overlaying on a personal photo (like Strava's "transparent" share):
//   - square     1080×1080  Instagram / WhatsApp post
//   - story      1080×1920  Instagram / WhatsApp status, reels
//   - landscape  1200×630   X / LinkedIn / link preview
//
// Design language: minimal, editorial, one accent (the blood drop), generous
// negative space, the metric as the hero — the way Strava leads with distance.

export type PlacardFormat = 'square' | 'story' | 'landscape'

export interface PlacardOptions {
  format: PlacardFormat
  transparent?: boolean // no solid background — for overlaying on a photo
}

export interface PlacardData {
  name: string
  livesSustained: number
  lifetimeDonations: number
  bloodGroup: string
  patientName?: string
}

const SIZES: Record<PlacardFormat, [number, number]> = {
  square: [1080, 1080],
  story: [1080, 1920],
  landscape: [1200, 630],
}

const C = {
  maroonDark: '#530404',
  maroon: '#7C1D2F',
  primary: '#BB2B29',
  coral: '#ECA0A0',
  cream: '#FFF8F8',
  pink: '#FFE8E8',
}

const FONT = '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif'

// ── public API ──────────────────────────────────────────────────────────────

export async function renderPlacard(data: PlacardData, opts: PlacardOptions): Promise<Blob> {
  // Make sure the brand font is ready so canvas text isn't drawn in a fallback.
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready
  } catch {
    /* fonts API unavailable — proceed with fallback font */
  }

  const [W, H] = SIZES[opts.format]
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const transparent = !!opts.transparent

  if (!transparent) {
    paintBackground(ctx, W, H)
  } else {
    // Keep most of the image transparent, but lay a soft bottom scrim so text
    // stays legible on whatever photo it's dropped onto. ~70% stays clear.
    paintScrim(ctx, W, H)
  }

  if (opts.format === 'landscape') {
    drawLandscape(ctx, W, H, data, transparent)
  } else {
    drawVertical(ctx, W, H, data, transparent)
  }

  return await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'))
}

export async function sharePlacard(data: PlacardData, opts: PlacardOptions): Promise<void> {
  const blob = await renderPlacard(data, opts)
  const file = new File([blob], filename(opts), { type: 'image/png' })
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean
    share?: (d: unknown) => Promise<void>
  }
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: 'I sustained a life', text: 'Powered by Marrow · Blood Warriors' })
      return
    } catch {
      /* cancelled → fall through to download */
    }
  }
  downloadBlob(blob, filename(opts))
}

export async function downloadPlacard(data: PlacardData, opts: PlacardOptions): Promise<void> {
  const blob = await renderPlacard(data, opts)
  downloadBlob(blob, filename(opts))
}

function filename(opts: PlacardOptions): string {
  return `marrow-impact-${opts.format}${opts.transparent ? '-transparent' : ''}.png`
}

// ── backgrounds ──────────────────────────────────────────────────────────────

function paintBackground(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H)
  bg.addColorStop(0, C.maroon)
  bg.addColorStop(1, C.maroonDark)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Oversized, low-opacity blood-drop watermark — the one brand motif.
  ctx.save()
  ctx.globalAlpha = 0.06
  drawDrop(ctx, W * 0.82, H * 0.78, Math.min(W, H) * 0.42, C.coral)
  ctx.restore()

  // Fine grain.
  ctx.save()
  ctx.globalAlpha = 0.04
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 600; i++) {
    ctx.beginPath()
    ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function paintScrim(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H)
  g.addColorStop(0, 'rgba(40,2,2,0)')
  g.addColorStop(1, 'rgba(40,2,2,0.55)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

// ── layouts ──────────────────────────────────────────────────────────────────

function drawVertical(ctx: CanvasRenderingContext2D, W: number, H: number, data: PlacardData, transparent: boolean) {
  const pad = Math.round(W * 0.085)
  const heroText = transparent // on photos, white reads best; on maroon, cream
  if (transparent) ctx.save(), enableShadow(ctx)

  // Brand row.
  drawDrop(ctx, pad + 16, H * 0.06 + 4, 30, C.coral)
  text(ctx, 'Marrow', pad + 44, H * 0.06 - 2, 36, 700, C.pink)
  text(ctx, 'THE LIVING BLOOD NETWORK', pad + 44, H * 0.06 + 30, 20, 600, alpha(C.pink, 0.65), 1.6)

  // Hero metric — the Strava move: lead with the number.
  const heroY = H * 0.34
  text(ctx, String(data.livesSustained), pad, heroY, Math.round(W * 0.26), 800, C.cream)
  text(ctx, data.livesSustained === 1 ? 'life sustained' : 'lives sustained', pad + 6, heroY + Math.round(W * 0.075), 38, 500, alpha(C.pink, 0.8))

  // Tagline.
  text(ctx, 'Every cycle,', pad, heroY + Math.round(W * 0.2), 64, 800, C.cream)
  text(ctx, 'I show up.', pad, heroY + Math.round(W * 0.2) + 76, 64, 800, C.coral)

  // Secondary stats.
  const statsY = H * (H > 1400 ? 0.74 : 0.78)
  stat(ctx, pad, statsY, String(data.lifetimeDonations), 'donations given')
  stat(ctx, W * 0.5, statsY, data.bloodGroup || '—', 'blood group')

  // Constellation.
  constellation(ctx, pad, statsY + 96, W - pad * 2, data.livesSustained)

  // Footer.
  text(ctx, `${data.name} · bloodwarriors.in`, pad, H - H * 0.05, 26, 500, alpha(C.pink, 0.75))

  if (transparent) ctx.restore()
}

function drawLandscape(ctx: CanvasRenderingContext2D, W: number, H: number, data: PlacardData, transparent: boolean) {
  const pad = Math.round(W * 0.06)
  if (transparent) ctx.save(), enableShadow(ctx)

  // Left column — brand + tagline.
  drawDrop(ctx, pad + 14, pad + 18, 26, C.coral)
  text(ctx, 'Marrow', pad + 40, pad + 12, 32, 700, C.pink)
  text(ctx, 'THE LIVING BLOOD NETWORK', pad + 40, pad + 40, 17, 600, alpha(C.pink, 0.65), 1.6)

  text(ctx, 'Every cycle,', pad, H * 0.46, 72, 800, C.cream)
  text(ctx, 'I show up.', pad, H * 0.46 + 80, 72, 800, C.coral)
  text(ctx, `${data.name} · ${data.bloodGroup} bridge donor`, pad, H * 0.46 + 140, 26, 500, alpha(C.pink, 0.8))

  // Right column — hero number + stats.
  const rx = W * 0.62
  text(ctx, String(data.livesSustained), rx, H * 0.42, 220, 800, C.cream)
  text(ctx, data.livesSustained === 1 ? 'life sustained' : 'lives sustained', rx + 6, H * 0.42 + 56, 30, 500, alpha(C.pink, 0.8))
  stat(ctx, rx, H * 0.78, String(data.lifetimeDonations), 'donations given')

  // Footer.
  text(ctx, 'bloodwarriors.in', pad, H - pad * 0.5, 24, 500, alpha(C.pink, 0.7))

  if (transparent) ctx.restore()
}

// ── primitives ───────────────────────────────────────────────────────────────

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  weight: number,
  color: string,
  letterSpacing = 0,
) {
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  if (letterSpacing) {
    let cx = x
    for (const ch of value) {
      ctx.fillText(ch, cx, y)
      cx += ctx.measureText(ch).width + letterSpacing
    }
  } else {
    ctx.fillText(value, x, y)
  }
}

function stat(ctx: CanvasRenderingContext2D, x: number, y: number, value: string, label: string) {
  text(ctx, value, x, y, 72, 800, C.cream)
  text(ctx, label, x, y + 36, 24, 500, alpha(C.pink, 0.6))
}

function constellation(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, count: number) {
  const n = Math.max(1, Math.min(count, 24))
  const perRow = Math.min(12, n)
  const gap = width / perRow
  ctx.fillStyle = C.coral
  for (let i = 0; i < n; i++) {
    const sx = x + (i % perRow) * gap + gap * 0.3
    const sy = y + Math.floor(i / perRow) * 64
    drawStar(ctx, sx, sy, 11)
  }
}

function drawDrop(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.bezierCurveTo(cx + r, cy - r * 0.2, cx + r * 0.7, cy + r, cx, cy + r)
  ctx.bezierCurveTo(cx - r * 0.7, cy + r, cx - r, cy - r * 0.2, cx, cy - r)
  ctx.fill()
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 5
    ctx.lineTo(cx + Math.cos(a) * r, cy - Math.sin(a) * r)
    const a2 = a + Math.PI / 5
    ctx.lineTo(cx + Math.cos(a2) * (r * 0.45), cy - Math.sin(a2) * (r * 0.45))
  }
  ctx.closePath()
  ctx.fill()
}

function enableShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'rgba(20,0,0,0.45)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 2
}

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
