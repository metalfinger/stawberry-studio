-- Optional explicit override for the prev-cut chaining heuristic.
-- NULL/empty = use the heuristic. "1" = force chain. "0" = force off.
ALTER TABLE cuts ADD COLUMN chain_from_prev TEXT DEFAULT '';
