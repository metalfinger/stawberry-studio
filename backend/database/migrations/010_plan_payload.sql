-- Plan extension for typed-message routing.
--
-- The Console renders a plan card from a typed message with its own
-- message_id; subsequent plan_update events must reference that id to
-- patch the right card. We persist the chat message_id on the plan row so
-- the cut_executor (which runs in a background task) can address it
-- without holding the request context.

ALTER TABLE plans ADD COLUMN payload_json TEXT DEFAULT '{}';
