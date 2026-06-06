'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

// Dynamic-import our own SplineCanvas.tsx file (not the npm package). Webpack
// happily handles a file path; the package resolution lives inside the canvas
// where it's a normal static import. ssr:false keeps the ~1-2MB scene out
// of static-export HTML and off the critical render path.
const SplineCanvas = dynamic(() => import('./SplineCanvas'), {
  ssr: false,
  loading: () => <HeroFallback />,
})

export function SplineHero() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative w-full h-full">
      {!loaded && (
        <div className="absolute inset-0 pointer-events-none">
          <HeroFallback />
        </div>
      )}
      <div className={`w-full h-full transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}>
        <SplineCanvas onLoad={() => setLoaded(true)} />
      </div>
    </div>
  )
}

function HeroFallback() {
  // Pulsing gradient blob — tiny, GPU-only, communicates "loading" without a spinner.
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="relative w-72 h-72 md:w-96 md:h-96">
        <div className="absolute inset-0 rounded-full bg-marrow-200/60 blur-3xl animate-pulse-slow" />
        <div className="absolute inset-8 rounded-full bg-gradient-to-br from-marrow-300 to-marrow-600 opacity-90 animate-pulse-slow" />
      </div>
    </div>
  )
}
