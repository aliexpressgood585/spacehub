// Standalone page: the bot's house in 3D (house3d.html). Display only — see Orbital.tsx.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Orbital from './components/Orbital'

createRoot(document.getElementById('root')!).render(<StrictMode><Orbital /></StrictMode>)
