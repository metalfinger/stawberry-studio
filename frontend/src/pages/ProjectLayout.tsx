import React from 'react';
import { useParams } from 'react-router-dom';
import { Canvas } from './Canvas';
import { PhaseRail } from '../components/PhaseRail';
import './ProjectLayout.css';

/**
 * ProjectLayout — phase rail on top, canvas below.
 *
 * The 4-phase pipeline (Brief → Story → Cast & Scout → Generate) lives in
 * the top rail. Consistency repair is no longer a standalone menu — it's
 * surfaced inline in chat as an ActionsBar when the project needs it.
 */
export const ProjectLayout: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className="project-layout unified-canvas">
      {projectId && (
        <div className="project-layout__topbar">
          <PhaseRail projectId={projectId} />
        </div>
      )}
      <Canvas />
    </div>
  );
};
