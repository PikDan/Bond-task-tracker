DROP INDEX IF EXISTS idx_tasks_workspace_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS workspace_id;
