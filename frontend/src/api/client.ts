// API client for Strawberry Studio backend.
//
// NOTE: Canonical Pydantic-generated types live in ./generated.ts (regenerate
// with `make types`). The legacy inline interfaces below are kept until the
// frontend migrates to the generated types in Phase 6.

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
  phase?: string;
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

// (getBrief removed — no callers. Brief data flows through chat history
//  + the bible compile path now, not a separate REST fetch.)

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

// WebSocket connection for chat - V1 collaborative agents
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
  suggested_prompt?: string;
  consistency_tokens?: string;
  distinctive_features?: string;
  wardrobe_lock?: string;
  created_at?: string;
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

// (getNodeAssets removed — zero callers. Frontend reads node-asset
//  links via getBlueprint(includeAssets=true) instead.)

// Compiled Prompt types (Nano Banana Pro format)
// (Legacy CompiledPrompt / CutGenerationRequest / ComposeStepEvent /
//  composeCut / streamComposeCut / getCutPrompt / getCutHistory /
//  setActiveCutImage / generateCutImage / swapCutAssetLink were removed
//  with the NodeProperties inspector — modern flow goes through chat
//  PlanCard via propose_cut_plan / execute_cut_plan intents.)

// References — references-first asset model

export interface AssetReference {
  id: string;
  asset_id: string;
  label: string;                 // "identity" | "side_right" | "expression_sad" | ...
  image_url: string;
  parent_reference_id: string | null;
  status: 'pending' | 'complete' | 'failed';
  scope: 'project' | 'scene' | 'cut';
  scope_id: string | null;
  created_at: string;
}

export async function listAssetReferences(projectId: string, assetId: string): Promise<{ references: AssetReference[] }> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets/${assetId}/references`);
  if (!res.ok) throw new Error('Failed to fetch references');
  return res.json();
}

export async function generateAssetIdentity(projectId: string, assetId: string): Promise<AssetReference> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets/${assetId}/references/identity`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Identity generation failed');
  }
  return res.json();
}

export async function regenerateAssetIdentity(projectId: string, assetId: string): Promise<AssetReference> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets/${assetId}/references/identity/regenerate`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Identity regeneration failed');
  }
  return res.json();
}

export async function updateAssetPrompt(projectId: string, assetId: string, prompt: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets/${assetId}/prompt`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Save failed');
  }
  return res.json();
}

export async function precacheAssetTurnaround(projectId: string, assetId: string): Promise<{ references: AssetReference[] }> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets/${assetId}/references/precache`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Precache failed');
  }
  return res.json();
}

// (Legacy ElementSheet / getAssetSheet / generateAssetSheet removed —
//  the references-first model uses /assets/{id}/references endpoints
//  exclusively. Old element_sheets table was dropped in migration 008.)

// (Legacy PreProductionStatus / getPreProductionRequirements /
//  updateCutSlots removed with NodeProperties — Iris is now invoked
//  internally via PREPROD_FILL plan items, not a frontend status panel.)

// ─── Library (reference_pool) ─────────────────────────────────────────────
export interface LibraryItem {
  ref_id: string;
  image_url: string;
  thumb_url: string;
  label: string;
  asset_id: string | null;
  scope: string;
  source_type: string;
  source_cut_id: string | null;
  is_active: boolean;
  is_anchor: boolean;
  is_style_anchor: boolean;
  is_favorite: boolean;
  superseded_by_id: string | null;
  prompt: string;
  cost_usd: number;
  model_used: string;
  used_in_cuts: string[];
  created_at: string;
  tags: Record<string, unknown>;
  aspect_ratio: string;
}

export interface LibraryStats {
  by_type: Record<string, { count: number; cost: number }>;
  total_count: number;
  total_cost_usd: number;
}

export interface LibraryFilters {
  asset_id?: string;
  source_type?: string;
  only_active?: boolean;
  favorites_only?: boolean;
  search?: string;
  limit?: number;
}

export async function getLibrary(projectId: string, filters: LibraryFilters = {}): Promise<{ items: LibraryItem[]; count: number }> {
  const qs = new URLSearchParams();
  if (filters.asset_id) qs.set('asset_id', filters.asset_id);
  if (filters.source_type) qs.set('source_type', filters.source_type);
  if (filters.only_active !== undefined) qs.set('only_active', String(filters.only_active));
  if (filters.favorites_only !== undefined) qs.set('favorites_only', String(filters.favorites_only));
  if (filters.search) qs.set('search', filters.search);
  if (filters.limit) qs.set('limit', String(filters.limit));
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/library?${qs.toString()}`);
  if (!res.ok) throw new Error('Failed to load library');
  return res.json();
}

export async function getLibraryStats(projectId: string): Promise<LibraryStats> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/library/stats`);
  if (!res.ok) throw new Error('Failed to load library stats');
  return res.json();
}

export async function favoriteReference(projectId: string, refId: string, favorite: boolean): Promise<void> {
  await fetch(`${API_BASE}/api/projects/${projectId}/library/${refId}/favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorite }),
  });
}

export async function setStyleAnchor(projectId: string, refId: string, anchor: boolean): Promise<void> {
  await fetch(`${API_BASE}/api/projects/${projectId}/library/${refId}/style-anchor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anchor }),
  });
}

export async function restoreReference(projectId: string, refId: string): Promise<void> {
  await fetch(`${API_BASE}/api/projects/${projectId}/library/${refId}/restore`, { method: 'POST' });
}

export async function assignSlot(projectId: string, cutId: string, slotIndex: number, refId: string | null): Promise<any> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/library/slot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cut_id: cutId, slot_index: slotIndex, ref_id: refId }),
  });
  if (!res.ok) throw new Error('Failed to assign slot');
  return res.json();
}

export interface CostSummary {
  image_cost_usd: number;
  llm_cost_usd: number;
  total_cost_usd: number;
}

export async function getCostSummary(projectId: string): Promise<CostSummary> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/library/cost-summary`);
  if (!res.ok) throw new Error('Failed to load cost summary');
  return res.json();
}

export interface AssetDetail {
  id: string;
  name: string;
  type: string;
  description?: string;
  suggested_prompt?: string;
  appearance?: string;
  distinctive_features?: string;
  wardrobe_lock?: string;
  image_url?: string;
  parent_asset_id?: string | null;
}

export async function getAsset(projectId: string, assetId: string): Promise<AssetDetail> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets/${assetId}`);
  if (!res.ok) throw new Error('Failed to load asset');
  return res.json();
}

export async function getReferenceVersions(projectId: string, refId: string): Promise<{ versions: LibraryItem[] }> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/library/${refId}/versions`);
  if (!res.ok) throw new Error('Failed to load versions');
  return res.json();
}
