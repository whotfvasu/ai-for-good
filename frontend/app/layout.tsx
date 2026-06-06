import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/Navbar'

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
    <html lang="en">
      <body className="min-h-screen font-sans antialiased bg-paper">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  )
}
