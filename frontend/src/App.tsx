import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { ProjectList } from './pages/ProjectList'
import { ProjectLayout } from './pages/ProjectLayout'
import { HoverPreviewLayer } from './components/dnd/HoverPreview'
import { ToastLayer } from './components/toast/Toast'
import { OnboardingTour } from './components/onboarding/OnboardingTour'
import './App.css'

const StudioWorkspace = lazy(() => import('./studio/StudioWorkspace'))

function ExistingWorkspace() {
  return <><Outlet /><HoverPreviewLayer /><ToastLayer /><OnboardingTour /></>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/studio" element={<Suspense fallback={<p>Loading workspace</p>}><StudioWorkspace /></Suspense>} />
        <Route path="/studio/:projectId" element={<Suspense fallback={<p>Loading workspace</p>}><StudioWorkspace /></Suspense>} />
        <Route element={<ExistingWorkspace />}>
        <Route path="/" element={<ProjectList />} />
        <Route path="/project/:projectId" element={<ProjectLayout />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
