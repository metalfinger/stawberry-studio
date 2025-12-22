import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProjects, createProject } from '../api/client'
import type { Project } from '../api/client'
import './ProjectList.css'

export function ProjectList() {
    const navigate = useNavigate()
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [newName, setNewName] = useState('')

    useEffect(() => {
        loadProjects()
    }, [])

    async function loadProjects() {
        try {
            const data = await getProjects()
            setProjects(data)
        } catch (err) {
            console.error('Failed to load projects:', err)
        } finally {
            setLoading(false)
        }
    }

    async function handleCreate() {
        if (!newName.trim()) return
        try {
            const project = await createProject(newName)
            setShowModal(false)
            setNewName('')
            navigate(`/project/${project.id}`)
        } catch (err) {
            console.error('Failed to create project:', err)
        }
    }

    function formatDate(isoString: string) {
        return new Date(isoString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <div className="project-list-page">
            <header className="app-header">
                <h1>🍓 Strawberry Studio</h1>
                <p className="subtitle">AI-Powered Video Production</p>
            </header>

            <div className="projects-container">
                <div className="projects-header">
                    <h2>Your Projects</h2>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        + New Project
                    </button>
                </div>

                {loading ? (
                    <div className="loading">Loading...</div>
                ) : projects.length === 0 ? (
                    <div className="empty-state">
                        <p>No projects yet. Create your first one!</p>
                    </div>
                ) : (
                    <div className="projects-list">
                        {projects.map((project) => (
                            <div
                                key={project.id}
                                className="project-card"
                                onClick={() => navigate(`/project/${project.id}`)}
                            >
                                <h3>{project.name}</h3>
                                <div className="meta">
                                    <span className="phase-badge">{project.current_phase}</span>
                                    <span>Updated: {formatDate(project.updated_at)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showModal && (
                <div className="modal" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Create New Project</h3>
                        <input
                            type="text"
                            placeholder="Project Name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
                            autoFocus
                        />
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleCreate}>
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
