-- Nullable for now — see internal/project/migrations/000002 for why (needs
-- a live workspace-service call per user_id, which doesn't fit a static SQL
-- migration). cmd/backfill-workspaces populates it after this runs.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workspace_id UUID;
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks (workspace_id);
