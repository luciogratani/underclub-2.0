import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { initBotId } from 'botid/client/core'
import App from './App.tsx'
import { captureBookingSource } from './lib/source'
import { SessionProvider } from './lib/session'
import './index.css'

// BotID (Vercel) patches the global fetch to attach its challenge to these
// requests: start it before anything fetches. Production only.
if (import.meta.env.PROD) {
  initBotId({
    protect: [
      { path: '/api/reservations', method: 'POST' },
      { path: '/api/auth/login-link', method: 'POST' },
    ],
  })
}

// First touch wins for the visit: read ?src= / ?utm_source= before routing.
captureBookingSource()

// Route-level code splitting: keeps the three/drei stack (pulled in by
// Ticket → Lanyard) out of the bundle served on "/".
const Info = lazy(() => import('./pages/Info.tsx'))
const PrivacyCookie = lazy(() => import('./pages/PrivacyCookie.tsx'))
const Ticket = lazy(() => import('./pages/Ticket.tsx'))
// Landing page of the passwordless email link.
const Activate = lazy(() => import('./pages/Activate.tsx'))
// Bookings of the logged-in contact / "recover booking" form.
const Account = lazy(() => import('./pages/Account.tsx'))
// Internal A/B bench for the lanyard physics — unlinked, not part of the funnel.
const LanyardLab = lazy(() => import('./pages/LanyardLab.tsx'))
// Previous Rapier-based lanyard, kept for reference; Rapier loads only here.
const LanyardRapierDemo = lazy(() => import('./pages/LanyardRapierDemo.tsx'))

const pageFallback = <div className="min-h-[100svh] w-full bg-black" />

const ticketFallback = (
  <section className="fixed inset-0 z-0 flex h-[100dvh] w-full items-center justify-center bg-primary">
    <p className="animate-pulse text-xl font-bold text-black">Loading ticket…</p>
  </section>
)

const activateFallback = <div className="min-h-[100svh] w-full bg-primary" />

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  {
    path: '/info',
    element: <Suspense fallback={pageFallback}><Info /></Suspense>,
  },
  {
    path: '/info/privacy-cookie',
    element: <Suspense fallback={pageFallback}><PrivacyCookie /></Suspense>,
  },
  {
    path: '/ticket/:id',
    element: <Suspense fallback={ticketFallback}><Ticket /></Suspense>,
  },
  {
    path: '/activate',
    element: <Suspense fallback={activateFallback}><Activate /></Suspense>,
  },
  {
    path: '/account',
    element: <Suspense fallback={activateFallback}><Account /></Suspense>,
  },
  {
    path: '/demo/lanyard',
    element: <Suspense fallback={ticketFallback}><LanyardLab /></Suspense>,
  },
  {
    path: '/lanyard-rapier',
    element: <Suspense fallback={ticketFallback}><LanyardRapierDemo /></Suspense>,
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
)
