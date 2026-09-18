export interface ProductionNode {
  id: string; project_id: string; parent_id: string | null; kind: string; name: string;
  position: number; revision: number; notes: string; active_media_id: string | null;
  fields: Record<string, { op: string; value: unknown }>;
}
export interface Media {
  id: string; node_id: string; url: string; mime_type: string; label: string;
  metadata: { fake?: boolean; recipe_id?: string; model?: string }; sha256: string;
  review: Review;
}
export interface Review {
  revision: number; status: 'pending' | 'approved' | 'rejected'; stale?: boolean; complete?: boolean;
  depicted_assets: string[]; user_decision: string; created_at?: number;
  requirement_ids: string[];
}
export interface AssetRequirement {
  id: string; asset_id: string; kind: 'view' | 'state' | 'detail' | 'scale';
  label: string; instruction: string; priority: number; covered_by: string[];
}
export interface Readiness {
  ready: boolean; issues: { code: string; message: string; node_id?: string; field?: string }[];
}
interface Selection { media_id: string; review_revision: number; status: string; stale: boolean }
interface StateFact { asset_id: string; attribute: string; value: unknown; source_cut: string }
export interface ProductionContext {
  scope: { characters: string[]; location: string | null; props: string[] };
  assets: { id: string; name: string; kind: string; selection: Selection | null }[];
  readiness: Readiness;
  continuity: null | {
    sources: { node_id: string; name: string; selection: Selection | null }[];
    incoming: Record<string, StateFact[]>; outgoing: Record<string, StateFact[]>;
    conflicts: { field: string; candidates: StateFact[] }[];
  };
}
export interface Context {
  values: Record<string, unknown>; cleared: string[];
  provenance: Record<string, { node_id: string; revision: number; op: string }>;
  ancestors: { id: string; name: string; kind: string; revision: number; notes: string }[];
  production: ProductionContext;
}
export interface Recipe {
  id: string; node_id: string; fingerprint: string; approved_at: number | null;
  fresh: boolean; stale_reason: string | null;
  spec: { provider: string; model: string; prompt: string; intent: string; settings: Record<string, unknown>;
    references: { media_id: string; role: string; instruction: string; subjects?: string[] }[];
    estimate?: { credits: number | null; unit: string; settings_only_credits?: number; reason?: string } };
  context: Context;
}
export interface Job {
  id: string; recipe_id: string; state: string; error: string | null;
  provider_id: string | null; created_at: number; updated_at: number;
}
export interface Runtime {
  checked_at: number;
  responsive: boolean; higgsfield_enabled: boolean; remote_cancellation: boolean;
  workers: { id: string; responsive: boolean; heartbeat_at: number; stopped_at: number | null; current_job: string | null; enabled_providers: string[] }[];
}
export interface JobDetail extends Job {
  events: { sequence: number; state: string; details: Record<string, unknown>; created_at: number }[];
}
export interface RecoveryPreview {
  provider_id: string; fingerprint: string; can_link: boolean; requires_reference_confirmation: boolean;
  checks: Record<string, boolean>; remote: { id: string; job_set_type: string; params: Record<string, unknown>; status: string };
}
export interface ProjectData {
  project: ProductionNode; nodes: ProductionNode[]; media: Media[]; recipes: Recipe[]; jobs: Job[];
}
export interface NodeDetail {
  node: ProductionNode; context: Context; media: Media[];
  sources: { id: string; node_id: string; node_name: string; author: string; status: string; text: string }[];
  revisions: { revision: number; reason: string; created_at: number }[];
  requirements: AssetRequirement[];
}
export interface MediaDetail {
  media: Media; recipe: Recipe | null;
  review_context: string;
  requirements: AssetRequirement[];
  feedback: { id: string; text: string; created_at: number }[];
  review_history: Review[];
}

export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api/studio${path}`, body === undefined ? undefined : {
    method, headers: { 'Content-Type': 'application/json', 'X-Strawberry-Action': '1' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.error ?? JSON.stringify(data.detail) ?? 'Request failed');
  return data as T;
}
