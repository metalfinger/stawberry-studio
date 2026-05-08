import React from 'react';
import { useParams } from 'react-router-dom';
import { Canvas } from './Canvas';
import { PhaseRail } from '../components/PhaseRail';
import { RepairMenu } from '../components/RepairMenu';
import './ProjectLayout.css';

/**
 * ProjectLayout — phase rail on top, canvas below.
 *
 * The 6-phase pipeline (Develop → Animatic) is visible at all times via the
 * top rail. Canvas renders the blueprint + assets unified graph.
 */
export const ProjectLayout: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className="project-layout unified-canvas">
      {projectId && (
        <div className="project-layout__topbar">
          <PhaseRail projectId={projectId} />
          <RepairMenu projectId={projectId} />
        </div>
      )}
      <Canvas />
    </div>
  );
};
