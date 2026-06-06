// Strava-style shareable placard, rendered entirely in the browser on a
// <canvas> → PNG. No server, no AWS cost. The point is marketing: a donor
// taps "share", gets a beautiful 1080×1080 image saying they sustained a life,
// and posts it — every share is organic reach for Blood Warriors.

export interface PlacardData {
  name: string
  livesSustained: number
  lifetimeDonations: number
  bloodGroup: string
  patientName?: string
}

const W = 1080
const H = 1080

export async function renderPlacard(data: PlacardData): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background — deep maroon radial wash.
  const bg = ctx.createRadialGradient(W * 0.3, H * 0.25, 80, W * 0.5, H * 0.5, W * 0.8)
  bg.addColorStop(0, '#931E1D')
  bg.addColorStop(1, '#530404')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Subtle grain via translucent dots.
  ctx.globalAlpha = 0.05
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 400; i++) {
    ctx.beginPath()
    ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Brand row.
  drawDrop(ctx, 90, 96, 30)
  ctx.fillStyle = '#FFE8E8'
  ctx.font = '600 34px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.fillText('Marrow', 138, 108)
  ctx.fillStyle = 'rgba(255,232,232,0.6)'
  ctx.font = '500 22px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.fillText('THE LIVING BLOOD NETWORK', 138, 140)

  // Headline.
  ctx.fillStyle = '#FFF8F8'
  ctx.font = '800 92px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.fillText('I sustained', 90, 360)
  ctx.fillStyle = '#ECA0A0'
  ctx.fillText('a life today.', 90, 470)

  // Sub.
  ctx.fillStyle = 'rgba(255,248,248,0.85)'
  ctx.font = '400 36px "Plus Jakarta Sans", system-ui, sans-serif'
  const sub = data.patientName
    ? `${data.name} → ${data.patientName}'s blood bridge`
    : `${data.name} · ${data.bloodGroup} donor`
  ctx.fillText(sub, 90, 540)

  // Big stats.
  drawStat(ctx, 90, 700, String(data.livesSustained), 'lives sustained')
  drawStat(ctx, 430, 700, String(data.lifetimeDonations), 'donations given')
  drawStat(ctx, 770, 700, data.bloodGroup.replace(' ', '\n'), 'blood group', true)

  // Constellation of sustained lives.
  const stars = Math.max(1, Math.min(data.livesSustained, 24))
  ctx.fillStyle = '#ECA0A0'
  for (let i = 0; i < stars; i++) {
    const x = 90 + (i % 12) * 78
    const y = 880 + Math.floor(i / 12) * 70
    drawStar(ctx, x, y, 12)
  }

  // Footer CTA.
  ctx.fillStyle = 'rgba(255,232,232,0.7)'
  ctx.font = '500 26px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.fillText('Become a bridge donor · bloodwarriors.in', 90, 1020)

  return await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'))
}

function drawStat(ctx: CanvasRenderingContext2D, x: number, y: number, value: string, label: string, multiline = false) {
  ctx.fillStyle = '#FFF8F8'
  ctx.font = '800 76px "Plus Jakarta Sans", system-ui, sans-serif'
  if (multiline) {
    value.split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * 64))
  } else {
    ctx.fillText(value, x, y)
  }
  ctx.fillStyle = 'rgba(255,232,232,0.6)'
  ctx.font = '500 24px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.fillText(label, x, multiline ? y + 96 : y + 40)
}

function drawDrop(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.fillStyle = '#ECA0A0'
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.bezierCurveTo(cx + r, cy - r * 0.2, cx + r * 0.7, cy + r, cx, cy + r)
  ctx.bezierCurveTo(cx - r * 0.7, cy + r, cx - r, cy - r * 0.2, cx, cy - r)
  ctx.fill()
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI / 2) + (i * 2 * Math.PI) / 5
    ctx.lineTo(cx + Math.cos(a) * r, cy - Math.sin(a) * r)
    const a2 = a + Math.PI / 5
    ctx.lineTo(cx + Math.cos(a2) * (r * 0.45), cy - Math.sin(a2) * (r * 0.45))
  }
  ctx.closePath()
  ctx.fill()
}

export async function sharePlacard(data: PlacardData): Promise<void> {
  const blob = await renderPlacard(data)
  const file = new File([blob], 'marrow-impact.png', { type: 'image/png' })

  // Prefer the native share sheet (mobile). Fall back to download.
  const navAny = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: unknown) => Promise<void> }
  if (navAny.canShare?.({ files: [file] }) && navAny.share) {
    try {
      await navAny.share({ files: [file], title: 'I sustained a life today', text: 'Powered by Marrow · Blood Warriors' })
      return
    } catch {
      /* user cancelled or share failed → fall through to download */
    }
  }
  downloadBlob(blob, 'marrow-impact.png')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
