-- 'PROJECT_LEAD' is a natural future addition to this enum, but per-project
-- (not per-workspace) — it would need its own project_memberships table,
-- not a value added here. Not implemented in this pass.
CREATE TYPE workspace_role AS ENUM ('ADMIN', 'MEMBER');

CREATE TABLE IF NOT EXISTS workspace_memberships (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    user_id TEXT NOT NULL,
    role workspace_role NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_memberships_ws_user ON workspace_memberships (workspace_id, user_id);
