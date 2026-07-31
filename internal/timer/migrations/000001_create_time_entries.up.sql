CREATE TABLE IF NOT EXISTS time_entries (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id UUID NOT NULL,
    project_id UUID NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds BIGINT
);

-- Core invariant: only one active (ended_at IS NULL) entry per user, enforced
-- at the database level so concurrent start requests can't both succeed.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_timer_per_user
    ON time_entries (user_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON time_entries (task_id);
