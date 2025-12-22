import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Canvas } from './Canvas';
import ElementsNew from './ElementsNew';
import { AssetPanel } from '../components/assets';
import { getProject } from '../api/client';
import './ProjectLayout.css';

type TabType = 'canvas' | 'assets' | 'elements';

export const ProjectLayout: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabType>('canvas');

  // Load project details
  useEffect(() => {
    if (projectId) {
      getProject(projectId).then(setProject).catch(console.error);
    }
  }, [projectId]);

  // Determine active tab from URL hash
  useEffect(() => {
    const hash = location.hash.replace('#', '') as TabType;
    if (hash && ['canvas', 'assets', 'elements'].includes(hash)) {
      setActiveTab(hash);
    }
  }, [location.hash]);

  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    navigate(`#${tab}`, { replace: true });
  };

  if (!project) {
    return (
      <div className="project-layout loading">
        <div className="spinner"></div>
        <p>Loading project...</p>
      </div>
    );
  }

  return (
    <div className="project-layout">
      <header className="project-header">
        <div className="project-title">
          <button className="back-btn" onClick={() => navigate('/')}>
            ← Back
          </button>
          <h1>{project.name}</h1>
          <span className="phase-badge">{project.current_phase || 'BRIEF'}</span>
        </div>

        <nav className="project-tabs">
          <button
            className={`tab-btn ${activeTab === 'canvas' ? 'active' : ''}`}
            onClick={() => switchTab('canvas')}
          >
            🎬 Canvas
          </button>
          <button
            className={`tab-btn ${activeTab === 'assets' ? 'active' : ''}`}
            onClick={() => switchTab('assets')}
          >
            📦 Assets
          </button>
          <button
            className={`tab-btn ${activeTab === 'elements' ? 'active' : ''}`}
            onClick={() => switchTab('elements')}
          >
            ⚡ Elements
          </button>
        </nav>
      </header>

      <div className="project-content">
        {activeTab === 'canvas' && <Canvas />}
        {activeTab === 'assets' && (
          <div className="assets-tab-content">
            <AssetPanel projectId={projectId!} />
          </div>
        )}
        {activeTab === 'elements' && <ElementsNew />}
      </div>
    </div>
  );
};
