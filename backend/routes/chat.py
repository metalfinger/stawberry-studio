"""
Chat WebSocket route - Routes to correct agent based on project phase and sub-mode
"""
import json
import re
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.adk import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types

from backend import db
from backend import db_async
from backend.orchestrator import chat_bridge
from backend.orchestrator import intents as intent_dispatch
from backend.orchestrator.bus import bus
from backend.orchestrator.narrator import Narrator, Action
from backend.agents.berry import create_berry_agent
from backend.agents.planner import create_planner_agent
from backend.agents.detailer import create_detailer_agent
from backend.agents.analyst import create_analyst
from backend.agents.prompter import create_prompter_agent
from backend.agents.pre_production import create_pre_production_agent
from backend.agents.renderer import create_renderer_agent
from backend.agents.qa import create_qa_agent
# V1 collaborative agents - each phase has specialists

router = APIRouter()

# Single session service for the app
session_service = InMemorySessionService()

# Phase to agent mapping - Collaborative Specialists
# Each mode: (agent_name, factory, greeting, auto_trigger or None)
PHASE_AGENTS = {
    "BRIEF": {
        "default": ("Berry", create_berry_agent, "Hey! I'm Berry, your Creative Director. Tell me about your video vision!", None),
    },
    "STORY": {
        "planner": ("Sage", create_planner_agent, "Hi! I'm Sage, your Story Architect. I've read the brief - let me propose a scene structure.", "Analyze the brief and propose a scene breakdown."),
        "detailer": ("Nova", create_detailer_agent, "I'm Nova, your Shot Designer. Let's break this scene into shots and cuts!", None),
        "default": "planner",
    },
    "ASSETS": {
        "default": ("Atlas", create_analyst, "I'm Atlas, your Visual Designer. Let me examine your story and extract all visual elements...", "Analyze the blueprint and extract all characters, locations, and props."),
    },
    "GENERATE": {
        "prompter": ("Pixel", create_prompter_agent, "Hey! I'm Pixel, your Prompt Artist. Which cut shall we start with?", None),
        "pre_production": ("Iris", create_pre_production_agent, "I'm Iris, your Pre-Production Lead. I'll prepare reference images through i2i chaining.", None),
        "renderer": ("Spark", create_renderer_agent, "I'm Spark, your VFX Artist. Ready to render your visuals.", None),
        "qa": ("Scout", create_qa_agent, "I'm Scout, your QA Lead. I'll review each image for consistency.", None),
        "default": "prompter",
    },
}


def detect_agent_switch(message: str, current_mode: str) -> tuple:
    """
    Detect if user wants to switch between Planner and Detailer.
    Returns (new_mode, scene_id or None)
    """
    message_lower = message.lower()
    
    # Switch to Detailer
    detail_match = re.search(r"(detail|focus|work on|break down)\s*(scene\s*(\d+)|scene)", message_lower)
    if detail_match:
        scene_num = detail_match.group(3)
        return ("detailer", scene_num)
    
    # Switch to Planner
    if any(phrase in message_lower for phrase in ["back to overview", "back to planner", "overview", "scene structure"]):
        return ("planner", None)
    
    return (current_mode, None)


