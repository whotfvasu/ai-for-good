import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Palette from the design reference.
        //   #BB2B29 — primary red       (CTAs, accents)
        //   #530404 — deep maroon       (text on light, depth shadows)
        //   #FFE8E8 — soft pink         (panels, backgrounds)
        //   #ECA0A0 — coral             (secondary, hover states)
        marrow: {
          50: '#FFF8F8',
          100: '#FFE8E8',
          200: '#FCD2D2',
          300: '#ECA0A0',
          400: '#DE6A68',
          500: '#CC4543',
          600: '#BB2B29', // primary
          700: '#931E1D',
          800: '#691210',
          900: '#530404', // deep
        },
        paper: '#FFFCFB',
        ink: '#1A0606',
      },
      fontFamily: {
        // Plus Jakarta Sans is a free, geometric grotesque — closest free
        // alternative to Lufga. Wired in via next/font in app/layout.tsx.
        sans: ['var(--font-display)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 10px 40px -10px rgba(83, 4, 4, 0.12)',
        glow: '0 0 0 1px rgba(187, 43, 41, 0.06), 0 20px 50px -20px rgba(187, 43, 41, 0.35)',
        inset: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
      },
      backgroundImage: {
        'fade-pink': 'linear-gradient(180deg, #FFF8F8 0%, #FFE8E8 100%)',
        'fade-paper': 'radial-gradient(120% 80% at 50% 0%, #FFF8F8 0%, #FFFCFB 60%, #FCD2D2 100%)',
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.5s ease-out both',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
