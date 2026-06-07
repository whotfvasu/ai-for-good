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
  const refreshPreview = useCallback(async () => {
    const blob = await renderPlacard(data, { format, transparent })
    const url = URL.createObjectURL(blob)
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url
    setPreviewUrl(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, transparent, lifetime, lives])

  useEffect(() => {
    refreshPreview()
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [refreshPreview])

  const activeRatio = FORMATS.find(f => f.id === format)!.ratio

  return (
    <div className="mt-6 p-6 rounded-4xl bg-white ring-1 ring-marrow-200/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold tracking-tightest text-lg text-marrow-900">Share your impact</h2>
          <p className="mt-1 text-sm text-marrow-900/60 max-w-sm">
            You've sustained {lives} {lives === 1 ? 'life' : 'lives'}. Pick a format and post it — every share recruits the next donor.
          </p>
        </div>
      </div>

      <div className="mt-5 grid md:grid-cols-[1fr_minmax(0,320px)] gap-6 items-start">
        {/* Controls */}
        <div className="order-2 md:order-1">
          {/* Format */}
          <div className="text-[10px] uppercase tracking-[0.15em] text-marrow-700/70">Format</div>
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

          {/* Background */}
          <div className="mt-4 text-[10px] uppercase tracking-[0.15em] text-marrow-700/70">Background</div>
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

          {/* Actions */}
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
              className="flex-1 px-5 py-3 rounded-full bg-marrow-600 hover:bg-marrow-700 text-white font-semibold transition-colors disabled:opacity-60"
            >
              {busy ? 'Working…' : 'Share'}
            </button>
            <button
              onClick={() => downloadPlacard(data, { format, transparent })}
              className="px-5 py-3 rounded-full bg-marrow-50 ring-1 ring-marrow-200/60 text-marrow-900 font-semibold hover:bg-marrow-100 transition-colors"
            >
              Download
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="order-1 md:order-2">
          <div
            className={clsx(
              'mx-auto w-full max-w-[280px] rounded-2xl overflow-hidden ring-1 ring-marrow-200/60',
              activeRatio,
              transparent && 'bg-[conic-gradient(#eee_90deg,#fff_90deg_180deg,#eee_180deg_270deg,#fff_270deg)] bg-[length:24px_24px]'
            )}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Impact card preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-marrow-900/30 text-sm">Rendering…</div>
            )}
          </div>
          {transparent && (
            <p className="mt-2 text-center text-[11px] text-marrow-900/50">
              Transparent PNG — drop it over your own photo
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
