import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProjectList } from './pages/ProjectList'
import { ProjectLayout } from './pages/ProjectLayout'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/project/:projectId" element={<ProjectLayout />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
