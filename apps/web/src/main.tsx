import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.tsx'
import Info from './pages/Info.tsx'
import PrivacyCookie from './pages/PrivacyCookie.tsx'
import Ticket from './pages/Ticket.tsx'
import './index.css'

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/info', element: <Info /> },
  { path: '/info/privacy-cookie', element: <PrivacyCookie /> },
  { path: '/ticket/:id', element: <Ticket /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
