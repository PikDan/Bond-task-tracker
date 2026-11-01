CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    -- Marks the one workspace GetOrCreateDefault always resolves to for an
    -- org, even after more workspaces are added later via the regular CRUD
    -- routes.
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_org_id ON workspaces (org_id);

-- Same partial-unique-index idiom timer-service already uses for
-- one_active_timer_per_user: at most one default workspace per org.
CREATE UNIQUE INDEX IF NOT EXISTS one_default_workspace_per_org
    ON workspaces (org_id) WHERE is_default;
