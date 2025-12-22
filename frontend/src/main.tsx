import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// Note: StrictMode disabled to prevent double WebSocket connections in dev
createRoot(document.getElementById('root')!).render(<App />)
