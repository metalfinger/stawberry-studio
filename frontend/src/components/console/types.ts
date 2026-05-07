// Typed message protocol for the Agentic Console.
// Source of truth: AGENTIC_CONSOLE_REDESIGN.md §5.

export interface ActionButton {
  label: string;
  intent: string;
  icon?: string;
  primary?: boolean;
  payload?: Record<string, unknown>;
}

export interface PlanItemData {
  id: string;
  kind: string;
  description: string;
  cost_usd: number;
  eta_s: number;
  cached: boolean;
  approved: boolean;
  alternatives: Array<{ ref_id: string; label: string; image_url: string; reason: string }>;
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'running' | 'done' | 'skipped' | 'error';
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface ReferenceCardData {
  ref_id: string;
  thumb_url: string;
  label: string;
  asset_name: string;
  status: 'cached' | 'generating' | 'newly_generated';
  cost_usd?: number;
  ref_metadata?: Record<string, unknown>;
}

export type ConsoleMessage =
  | { kind: 'text'; message_id: string; timestamp: string; markdown: string; agent_name?: string }
  | { kind: 'plan'; message_id: string; timestamp: string; plan_id: string; cut_id: string | null; items: PlanItemData[]; total_cost_usd: number; total_eta_s: number; feedback_round: number; feedback: string[]; auto_approve_under_usd: number }
  | { kind: 'plan_update'; message_id: string; timestamp: string; item_id: string; status: PlanItemData['status']; result: Record<string, unknown> | null; error: string | null }
  | { kind: 'image'; message_id: string; timestamp: string; url: string; caption?: string; metadata?: Record<string, unknown> }
  | { kind: 'reference_card'; message_id: string; timestamp: string } & ReferenceCardData
  | { kind: 'elapsed'; message_id: string; timestamp: string; label: string; started_at: string; estimated_total_s?: number }
  | { kind: 'comparison'; message_id: string; timestamp: string; left_url: string; right_url: string; left_label: string; right_label: string; actions: ActionButton[] }
  | { kind: 'recommendation'; message_id: string; timestamp: string; primary: ReferenceCardData; alternatives: ReferenceCardData[]; reasoning: string }
  | { kind: 'tool_call'; message_id: string; timestamp: string; name: string; args: Record<string, unknown>; status: 'running' | 'done' | 'error'; result?: unknown; cost_usd?: number; latency_ms?: number }
  | { kind: 'batch_progress'; message_id: string; timestamp: string; batch_id: string; items: Array<{ id: string; label: string; status: string; thumb_url?: string }>; can_pause: boolean }
  | { kind: 'idle_suggestion'; message_id: string; timestamp: string; reasoning: string; actions: ActionButton[] }
  | { kind: 'activity'; message_id: string; timestamp: string; events: Array<{ when: string; what: string; cost_usd?: number }> }
  | { kind: 'failure'; message_id: string; timestamp: string; error: string; suggestion: string; recovery_actions: ActionButton[] }
  | { kind: 'actions'; message_id: string; timestamp: string; prompt: string; buttons: ActionButton[] }
  | { kind: 'handoff'; message_id: string; timestamp: string; from_agent: string; to_agent: string; reason: string; actions: ActionButton[] };

export interface UserAttachment {
  kind: 'reference';
  ref_id: string;
}

export interface UserMessage {
  type: 'user_message';
  content: string;
  attachments?: UserAttachment[];
  intent?: string;
  payload?: Record<string, unknown>;
  ref_message_id?: string;
}

export interface UserIntent {
  type: 'user_intent';
  intent: string;
  payload?: Record<string, unknown>;
  ref_message_id?: string;
}
