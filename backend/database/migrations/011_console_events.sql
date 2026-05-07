-- Persist every typed Console event so a hard refresh re-renders the
-- exact stream the user saw. ProjectBus.publish writes here on every
-- emission; routes/chat.py replays on WS connect.
--
-- We store the whole payload as JSON because the typed-message protocol
-- is intentionally open-ended; the Console renderer dispatches on the
-- `kind` field. message_id is duplicated as a column for fast plan_update
-- patching across reloads.

CREATE TABLE console_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    kind TEXT NOT NULL,
    message_id TEXT,
    payload_json TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX idx_console_events_project_ts ON console_events(project_id, ts DESC);
CREATE INDEX idx_console_events_message ON console_events(message_id);
