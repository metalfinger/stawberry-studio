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

// Generation History types (matching generation_requests table)
export interface CutGenerationRequest {
  id: string;
  status: 'generating' | 'complete' | 'failed';
  prompt: string;
  output_image_url?: string;
  error_message?: string;
  created_at: string;
  model?: string;
}

export async function getCutHistory(projectId: string, cutId: string): Promise<CutGenerationRequest[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/cuts/${cutId}/history`);
  if (!res.ok) throw new Error('Failed to fetch cut history');
  return res.json();
}

export async function generateCutImage(projectId: string, cutId: string, promptOverride?: string): Promise<{ success: boolean; image_url: string; request_id: string }> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/cuts/${cutId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt_override: promptOverride })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to generate image');
  }
  return res.json();
}

export interface ComposeStepEvent {
  type: 'compose_step' | 'compose_done' | 'compose_error';
  step?: 'bundle' | 'pick' | 'preprod' | 'prompt' | 'render' | 'critic' | 'register';
  status?: 'start' | 'ok' | 'skip' | 'error';
  detail?: Record<string, unknown>;
  ts?: string;
  cut_id?: string;
  error?: string;
}

export async function composeCut(projectId: string, cutId: string): Promise<{
  cut_id: string;
  image_url: string | null;
  score: { face: number; wardrobe: number; lighting: number; props: number; overall: number; issues: string[]; suggestions: string[] } | null;
  attempts: number;
  steps: Array<{ step: string; status: string; detail: Record<string, unknown>; ts: string }>;
  error: string | null;
}> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/cuts/${cutId}/compose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Compose failed');
  }
  return res.json();
}

export function streamComposeCut(
  projectId: string,
  cutId: string,
  onEvent: (event: ComposeStepEvent) => void,
): WebSocket {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = API_BASE || `${proto}//${window.location.host}`;
  const url = (host.startsWith('http') ? host.replace(/^http/, 'ws') : host) +
    `/api/projects/${projectId}/cuts/${cutId}/compose/stream`;
  const ws = new WebSocket(url);
  ws.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch {
      /* ignore malformed */
    }
  };
  return ws;
}

export async function setActiveCutImage(projectId: string, cutId: string, generationId: string): Promise<{ success: boolean; active_url: string }> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/cuts/${cutId}/active`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generation_id: generationId })
  });
  if (!res.ok) throw new Error('Failed to set active image');
  return res.json();
}

export async function swapCutAssetLink(projectId: string, cutId: string, oldAssetId: string, newAssetId: string): Promise<{ success: boolean; level: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets/swap-input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cut_id: cutId, old_asset_id: oldAssetId, new_asset_id: newAssetId })
  });
  if (!res.ok) throw new Error('Failed to swap asset link');
  return res.json();
}

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

// Element Sheets — legacy (still used by old projects until commit 6 migration)

export interface ElementSheet {
  id: string;
  asset_id: string;
  sheet_type: string;
  template_id: string;
  image_url: string;
  aspect_ratio: string;
  panels: string[];
  layout: { grid: [number, number]; cells: Array<{ label: string; row: number; col: number; bbox: [number, number, number, number] }>; aspect_ratio: string };
  status: string;
  cost_usd: number;
  is_active: boolean;
  created_at: string;
}

export async function getAssetSheet(projectId: string, assetId: string): Promise<{ sheet: ElementSheet | null }> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets/${assetId}/sheet`);
  if (!res.ok) throw new Error('Failed to fetch sheet');
  return res.json();
}

export async function generateAssetSheet(
  projectId: string,
  assetId: string,
  options: { override_sheet_type?: string; seed?: number } = {},
): Promise<{
  sheet_id: string;
  image_url: string;
  template_id: string;
  sheet_type: string;
  panels: string[];
  layout: ElementSheet['layout'];
  cost_usd: number;
  rationale: string;
}> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets/${assetId}/sheet/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Sheet generation failed');
  }
  return res.json();
}

// Pre-Production Requirements
export interface PreProductionRequirement {
  type: 'character_master' | 'location_master' | 'expression_variant';
  name: string;
  asset_id: string;
  action: 'generate' | 'i2i_edit';
  base_reference?: string;
  details: Record<string, any>;
}

export interface ReadyReference {
  type: 'character' | 'location';
  name: string;
  asset_id: string;
  image_url: string;
  purpose: string;
}

export interface ContinuityOption {
  type: 'previous_cut';
  cut_id: string;
  image_url: string;
  action: string;
  use_for: string;
}

export interface PreProductionStatus {
  cut_id: string;
  cut_action: string;
  requirements: PreProductionRequirement[];
  ready_references: ReadyReference[];
  continuity_option: ContinuityOption | null;
  pre_production_needed: boolean;
}

export async function getPreProductionRequirements(projectId: string, cutId: string): Promise<PreProductionStatus> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/cuts/${cutId}/pre-production`);
  if (!res.ok) throw new Error('Failed to get pre-production requirements');
  return res.json();
}

export async function updateCutSlots(projectId: string, cutId: string, slots: Record<string, string>): Promise<any> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/cuts/${cutId}/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_slots: JSON.stringify(slots) })
    });
    if (!res.ok) throw new Error('Failed to update cut slots');
    return res.json();
}

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
