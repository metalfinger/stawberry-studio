export const API_BASE = 'http://localhost:8000';

export interface CutGenerationResult {
  success: boolean;
  image_url: string;
  request_id: string;
}

export interface GenerationRequest {
  id: string;
  project_id: string;
  target_type: string;
  target_cut_id: string;
  prompt: string;
  status: string;
  output_image_url?: string;
  created_at: string;
}

/**
 * Trigger generation for a specific cut
 */
export async function generateCutImage(
  projectId: string, 
  cutId: string
): Promise<CutGenerationResult> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/cuts/${cutId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}) // Default model, etc.
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to generate cut image');
  }
  
  return res.json();
}

/**
 * Get generation history for a cut
 */
export async function getCutHistory(
  projectId: string, 
  cutId: string
): Promise<GenerationRequest[]> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/cuts/${cutId}/history`);
  if (!res.ok) throw new Error('Failed to fetch history');
  return res.json();
}

/**
 * Set a specific generation as the Active Image for the cut
 */
export async function setActiveCutImage(
  projectId: string, 
  cutId: string, 
  generationId: string
): Promise<{ success: boolean; active_url: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/cuts/${cutId}/active`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generation_id: generationId })
  });
  
  if (!res.ok) throw new Error('Failed to set active image');
  return res.json();
}
