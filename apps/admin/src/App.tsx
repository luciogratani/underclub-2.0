import type { ReactElement } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Home from './pages/Home'
import EventsList from './pages/EventsList'
import Placeholder from './pages/Placeholder'
import CheckIn from './pages/CheckIn'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './lib/auth'

const protect = (el: ReactElement) => <ProtectedRoute>{el}</ProtectedRoute>

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: protect(<Home />) },
  { path: '/events', element: protect(<EventsList />) },
  { path: '/events/new', element: protect(<Placeholder />) },
  { path: '/reservations', element: protect(<Placeholder />) },
  { path: '/check-in', element: protect(<CheckIn />) },
  { path: '/guest-list', element: protect(<Placeholder />) },
  { path: '/archive', element: protect(<Placeholder />) },
  { path: '/analytics', element: protect(<Placeholder />) },
])

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

export default App
