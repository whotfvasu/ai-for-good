/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export — Amplify hosts the `out/` directory as plain HTML+JS+CSS.
  // No SSR runtime billed. CDN-only. Same scale curve from 1 to 1M visitors.
  output: 'export',

  // next/image's optimizer needs a server. Static export has none — disable.
  // We use <img> and inline SVG throughout; nothing to optimize at runtime.
  images: { unoptimized: true },

  reactStrictMode: true,

  // react-spline v4 ships ESM only; Next 14's webpack needs an explicit
  // transpile hint to resolve its package exports field correctly.
  transpilePackages: ['@splinetool/react-spline', '@splinetool/runtime'],
}

export default nextConfig
