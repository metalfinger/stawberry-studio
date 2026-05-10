"""
Strawberry Studio orchestrator — agent runtime, tool registry, event log.

Modules in this package:
  agent_spec      load YAML agent declarations
  runner          stream pydantic-AI agent turns
  chat_bridge     chat-WS surface used by routes/chat.py
  intents         user_intent dispatch (PlanCard buttons, etc.)
  events          structured event log (agent_events table)
  bus             per-project ProjectBus pub/sub for typed Console messages
  narrator        typed-message emitter (text, plan, reference_card, …)
  llm_cost        per-model cost lookups
  gen_stats       in-memory in-flight image-gen tracker

  references      reference_pool service + asset-aware generators
  picker          label-aware reference picker (rank_labels_for_cut)
  prompt_dsl      [STYLE]/[CHARACTER]/[SETTING]/… block resolver
  identity_traits LLM trait extraction (appearance, distinctive_features, …)
  style_bible     palette_hex + style_tokens + lighting_rules compiler
  style_anchor    project-pinned anchor image (writes both storage paths)
  continuity      continuity-bible compile/read

  context_bundler bundles cut → CutContext for the planner
  asset_bundler   bundles asset → AssetContext (DAG walk, history)
  plans           Plan dataclass + persistence
  cut_planner     plan_compose_cut: build a Plan for one cut
  cut_executor    execute_plan: run an approved Plan
  iris            internal gap-filler (called from cut_executor PREPROD_FILL)
  vision_critic   image-rubric review for cut_executor's auto-retry
  turn_ordering   author-order enforcement after a runner turn
"""
