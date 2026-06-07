'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  downloadPlacard,
  renderPlacard,
  sharePlacard,
  type PlacardData,
  type PlacardFormat,
} from '@/lib/placard'
import type { DonorInsight } from '@/lib/types'

const FORMATS: { id: PlacardFormat; label: string; hint: string; ratio: string }[] = [
  { id: 'square', label: 'Post', hint: '1080×1080', ratio: 'aspect-square' },
  { id: 'story', label: 'Story', hint: '1080×1920', ratio: 'aspect-[9/16]' },
  { id: 'landscape', label: 'Wide', hint: '1200×630', ratio: 'aspect-[1200/630]' },
]

export function ImpactPlacard({ insight }: { insight: DonorInsight | null }) {
  const [format, setFormat] = useState<PlacardFormat>('square')
  const [transparent, setTransparent] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(true) // drives the blur transition
  const [busy, setBusy] = useState(false)
  const urlRef = useRef<string | null>(null)

  const lifetime = insight?.lifetime_donations ?? 0
  const lives = Math.max(1, lifetime)

  const data: PlacardData = {
    name: insight?.name_used || 'A Marrow donor',
    livesSustained: lives,
    lifetimeDonations: lifetime,
    // Blood group isn't in the cold-memory insight; default for the card.
    bloodGroup: 'O Positive',
    patientName: insight?.patient_bond ? insight.patient_bond.split(' ')[0] : undefined,
  }

  // Re-render the preview whenever format / background / data changes.
  // We blur the current frame out, render the new PNG off-thread, then blur it
  // back in on the image's onLoad — so the canvas work never shows as a stutter.
  const refreshPreview = useCallback(async () => {
    setRendering(true)
    const blob = await renderPlacard(data, { format, transparent })
    const url = URL.createObjectURL(blob)
    const prev = urlRef.current
    urlRef.current = url
    setPreviewUrl(url) // onLoad will clear `rendering` once decoded
    if (prev) URL.revokeObjectURL(prev)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, transparent, lifetime, lives])

  useEffect(() => {
    refreshPreview()
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [refreshPreview])

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold tracking-tightest text-lg text-marrow-900">Share your impact</h2>
          <p className="mt-1 text-sm text-marrow-900/60 max-w-sm">
            You've sustained {lives} {lives === 1 ? 'life' : 'lives'}. Pick a format and post it — every share recruits the next donor.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-5">
        {/* Live preview (top) — true aspect ratio per format; the image blurs
            out/in to mask the canvas re-render so the swap isn't a stutter. */}
        <div>
          <div
            className={clsx(
              'relative mx-auto w-full max-w-[260px] rounded-2xl overflow-hidden ring-1 ring-marrow-200/60 grid place-items-center',
              FORMATS.find(f => f.id === format)!.ratio,
              transparent
                ? 'bg-[conic-gradient(#eee_90deg,#fff_90deg_180deg,#eee_180deg_270deg,#fff_270deg)] bg-[length:20px_20px]'
                : 'bg-marrow-50'
            )}
          >
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Impact card preview"
                onLoad={() => setRendering(false)}
                className={clsx(
                  'w-full h-full object-cover transition-[opacity,filter,transform] duration-300 ease-out will-change-[opacity,filter,transform]',
                  rendering ? 'opacity-0 blur-lg scale-95' : 'opacity-100 blur-0 scale-100'
                )}
              />
            )}
            {rendering && <span className="absolute text-marrow-900/30 text-xs">Rendering…</span>}
          </div>
          {transparent && (
            <p className="mt-2 text-center text-[11px] text-marrow-900/50">Transparent PNG — drop it over your photo</p>
          )}
        </div>

        {/* Controls */}
        <div>
          <div className="eyebrow">Format</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {FORMATS.map(f => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={clsx(
                  'px-3 py-2 rounded-2xl text-left ring-1 transition-all',
                  format === f.id
                    ? 'bg-marrow-900 text-marrow-50 ring-marrow-900'
                    : 'bg-marrow-50 text-marrow-800 ring-marrow-200/60 hover:bg-marrow-100'
                )}
              >
                <div className="text-sm font-semibold">{f.label}</div>
                <div className={clsx('text-[10px]', format === f.id ? 'text-marrow-200/80' : 'text-marrow-900/50')}>
                  {f.hint}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 eyebrow">Background</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => setTransparent(false)}
              className={clsx(
                'px-3 py-2 rounded-2xl text-sm font-medium ring-1 transition-all',
                !transparent ? 'bg-marrow-900 text-marrow-50 ring-marrow-900' : 'bg-marrow-50 text-marrow-800 ring-marrow-200/60 hover:bg-marrow-100'
              )}
            >
              With background
            </button>
            <button
              onClick={() => setTransparent(true)}
              className={clsx(
                'px-3 py-2 rounded-2xl text-sm font-medium ring-1 transition-all',
                transparent ? 'bg-marrow-900 text-marrow-50 ring-marrow-900' : 'bg-marrow-50 text-marrow-800 ring-marrow-200/60 hover:bg-marrow-100'
              )}
            >
              Transparent
            </button>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={async () => {
                setBusy(true)
                try {
                  await sharePlacard(data, { format, transparent })
                } finally {
                  setBusy(false)
                }
              }}
              disabled={busy}
              className="btn-primary btn-md flex-1"
            >
              {busy ? 'Working…' : 'Share'}
            </button>
            <button onClick={() => downloadPlacard(data, { format, transparent })} className="btn-secondary btn-md">
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
