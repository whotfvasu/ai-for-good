'use client'

import Spline from '@splinetool/react-spline'

const SCENE_URL = 'https://prod.spline.design/KMBqVSZHQnLx4FWc/scene.splinecode'

// Pure client component. We import Spline statically — webpack resolves it
// cleanly, treats the whole module as ESM. The dynamic boundary lives one
// level up (SplineHero.tsx) so this file is never bundled into the
// pre-rendered HTML on static export.
export default function SplineCanvas({ onLoad }: { onLoad?: () => void }) {
  return <Spline scene={SCENE_URL} onLoad={onLoad} />
}
