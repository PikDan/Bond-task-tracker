-- Nullable for now: workspace_id can't be backfilled with a real per-row
-- value in a static SQL migration (it depends on a live call to
-- workspace-service per distinct user_id). cmd/backfill-workspaces populates
-- it after this migration runs; a follow-up "..._workspace_id_not_null"
-- migration is applied manually once backfill is confirmed complete.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id UUID;
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects (workspace_id);
