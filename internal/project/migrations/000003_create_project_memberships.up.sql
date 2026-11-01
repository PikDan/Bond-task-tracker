CREATE TYPE project_role AS ENUM ('LEAD', 'MEMBER');

CREATE TABLE IF NOT EXISTS project_memberships (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    user_id TEXT NOT NULL,
    role project_role NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_memberships_project_user ON project_memberships (project_id, user_id);
