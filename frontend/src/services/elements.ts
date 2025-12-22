/**
 * Element Generation API Service
 */

const API_BASE = '/api';

export interface ElementMaster {
  id: string;
  asset_id: string;
  element_type: 'character' | 'location' | 'prop';
  master_image_url: string | null;
  master_prompt: string | null;
  master_generation_params: string | null;
  background_type: string;
  view_type: string;
  resolution: string;
  aspect_ratio: string;
  status: 'pending' | 'generating' | 'complete' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ElementVariant {
  id: string;
  master_id: string;
  variant_type: string;
  variant_description: string;
  image_url: string | null;
  prompt: string | null;
  generation_method: 'text_to_image' | 'image_to_image';
  reference_image_id: string | null;
  generation_params: string | null;
  status: 'pending' | 'generating' | 'complete' | 'failed';
  error_message: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ElementSummary {
  has_master: boolean;
  master: ElementMaster | null;
  variants: ElementVariant[];
  variant_count: number;
  variant_types: string[];
}

export interface GenerateMasterRequest {
  asset_id: string;
  prompt?: string;
  auto_generate?: boolean;
  model?: string;
  resolution?: string;
  params?: Record<string, any>;
}

export interface GenerateVariantRequest {
  master_id: string;
  variant_type: string;
  method?: 'text_to_image' | 'image_to_image';
  custom_prompt?: string;
  model?: string;
  strength?: number;
}

export interface CompiledPrompt {
  prompt: string;
  model: string;
  resolution: string;
  aspect_ratio: string;
  background: string;
}

/**
 * Get element summary for an asset
 */
export async function getAssetElementSummary(
  projectId: string,
  assetId: string
): Promise<ElementSummary> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/assets/${assetId}/summary`
  );
  if (!res.ok) throw new Error('Failed to get element summary');
  return res.json();
}

/**
 * Get compiled prompt for generating master (preview without generating)
 */
export async function getCompiledMasterPrompt(
  projectId: string,
  assetId: string
): Promise<CompiledPrompt> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/assets/${assetId}/prompt`
  );
  if (!res.ok) throw new Error('Failed to get compiled prompt');
  return res.json();
}

/**
 * Generate master image for an asset
 */
export async function generateElementMaster(
  projectId: string,
  request: GenerateMasterRequest
): Promise<{ success: boolean; master_id: string; master: ElementMaster }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/masters`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }
  );
  if (!res.ok) throw new Error('Failed to generate master');
  return res.json();
}

/**
 * Get master details with all variants
 */
export async function getElementMaster(
  projectId: string,
  masterId: string
): Promise<{ master: ElementMaster; variants: ElementVariant[]; variant_count: number }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/masters/${masterId}`
  );
  if (!res.ok) throw new Error('Failed to get master details');
  return res.json();
}

/**
 * Generate a single variant
 */
export async function generateElementVariant(
  projectId: string,
  request: GenerateVariantRequest
): Promise<{ success: boolean; variant_id: string; variant: ElementVariant }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/variants`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }
  );
  if (!res.ok) throw new Error('Failed to generate variant');
  return res.json();
}

/**
 * Generate multiple variants at once
 */
export async function generateElementVariantsBatch(
  projectId: string,
  masterId: string,
  variantTypes?: string[]
): Promise<{ success: boolean; variant_ids: string[]; count: number }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/variants/batch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        master_id: masterId,
        variant_types: variantTypes,
      }),
    }
  );
  if (!res.ok) throw new Error('Failed to generate variants batch');
  return res.json();
}

/**
 * Get compiled prompt for a variant (preview)
 */
export async function getCompiledVariantPrompt(
  projectId: string,
  masterId: string,
  variantType: string
): Promise<{ prompt: string; method: string; strength: number; model: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/masters/${masterId}/variants/${variantType}/prompt`
  );
  if (!res.ok) throw new Error('Failed to get variant prompt');
  return res.json();
}

/**
 * Delete a master (and all its variants)
 */
export async function deleteElementMaster(
  projectId: string,
  masterId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/masters/${masterId}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error('Failed to delete master');
}

/**
 * Delete a variant
 */
export async function deleteElementVariant(
  projectId: string,
  variantId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/variants/${variantId}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error('Failed to delete variant');
}

/**
 * Get generation history
 */
export async function getGenerationHistory(
  projectId: string,
  targetType?: string,
  limit: number = 50
): Promise<any[]> {
  const params = new URLSearchParams();
  if (targetType) params.append('target_type', targetType);
  params.append('limit', limit.toString());

  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/history?${params}`
  );
  if (!res.ok) throw new Error('Failed to get generation history');
  return res.json();
}

// ============================================================================
// GENERATION QUEUE API
// ============================================================================

/**
 * Queue a master generation request
 */
export async function queueMasterGeneration(
  projectId: string,
  data: {
    asset_id: string;
    prompt?: string;
    model?: string;
    resolution?: string;
    params?: any;
  }
): Promise<{ success: boolean; request_id: string; status: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/generate/master`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }
  );
  if (!res.ok) throw new Error('Failed to queue master generation');
  return res.json();
}

/**
 * Get generation request status
 */
export async function getGenerationRequestStatus(
  projectId: string,
  requestId: string
): Promise<any> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/requests/${requestId}`
  );
  if (!res.ok) throw new Error('Failed to get generation status');
  return res.json();
}

/**
 * List generation requests with filters
 */
export async function listGenerationRequests(
  projectId: string,
  status?: string,
  targetAssetId?: string,
  limit: number = 50
): Promise<any[]> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (targetAssetId) params.append('target_asset_id', targetAssetId);
  params.append('limit', limit.toString());

  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/requests?${params}`
  );
  if (!res.ok) throw new Error('Failed to list generation requests');
  return res.json();
}

/**
 * Cancel a generation request
 */
export async function cancelGenerationRequest(
  projectId: string,
  requestId: string
): Promise<{ success: boolean; cancelled: boolean }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/requests/${requestId}/cancel`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error('Failed to cancel generation');
  return res.json();
}

/**
 * Save a completed generation to a slot
 */
export async function saveGenerationToSlot(
  projectId: string,
  requestId: string,
  makeActive: boolean = false
): Promise<any> {
  const params = new URLSearchParams();
  if (makeActive) params.append('make_active', 'true');

  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/requests/${requestId}/save-to-slot?${params}`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error('Failed to save to slot');
  return res.json();
}

/**
 * Get the active master for an asset
 */
export async function getActiveMasterForAsset(
  projectId: string,
  assetId: string
): Promise<{ active_master: any | null; active_generation_id: string | null }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/elements/assets/${assetId}/active-master`
  );
  if (!res.ok) throw new Error('Failed to get active master');
  return res.json();
}
