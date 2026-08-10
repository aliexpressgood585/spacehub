import * as Sentry from './lib/sentry'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ColorManagement } from 'three'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// Our 3D scenes hand-pick hex colours that were tuned before three r152 turned
// colour management on by default. Leaving it on re-interprets those literals
// as sRGB and visibly dulls every scene, so keep the legacy handling the art
// was authored against.
ColorManagement.enabled = false

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
