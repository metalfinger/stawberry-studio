import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProjectList } from './pages/ProjectList'
import { ProjectLayout } from './pages/ProjectLayout'
import { HoverPreviewLayer } from './components/dnd/HoverPreview'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/project/:projectId" element={<ProjectLayout />} />
      </Routes>
      <HoverPreviewLayer />
    </BrowserRouter>
  )
}

export default App
