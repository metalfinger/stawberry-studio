import React from 'react';
import { Canvas } from './Canvas';
import './ProjectLayout.css';

/**
 * ProjectLayout - Unified Canvas View
 *
 * All tabs have been removed. The entire project is now displayed
 * on a single React Flow canvas with:
 * - Blueprint nodes (Brief → Scenes → Shots → Cuts) on the left
 * - Asset nodes (Characters, Locations, Props) on the right
 * - Floating chat for AI assistance
 */
export const ProjectLayout: React.FC = () => {
  // Canvas handles all loading and rendering now
  return (
    <div className="project-layout unified-canvas">
      <Canvas />
    </div>
  );
};
