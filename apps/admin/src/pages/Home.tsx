import type React from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  Users,
  QrCode,
  List,
  Archive,
  BarChart3,
  Plus,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../lib/auth'

const ANALYTICS_MOCK = {
  nextEvent: 'TECHNOROOM: GIRLS POWER',
  nextDate: 'SAT MAR 07',
  reservations: 42,
  ticketsOpened: 38,
  qrScanned: 0,
}

const NAV_BLOCKS: Array<{
  title: string
  to: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  highlight?: boolean
}> = [
  { title: 'Events', to: '/events', desc: 'Manage events', icon: Calendar },
  {
    title: 'Reservations',
    to: '/reservations',
    desc: 'Bookings status',
    icon: Users,
  },
  { title: 'Check-in', to: '/check-in', desc: 'QR scanner', icon: QrCode },
  { title: 'Guest list', to: '/guest-list', desc: 'A–Z names', icon: List },
  { title: 'Archive', to: '/archive', desc: 'Past events', icon: Archive },
  { title: 'Analytics', to: '/analytics', desc: 'Stats & charts', icon: BarChart3 },
  {
    title: 'Add event',
    to: '/events/new',
    desc: 'Quick create',
    icon: Plus,
    highlight: true,
  },
]

function NavBlock({
  title,
  to,
  desc,
  icon: Icon,
  highlight,
}: {
  title: string
  to: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  highlight?: boolean
}) {
  return (
    <Link
      to={to}
      className={`group relative flex flex-col gap-2 overflow-hidden rounded-xl border p-5 transition-all duration-200 ease-out
        ${highlight
          ? 'border-primary/50 bg-primary/5 hover:border-primary hover:bg-primary/10'
          : 'border-border/80 bg-card/50 hover:border-primary/40 hover:bg-muted/50'
        }`}
    >
      <div
        className={`flex items-center gap-2.5 ${highlight ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`}
      >
        <Icon className="size-4 shrink-0 transition-colors" />
        <span className="text-sm font-semibold tracking-tight">{title}</span>
      </div>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </Link>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}) {
  const isNumeric = typeof value === 'number'
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-black/20 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={`tabular-nums tracking-tight ${accent ? 'text-primary' : 'text-foreground'} ${isNumeric ? 'text-xl font-semibold' : 'text-sm font-medium leading-tight'}`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  )
}

export default function Home() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-background font-mono">
      {/* Subtle gradient overlay for depth */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(186,236,23,0.06),transparent)]" />

      <div className="relative px-5 pb-10 pt-5">
        {/* Session header */}
        <header className="mb-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate">
            Signed in as{' '}
            <span className="text-foreground">{user?.email ?? '—'}</span>
          </span>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1.5 text-[11px] transition-colors hover:border-primary/40 hover:text-primary"
          >
            <LogOut className="size-3.5" />
            Logout
          </button>
        </header>

        {/* Analytics block */}
        <section className="mb-8 overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Quick stats
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Next event"
              value={ANALYTICS_MOCK.nextEvent}
              sub={ANALYTICS_MOCK.nextDate}
            />
            <StatCard
              label="Reservations"
              value={ANALYTICS_MOCK.reservations}
              accent
            />
            <StatCard
              label="Tickets opened"
              value={ANALYTICS_MOCK.ticketsOpened}
            />
            <StatCard label="QR scanned" value={ANALYTICS_MOCK.qrScanned} />
          </div>
        </section>

        {/* Nav grid */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4">
          {NAV_BLOCKS.map((block) => (
            <NavBlock
              key={block.to}
              title={block.title}
              to={block.to}
              desc={block.desc}
              icon={block.icon}
              highlight={block.highlight}
            />
          ))}
        </section>
      </div>
    </div>
  )
}
