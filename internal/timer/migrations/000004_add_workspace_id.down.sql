DROP INDEX IF EXISTS idx_time_entries_workspace_id;
ALTER TABLE time_entries DROP COLUMN IF EXISTS workspace_id;
