import { Link, useLocation } from 'react-router-dom'

const TITLES: Record<string, string> = {
  '/reservations': 'Reservations',
  '/check-in': 'Check-in',
  '/guest-list': 'Guest list',
  '/archive': 'Archive',
  '/analytics': 'Analytics',
  '/events/new': 'Add event',
}

function Placeholder() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? pathname.slice(1).replace(/-/g, ' ')

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-4">
      <Link
        to="/"
        className="mb-4 inline-block text-sm text-[var(--color-primary)] hover:underline"
      >
        ← Home
      </Link>
      <h1 className="text-lg font-medium">{title || 'Page'}</h1>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
        Coming soon
      </p>
    </div>
  )
}

export default Placeholder
