-- Migration 002: event-sourced agent run log
-- Every agent step (tool call, message, handoff, error) appends a row.
-- Used for replay, debug UI, telemetry export.

CREATE TABLE agent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    ts TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    project_id TEXT,
    phase TEXT,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_agent_events_run_seq ON agent_events(run_id, seq);
CREATE INDEX idx_agent_events_project ON agent_events(project_id);
CREATE INDEX idx_agent_events_type ON agent_events(event_type);
