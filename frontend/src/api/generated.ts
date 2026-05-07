/* tslint:disable */
/* eslint-disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

export interface APIError {
  error: string;
  detail?: string | null;
  code?: string | null;
  context?: {
    [k: string]: unknown;
  } | null;
}
export interface Asset {
  id: string;
  project_id: string;
  type: string;
  name: string;
  description?: string | null;
  appearance?: string | null;
  style?: string | null;
  metadata?: string | null;
  master_id?: string | null;
  variant_diff?: string | null;
  slot_filled?: number;
  image_url?: string | null;
  consistency_tokens?: string;
  distinctive_features?: string;
  wardrobe_lock?: string;
  suggested_prompt?: string;
  source_type?: string;
  source_cut_id?: string | null;
  generation_chain?: string;
  face_embedding_url?: string | null;
  created_at?: string | null;
}
export interface AssetLink {
  id: string;
  asset_id: string;
  node_type: string;
  node_id: string;
  usage?: string;
  variant_notes?: string | null;
}
/**
 * Master asset with embedded variants and linked nodes for the assets endpoint.
 */
export interface AssetMaster {
  id: string;
  project_id: string;
  type: string;
  name: string;
  description?: string | null;
  appearance?: string | null;
  style?: string | null;
  metadata?: string | null;
  master_id?: string | null;
  variant_diff?: string | null;
  slot_filled?: number;
  image_url?: string | null;
  consistency_tokens?: string;
  distinctive_features?: string;
  wardrobe_lock?: string;
  suggested_prompt?: string;
  source_type?: string;
  source_cut_id?: string | null;
  generation_chain?: string;
  face_embedding_url?: string | null;
  created_at?: string | null;
  variants?: Asset[];
  linked_nodes?: AssetLink[];
}
export interface AssetsResponse {
  characters?: AssetMaster[];
  locations?: AssetMaster[];
  props?: AssetMaster[];
  frames?: AssetMaster[];
}
export interface Blueprint {
  project_id: string;
  brief?: Brief | null;
  scenes?: SceneWithShots[];
}
export interface Brief {
  project_id: string;
  title?: string;
  logline?: string;
  genre?: string;
  tone?: string;
  target_audience?: string;
  key_themes?: string;
  art_style?: string;
  color_palette?: string;
  aspect_ratio?: string;
  render_quality?: string;
  lighting_style?: string;
  world_logic?: string;
  era_setting?: string;
  reference_films?: string;
  reference_artists?: string;
  negative_prompts?: string;
  character_design_notes?: string;
  environment_design_notes?: string;
}
export interface SceneWithShots {
  id: string;
  project_id: string;
  scene_number: number;
  title: string;
  description?: string | null;
  location?: string | null;
  location_detail?: string;
  time_of_day?: string | null;
  lighting?: string | null;
  lighting_color?: string;
  weather?: string;
  atmosphere?: string;
  mood?: string | null;
  ambient_sound?: string;
  override_art_style?: string;
  override_color_palette?: string;
  anchor_cut_id?: string;
  scene_continuity_log?: string;
  location_master_url?: string;
  set_decoration?: string;
  camera_restrictions?: string;
  key_props_list?: string;
  blocking_notes?: string;
  shots?: ShotWithCuts[];
  assets?: Asset[] | null;
}
export interface ShotWithCuts {
  id: string;
  scene_id: string;
  shot_number: number;
  description?: string | null;
  camera_angle?: string | null;
  camera_height?: string;
  camera_movement?: string | null;
  camera_distance?: string;
  lens_type?: string;
  focal_length_mm?: string;
  depth_of_field?: string;
  focus_point?: string;
  subject?: string | null;
  subject_position?: string;
  composition?: string | null;
  foreground?: string;
  background?: string;
  override_mood?: string | null;
  override_lighting?: string;
  override_art_style?: string;
  aspect_ratio_override?: string;
  filter_effects?: string;
  speed_ramp?: string;
  cuts?: Cut[];
  assets?: Asset[] | null;
}
export interface Cut {
  id: string;
  shot_id: string;
  cut_number: number;
  action?: string | null;
  story_description?: string;
  dialogue?: string | null;
  expression?: string;
  body_language?: string;
  gesture?: string;
  gaze_direction?: string;
  beat_type?: string | null;
  duration_hint?: string;
  transition?: string;
  prev_cut_ref?: string;
  continuity_notes?: string;
  character_state?: string;
  object_tracking?: string;
  lighting_continuity?: string;
  edit_target?: string;
  spatial_lock?: string;
  generated_image_url?: string;
  generation_status?: string;
  generation_notes?: string;
  override_camera_distance?: string;
  override_focus_point?: string;
  override_lighting?: string;
  override_mood?: string;
  costume_notes?: string;
  prop_interaction?: string;
  emotional_arc?: string;
  sfx_notes?: string;
  music_cue?: string;
  compiled_prompt?: string;
  image_slots?: string;
}
export interface BriefUpdate {
  title?: string | null;
  logline?: string | null;
  genre?: string | null;
  tone?: string | null;
  target_audience?: string | null;
  key_themes?: string | null;
  art_style?: string | null;
  color_palette?: string | null;
  aspect_ratio?: string | null;
  render_quality?: string | null;
  lighting_style?: string | null;
  world_logic?: string | null;
  era_setting?: string | null;
  reference_films?: string | null;
  reference_artists?: string | null;
  negative_prompts?: string | null;
  character_design_notes?: string | null;
  environment_design_notes?: string | null;
}
export interface ChatMessage {
  role: string;
  content: string;
  agent_name?: string | null;
  timestamp?: string | null;
  phase?: string | null;
  is_noise?: boolean;
}
export interface ChatRequest {
  message: string;
}
export interface ElementMaster {
  id: string;
  asset_id: string;
  element_type: string;
  master_image_url?: string | null;
  master_prompt?: string | null;
  master_generation_params?: string | null;
  background_type?: string;
  view_type?: string | null;
  resolution?: string;
  aspect_ratio?: string;
  status?: string;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_active?: boolean;
  generation_request_id?: string | null;
  candidate_group_id?: string | null;
}
export interface ElementVariant {
  id: string;
  master_id: string;
  variant_type: string;
  variant_description?: string | null;
  image_url?: string | null;
  prompt?: string | null;
  generation_method?: string;
  reference_image_id?: string | null;
  generation_params?: string | null;
  status?: string;
  error_message?: string | null;
  is_active?: boolean;
  created_at?: string | null;
}
export interface GenerationRequest {
  id: string;
  project_id: string;
  target_type: string;
  target_asset_id?: string | null;
  target_cut_id?: string | null;
  prompt: string;
  model?: string;
  method?: string;
  reference_image_url?: string | null;
  reference_images?: string | null;
  params?: string | null;
  status?: string;
  progress_percentage?: number;
  current_step?: string | null;
  output_image_url?: string | null;
  output_file_path?: string | null;
  output_metadata?: string | null;
  error_message?: string | null;
  cost_usd?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  saved_to_master_id?: string | null;
  saved_to_variant_id?: string | null;
  candidate_group_id?: string | null;
}
export interface Project {
  id: string;
  name: string;
  current_phase?: string;
  stale_phases?: string;
  created_at?: string | null;
  updated_at?: string | null;
}
export interface ProjectCreate {
  name: string;
}
export interface Scene {
  id: string;
  project_id: string;
  scene_number: number;
  title: string;
  description?: string | null;
  location?: string | null;
  location_detail?: string;
  time_of_day?: string | null;
  lighting?: string | null;
  lighting_color?: string;
  weather?: string;
  atmosphere?: string;
  mood?: string | null;
  ambient_sound?: string;
  override_art_style?: string;
  override_color_palette?: string;
  anchor_cut_id?: string;
  scene_continuity_log?: string;
  location_master_url?: string;
  set_decoration?: string;
  camera_restrictions?: string;
  key_props_list?: string;
  blocking_notes?: string;
}
export interface Shot {
  id: string;
  scene_id: string;
  shot_number: number;
  description?: string | null;
  camera_angle?: string | null;
  camera_height?: string;
  camera_movement?: string | null;
  camera_distance?: string;
  lens_type?: string;
  focal_length_mm?: string;
  depth_of_field?: string;
  focus_point?: string;
  subject?: string | null;
  subject_position?: string;
  composition?: string | null;
  foreground?: string;
  background?: string;
  override_mood?: string | null;
  override_lighting?: string;
  override_art_style?: string;
  aspect_ratio_override?: string;
  filter_effects?: string;
  speed_ramp?: string;
}
