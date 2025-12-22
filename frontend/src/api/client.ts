// API client for Strawberry Studio backend

const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:8000';

export interface Project {
  id: string;
  name: string;
  current_phase: string;
  created_at: string;
  updated_at: string;
}

export interface Brief {
  project_id: string;
  title: string;
  logline: string;
  genre: string;
  aesthetic_tags: string[];
  artist_refs: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  agent_name?: string;
  timestamp?: string;
}

// Projects API
export async function getProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function createProject(name: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
}

export async function getProject(projectId: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}`);
  if (!res.ok) throw new Error('Failed to fetch project');
  return res.json();
}

export async function getBrief(projectId: string): Promise<Brief> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/brief`);
  if (!res.ok) throw new Error('Failed to fetch brief');
  return res.json();
}

// Blueprint types
export interface Scene {
  id: string;
  project_id: string;
  scene_number: number;
  title: string;
  description: string;
  location: string;
  time_of_day: string;
  lighting: string;
  mood: string;
}

export interface Shot {
  id: string;
  scene_id: string;
  shot_number: number;
  description: string;
  camera_angle: string;
  camera_movement: string;
  subject: string;
  composition: string;
}

export interface Cut {
  id: string;
  shot_id: string;
  cut_number: number;
  action: string;
  dialogue: string;
  beat_type: string;
  transition: string;
}

export interface Blueprint {
  project_id: string;
  brief?: {
    title: string;
    logline: string;
    genre: string;
  };
  scenes: (Scene & { shots: (Shot & { cuts: Cut[] })[] })[];
}

export async function getBlueprint(projectId: string, includeAssets = false): Promise<Blueprint> {
  const url = `${API_BASE}/api/projects/${projectId}/blueprint${includeAssets ? '?include_assets=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch blueprint');
  return res.json();
}

// WebSocket connection for chat - always connect to backend directly
export function createChatConnection(projectId: string, phase?: string): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // In dev, Vite runs on 5173 but backend is on 8000
  const host = 'localhost:8000';
  const url = `${protocol}//${host}/api/projects/${projectId}/chat${phase ? `?phase=${phase}` : ''}`;
  return new WebSocket(url);
}

// Asset types
export interface Asset {
  id: string;
  project_id: string;
  type: 'character' | 'location' | 'prop' | 'frame';
  name: string;
  description?: string;
  appearance?: string;
  style?: string;
  master_id?: string;
  variant_diff?: string;
  slot_filled: boolean;
  image_url?: string;
  variants?: Asset[];
  linked_nodes?: AssetLink[];
}

export interface AssetLink {
  id: string;
  asset_id: string;
  node_type: 'scene' | 'shot' | 'cut';
  node_id: string;
  usage: 'primary' | 'background' | 'mentioned';
  variant_notes?: string;
}

export interface AssetsResponse {
  characters: Asset[];
  locations: Asset[];
  props: Asset[];
  frames: Asset[];
}

export async function getAssets(projectId: string): Promise<AssetsResponse> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets`);
  if (!res.ok) throw new Error('Failed to fetch assets');
  return res.json();
}

export async function getNodeAssets(projectId: string, nodeType: string, nodeId: string): Promise<{ assets: Asset[], count: number }> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/node/${nodeType}/${nodeId}/assets`);
  if (!res.ok) throw new Error('Failed to fetch node assets');
  return res.json();
}

// Compiled Prompt types (Nano Banana Pro format)
export interface ReferenceImage {
  slot: number;
  ref: string;  // e.g., "@Image1"
  type: 'character' | 'location' | 'prop';
  name: string;
  asset_id: string;
  image_url: string | null;
  status: 'ready' | 'pending';
}

export interface CompiledPrompt {
  prompt: string;
  reference_images: ReferenceImage[];
  mode: string;
  cut_id: string;
  scene_number?: number;
  shot_number?: number;
  cut_number?: number;
  assets_used: {
    characters: string[];
    locations: string[];
    props: string[];
  };
}

export async function getCutPrompt(projectId: string, cutId: string): Promise<CompiledPrompt> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/cuts/${cutId}/prompt`);
  if (!res.ok) throw new Error('Failed to fetch cut prompt');
  return res.json();
}

// Generation History types
export interface GenerationStep {
  id: string;
  step_number: number;
  stage: 'pre_production' | 'final';
  prompt: string;
  reference_images: string; // JSON string
  output_image_url?: string;
  saved_as_asset_id?: string;
  created_at: string;
}

export async function getCutHistory(projectId: string, cutId: string): Promise<GenerationStep[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/cuts/${cutId}/history`);
  if (!res.ok) throw new Error('Failed to fetch cut history');
  return res.json();
}