@router.websocket("/api/projects/{project_id}/chat")
async def chat_websocket(websocket: WebSocket, project_id: str, phase: str = None):
    """WebSocket endpoint for chatting with phase-appropriate agent."""
    await websocket.accept()
    
    # Verify project exists and get phase
    project = await db_async.get_project(project_id)
    if not project:
        await websocket.send_json({"error": "Project not found"})
        await websocket.close()
        return
    
    # Use requested phase or current project phase
    current_phase = phase if phase else project.get("current_phase", "BRIEF")
    project_phase = project.get("current_phase", "BRIEF")
    
    # Check if viewing history (requested phase != current project phase)
    is_history_mode = current_phase != project_phase
    
    # Get phase config
    phase_config = PHASE_AGENTS.get(current_phase, PHASE_AGENTS["BRIEF"])
    
    # Determine initial agent mode
    if isinstance(phase_config.get("default"), str):
        current_mode = phase_config["default"]
        agent_name, create_agent_fn, greeting, auto_trigger = phase_config[current_mode]
    else:
        current_mode = "default"
        agent_name, create_agent_fn, greeting, auto_trigger = phase_config["default"]
    
    current_scene_id = None
    
    # Narrator emits typed Console messages (handoff, failure, tool_call,
    # plan, image, etc.) by publishing to the project's ProjectBus. The
    # WebSocket is registered as a bus subscriber so any backend code
    # (orchestrator, tools, batch runners) can emit without holding the
    # socket itself. The subscription is torn down on WS close (see finally).
    narrator = Narrator(project_id)
    sub_id = await bus.subscribe(project_id, websocket.send_json)

    # Send current phase/mode info
    await websocket.send_json({
        "type": "phase",
        "phase": current_phase,
        "agent": agent_name,
        "mode": current_mode,
        "is_history": is_history_mode
    })
    
    # Create agent and runner
    agent = create_agent_fn()
    runner = Runner(
        agent=agent,
        app_name="strawberry_studio",
        session_service=session_service
    )
    
    user_id = "web_user"
    session_id = f"session_{project_id}_{current_phase}_{current_mode}"
    
    # Get or create session with project_id in state
    session = await session_service.get_session(
        app_name="strawberry_studio",
        user_id=user_id,
        session_id=session_id
    )
    
    if not session:
        session = await session_service.create_session(
            app_name="strawberry_studio",
            user_id=user_id,
            session_id=session_id,
            state={"project_id": project_id, "current_scene_id": current_scene_id}
        )
    
    # Send phase-specific chat history
    history = await db_async.get_chat_history(project_id, phase=current_phase)
    await websocket.send_json({"type": "history", "messages": history})
    
    # Send initial greeting if no history for this phase (and not in history mode)
    if not history and not is_history_mode:
        await db_async.add_chat_message(project_id, "assistant", greeting, phase=current_phase, agent_name=agent_name)
        await websocket.send_json({"type": "message", "role": "assistant", "content": greeting, "agent_name": agent_name})
    
    # If there's an auto-trigger and we just started this phase (no history/fresh start)
    if auto_trigger and (not history and not is_history_mode):
        # The legacy `session.turn(auto_trigger)` API was an ADK-era helper
        # that no longer exists. Route through chat_bridge for Pydantic AI
        # agents; skip silently for any agent that hasn't been ported yet.
        spec_id = (agent_name or "").lower()
        if chat_bridge.is_enabled(spec_id):
            full_response = ""
            try:
                async for chunk in chat_bridge.stream_turn(
                    spec_id, auto_trigger, project_id=project_id, phase=current_phase
                ):
                    if chunk:
                        full_response += chunk
                        await websocket.send_json({
                            "type": "stream",
                            "content": chunk,
                            "agent_name": agent_name,
                        })
            except Exception as e:
                await websocket.send_json({"type": "error", "message": f"auto_trigger: {e}"})
            if full_response:
                await db_async.add_chat_message(project_id, "assistant", full_response, phase=current_phase, agent_name=agent_name)
                await websocket.send_json({
                    "type": "message",
                    "role": "assistant",
                    "content": full_response,
                    "agent_name": agent_name,
                })
                await websocket.send_json({
                    "type": "tree_updated",
                    "agent": agent_name,
                    "phase": current_phase,
                })

    try:
        while True:
            # Receive user message
            data = await websocket.receive_text()
            message_data = json.loads(data)
            # Console sends {type: 'user_message', content, attachments} or
            # {type: 'user_intent', intent, payload}. Legacy clients send {message}.
            msg_type = message_data.get("type")
            if msg_type == "user_intent":
                # Route the intent through the typed dispatcher. If it
                # handles the intent fully (returns True), skip the chat
                # agent for this turn. Unknown intents fall through to
                # the legacy path so existing flows aren't broken.
                intent = message_data.get("intent", "")
                payload = message_data.get("payload") or {}
                ref_msg_id = message_data.get("ref_message_id")
                handled = await intent_dispatch.handle_intent(
                    project_id=project_id,
                    intent=intent,
                    payload=payload,
                    ref_message_id=ref_msg_id,
                    narrator=narrator,
                )
                if handled:
                    continue
                user_message = f"[intent:{intent}] {json.dumps(payload)}" if intent else ""
            else:
                user_message = (
                    message_data.get("content")
                    or message_data.get("message", "")
                )

            if not user_message:
                continue
            
            # Check for agent switch commands (Blueprint phase)
            if current_phase == "STORY":
                new_mode, scene_num = detect_agent_switch(user_message, current_mode)
                
                if new_mode != current_mode:
                    current_mode = new_mode
                    
                    # Resolve scene number to ID
                    if scene_num and new_mode == "detailer":
                        scenes = await db_async.get_scenes(project_id)
                        scene = next((s for s in scenes if s['scene_number'] == int(scene_num)), None)
                        if scene:
                            current_scene_id = scene['id']
                    
                    # Switch agent
                    agent_name, create_agent_fn, mode_greeting, _ = phase_config[current_mode]
                    agent = create_agent_fn()
                    runner = Runner(
                        agent=agent,
                        app_name="strawberry_studio",
                        session_service=session_service
                    )
                    
                    # Get or create session for new mode
                    session_id = f"session_{project_id}_{current_phase}_{current_mode}"
                    session = await session_service.get_session(
                        app_name="strawberry_studio",
                        user_id=user_id,
                        session_id=session_id
                    )
                    if not session:
                        session = await session_service.create_session(
                            app_name="strawberry_studio",
                            user_id=user_id,
                            session_id=session_id,
                            state={"project_id": project_id, "current_scene_id": current_scene_id}
                        )
                    
                    # Notify client of mode switch
                    focus_info = None
                    if current_scene_id and scene:
                        focus_info = f"Scene {scene['scene_number']}: {scene['title']}"
                    
                    await websocket.send_json({
                        "type": "mode_switch",
                        "mode": current_mode,
                        "agent": agent_name,
                        "scene_id": current_scene_id,
                        "focus": focus_info
                    })
            
            # Check if phase changed (e.g., complete_briefing was called)
            project = await db_async.get_project(project_id)
            new_phase = project.get("current_phase", current_phase)
            if new_phase != current_phase:
                old_phase = current_phase
                current_phase = new_phase
                
                # Get new phase config and switch agent
                phase_config = PHASE_AGENTS.get(current_phase, PHASE_AGENTS["BRIEF"])
                if isinstance(phase_config.get("default"), str):
                    current_mode = phase_config["default"]
                    agent_name, create_agent_fn, new_greeting, _ = phase_config[current_mode]
                else:
                    current_mode = "default"
                    agent_name, create_agent_fn, new_greeting, _ = phase_config["default"]
                
                # Create new agent and runner
                agent = create_agent_fn()
                runner = Runner(
                    agent=agent,
                    app_name="strawberry_studio",
                    session_service=session_service
                )
                session_id = f"session_{project_id}_{current_phase}_{current_mode}"
                session = await session_service.get_session(
                    app_name="strawberry_studio",
                    user_id=user_id,
                    session_id=session_id
                )
                if not session:
                    session = await session_service.create_session(
                        app_name="strawberry_studio",
                        user_id=user_id,
                        session_id=session_id,
                        state={"project_id": project_id, "current_scene_id": current_scene_id}
                    )
                
                # Notify client and send new agent greeting.
                # Emit typed handoff card alongside legacy phase_change so the
                # Console renders it as a HandoffCard.
                try:
                    prev_agent = phase_config.get(current_mode, ("",))[0] if current_mode else ""
                    await narrator.handoff(
                        from_agent=prev_agent or "—",
                        to_agent=agent_name,
                        reason=f"Phase {old_phase} → {new_phase}",
                    )
                except Exception:
                    pass
                await websocket.send_json({"type": "phase_change", "old_phase": old_phase, "new_phase": new_phase, "agent": agent_name})
                await db_async.add_chat_message(project_id, "assistant", new_greeting, phase=current_phase, agent_name=agent_name)
                await websocket.send_json({"type": "message", "role": "assistant", "content": new_greeting, "agent_name": agent_name})
                continue  # Skip processing the triggering user message after phase change
            
            # Save and echo user message
            await db_async.add_chat_message(project_id, "user", user_message, phase=current_phase)
            await websocket.send_json({"type": "message", "role": "user", "content": user_message})
            
            # Run agent
            full_response = ""
            handoff_request = None

            spec_id = (agent_name or "").lower()
            use_pai = chat_bridge.is_enabled(spec_id)

            if use_pai:
                # New path: Pydantic AI orchestrator. Track latency + char
                # count → coarse cost estimate so the Console cost meter
                # also reflects LLM usage, not just image gens.
                import time as _time
                _t0 = _time.monotonic()
                try:
                    async for chunk in chat_bridge.stream_turn(
                        spec_id, user_message, project_id=project_id, phase=current_phase
                    ):
                        if chunk:
                            full_response += chunk
                            await websocket.send_json({
                                "type": "stream",
                                "content": chunk,
                                "agent_name": agent_name,
                            })
                    # Cost: ~$2.50 per 1M output tokens (Gemini 2.5 Pro tier),
                    # ~4 chars per token. This is a best-effort estimate until
                    # pydantic-ai surfaces structured usage.
                    out_tokens = max(1, len(full_response) // 4)
                    est_cost = out_tokens * 2.5 / 1_000_000
                    latency_ms = int((_time.monotonic() - _t0) * 1000)
                    try:
                        await narrator.tool_call(
                            name=f"{spec_id}.complete",
                            args={"chars": len(full_response)},
                            status="done",
                            cost_usd=est_cost,
                            latency_ms=latency_ms,
                        )
                    except Exception:
                        pass
                    # Pattern-detect known agent prompts and surface a typed
                    # ActionsBar so the user can decide with a click instead
                    # of typing "yes"/"no". Cheap heuristic; agents that
                    # call structured tools (future) will skip this branch.
                    try:
                        lowered = full_response.lower()
                        if (
                            spec_id == "berry"
                            and "story" in lowered
                            and ("confirmation required" in lowered or "say \"yes\"" in lowered or "please say" in lowered)
                        ):
                            await narrator.actions(
                                prompt="Ready to move to STORY phase?",
                                buttons=[
                                    Action(label="✅ Yes, proceed", intent="confirm_briefing", primary=True),
                                    Action(label="✏️ Make changes", intent="decline_briefing"),
                                ],
                            )
                    except Exception:
                        pass
                except Exception as e:
                    try:
                        await narrator.failure(
                            error=str(e),
                            suggestion="Retry the message — if it keeps failing, check the agent logs.",
                            recovery_actions=[],
                        )
                    except Exception:
                        pass
                    await websocket.send_json({"type": "error", "message": f"orchestrator: {e}"})
            else:
                # Legacy path: Google ADK runner
                new_message = genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=user_message)],
                )
                async for event in runner.run_async(
                    user_id=user_id,
                    session_id=session_id,
                    new_message=new_message,
                ):
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if part.text:
                                full_response += part.text
                            if part.function_call:
                                await websocket.send_json({
                                    "type": "tool",
                                    "name": part.function_call.name,
                                })
                                if part.function_call.name == "request_handoff":
                                    args = part.function_call.args
                                    handoff_request = {
                                        "target": args.get("target_agent"),
                                        "context": args.get("context"),
                                    }
            
            if full_response:
                await db_async.add_chat_message(project_id, "assistant", full_response, phase=current_phase, agent_name=agent_name)
                await websocket.send_json({
                    "type": "message",
                    "role": "assistant",
                    "content": full_response,
                    "agent_name": agent_name
                })
                # Notify the frontend that mutating agents may have changed the
                # tree state. Cheap and idempotent — the canvas re-fetches
                # assets/scenes/shots/cuts and reconciles. Fixes the stale
                # asset-id bug where the canvas held an old UUID after Atlas
                # rebuilt extraction.
                await websocket.send_json({
                    "type": "tree_updated",
                    "agent": agent_name,
                    "phase": current_phase,
                })
                
            # Execute Handoff if requested
            if handoff_request:
                target_mode = handoff_request["target"]
                context_msg = handoff_request["context"]
                
                # Verify target exists in current phase
                if target_mode in phase_config:
                    # Switch Agent
                    current_mode = target_mode
                    agent_name, create_agent_fn, mode_greeting, _ = phase_config[current_mode]
                    agent = create_agent_fn()
                    runner = Runner(
                        agent=agent,
                        app_name="strawberry_studio",
                        session_service=session_service
                    )
                    
                    # New session
                    session_id = f"session_{project_id}_{current_phase}_{current_mode}"
                    
                    # Ensure session exists for the new mode
                    session = await session_service.get_session(
                        app_name="strawberry_studio",
                        user_id=user_id,
                        session_id=session_id
                    )
                    
                    if not session:
                        # Extract cut_id from context if present (for prompter → pre_production handoffs)
                        cut_id_from_context = None
                        if "cut" in context_msg.lower() or "scene" in context_msg.lower():
                            # Try to parse cut_id from context message
                            import re
                            match = re.search(r'cut_[a-f0-9]+', context_msg.lower())
                            if match:
                                cut_id_from_context = match.group(0)

                        session = await session_service.create_session(
                            app_name="strawberry_studio",
                            user_id=user_id,
                            session_id=session_id,
                            state={
                                "project_id": project_id,
                                "current_cut_id": cut_id_from_context or ""
                            }
                        )
                    
                    # Notify Frontend (Mode Switch)
                    await websocket.send_json({
                        "type": "mode_switch",
                        "mode": current_mode,
                        "agent": agent_name,
                        "focus": f"Handoff: {context_msg[:30]}..."
                    })
                    
                    # Auto-run the new agent with the context
                    # Treat context as system prompt or user message? User message "Context from prev agent: ..."
                    handoff_prompt = f"[SYSTEM: Incoming Handoff]\nReason: {context_msg}\nExplain what you are doing and proceed."
                    
                    # Recursively run loop logic for new agent? 
                    # Simpler: Just run one turn here. 
                    # NOTE: Ideally this would be a loop, but for now 1 level of handoff is fine.
                    # Or we can set a flag to continue the outer loop?
                    # Let's just run the turn here to keep it simple.
                    
                    new_agent_response = ""
                    handoff_message = genai_types.Content(
                        role="user",
                        parts=[genai_types.Part(text=handoff_prompt)]
                    )
                    
                    async for event in runner.run_async(
                        user_id=user_id,
                        session_id=session_id,
                        new_message=handoff_message
                    ):
                        if event.content and event.content.parts:
                            for part in event.content.parts:
                                if part.text:
                                    new_agent_response += part.text
                                if part.function_call:
                                    await websocket.send_json({ "type": "tool", "name": part.function_call.name })
                    
                    if new_agent_response:
                        await db_async.add_chat_message(project_id, "assistant", new_agent_response, phase=current_phase, agent_name=agent_name)
                        await websocket.send_json({
                            "type": "message",
                            "role": "assistant",
                            "content": new_agent_response,
                            "agent_name": agent_name
                        })
                else:
                    err_msg = f"Cannot handoff: Target agent '{target_mode}' not found in {current_phase} phase."
                    await websocket.send_json({"type": "error", "message": err_msg})
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # Always release the bus subscription so a dropped WS doesn't leak.
        try:
            await bus.unsubscribe(project_id, sub_id)
        except Exception:
            pass
