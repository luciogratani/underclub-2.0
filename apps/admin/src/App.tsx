import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Home from './pages/Home'
import EventsList from './pages/EventsList'
import Placeholder from './pages/Placeholder'

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/events', element: <EventsList /> },
  { path: '/events/new', element: <Placeholder /> },
  { path: '/reservations', element: <Placeholder /> },
  { path: '/check-in', element: <Placeholder /> },
  { path: '/guest-list', element: <Placeholder /> },
  { path: '/archive', element: <Placeholder /> },
  { path: '/analytics', element: <Placeholder /> },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
