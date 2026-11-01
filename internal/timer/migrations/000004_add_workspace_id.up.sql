-- Nullable for now — see internal/project/migrations/000002 for why (needs
-- a live workspace-service call per user_id, which doesn't fit a static SQL
-- migration). cmd/backfill-workspaces populates it after this runs.
--
-- Deliberately NOT part of one_active_timer_per_user: that invariant stays
-- global per user_id regardless of workspace — a person can't run two
-- timers at once no matter which workspace either belongs to.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS workspace_id UUID;
CREATE INDEX IF NOT EXISTS idx_time_entries_workspace_id ON time_entries (workspace_id);
