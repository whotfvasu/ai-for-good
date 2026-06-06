import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'

// next/font self-hosts the woff2 subset at build time. Zero external font
// requests at runtime, no FOUT, no privacy concerns. Plus Jakarta Sans is the
// closest free analogue to Lufga's geometric grotesque.
const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Marrow — The Living Blood Network',
  description:
    'Predictive, memory-aware AI for thalassemia care coordination. Reassure families before they ask. Reach donors as people, not records.',
  metadataBase: new URL('https://vasu.d3c96kkpfabejg.amplifyapp.com'),
  openGraph: {
    title: 'Marrow — The Living Blood Network',
    description: 'Reactive blood SOS, turned into predictive supply.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body className="min-h-screen font-sans antialiased bg-paper">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  )
}
