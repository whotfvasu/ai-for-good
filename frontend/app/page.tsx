import Link from 'next/link'
import { SplineHero } from '@/components/SplineHero'

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Soft pink wash, edge-to-edge */}
      <div className="absolute inset-0 -z-10 bg-fade-paper" />
      <div className="absolute inset-0 -z-10 grain" />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-12 pb-24 lg:pt-20 lg:pb-32 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div className="animate-fade-up">
          <span className="pill bg-marrow-100 text-marrow-700 ring-1 ring-marrow-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-marrow-600 animate-pulse" />
            AI for Good · 2026
          </span>

          <h1 className="mt-6 text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tightest leading-[0.95] text-marrow-900">
            Predictive blood.<br />
            <span className="text-marrow-600">Planned care.</span>
          </h1>

          <p className="mt-6 text-lg lg:text-xl text-marrow-900/70 leading-relaxed max-w-xl">
            Marrow turns reactive blood SOS into a planned supply chain. It reassures families before they have to ask,
            remembers refusals, and turns the 90 silent days after a donation into a relationship.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-marrow-600 hover:bg-marrow-700 text-white font-semibold shadow-glow transition-all"
            >
              Sign in to Marrow
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white hover:bg-marrow-50 text-marrow-900 font-semibold ring-1 ring-marrow-200/70 transition-all"
            >
              Explore the three roles
            </Link>
          </div>

          <dl className="mt-14 grid grid-cols-3 gap-6 max-w-md">
            <Stat kpi="1L+" label="Thalassemia patients in India" />
            <Stat kpi="500-700" label="Lifetime transfusions" />
            <Stat kpi="14 days" label="Forecast horizon" />
          </dl>
        </div>

        {/* Spline */}
        <div className="relative h-[420px] lg:h-[560px] rounded-5xl overflow-hidden ring-marrow shadow-glow bg-white/50">
          <SplineHero />
        </div>
      </section>

      {/* Three-up: the value cards */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tightest text-marrow-900 max-w-2xl">
          Three invisible humans, finally on screen.
        </h2>
        <p className="mt-3 text-marrow-900/60 max-w-2xl">
          Every other system optimises for the donor. We noticed the people standing behind them.
        </p>

        <div className="mt-10 grid md:grid-cols-3 gap-5">
          <ValueCard
            tag="Patient"
            href="/login"
            title="Your bridge, always ready"
            body="A dedicated pool of donors rotates to sustain you. See your next tentative date before you have to ask."
          />
          <ValueCard
            tag="Coordinator"
            href="/login"
            title="Handle exceptions, not everything"
            body="The bridge runs itself. You only see the cycles that actually need a human. Country-scale by design."
            highlighted
          />
          <ValueCard
            tag="Donor"
            href="/login"
            title="Refusal is information"
            body="Every “no” captures a reason. We come back when fever is gone, never sooner. Trust, renewed."
          />
        </div>
      </section>
    </div>
  )
}

function Stat({ kpi, label }: { kpi: string; label: string }) {
  return (
    <div>
      <dt className="text-2xl md:text-3xl font-extrabold text-marrow-900 tracking-tightest">{kpi}</dt>
      <dd className="mt-1 text-xs text-marrow-900/60 leading-snug">{label}</dd>
    </div>
  )
}

function ValueCard({
  tag,
  href,
  title,
  body,
  highlighted,
}: {
  tag: string
  href: string
  title: string
  body: string
  highlighted?: boolean
}) {
  return (
    <Link
      href={href}
      className={`group relative block p-7 rounded-4xl transition-all duration-300 ${
        highlighted
          ? 'bg-marrow-900 text-marrow-50 shadow-glow hover:-translate-y-1'
          : 'bg-white ring-1 ring-marrow-200/60 hover:ring-marrow-300 hover:-translate-y-1 hover:shadow-soft'
      }`}
    >
      <span
        className={`pill ${
          highlighted ? 'bg-marrow-700 text-marrow-100' : 'bg-marrow-100 text-marrow-700'
        }`}
      >
        {tag}
      </span>
      <h3
        className={`mt-6 text-xl font-bold tracking-tightest ${
          highlighted ? 'text-marrow-50' : 'text-marrow-900'
        }`}
      >
        {title}
      </h3>
      <p className={`mt-3 text-sm leading-relaxed ${highlighted ? 'text-marrow-100/80' : 'text-marrow-900/60'}`}>
        {body}
      </p>
      <span
        className={`mt-6 inline-flex items-center gap-1 text-sm font-semibold ${
          highlighted ? 'text-marrow-200' : 'text-marrow-700'
        }`}
      >
        Explore <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
      </span>
    </Link>
  )
}
