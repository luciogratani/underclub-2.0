import { Link } from 'react-router-dom'

function EventsList() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] p-4">
      <Link
        to="/"
        className="mb-4 inline-block text-sm text-[var(--color-primary)] hover:underline"
      >
        ← Home
      </Link>
      <h1 className="text-lg font-medium">Events</h1>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
        Coming soon
      </p>
    </div>
  )
}

export default EventsList
