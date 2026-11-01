CREATE TYPE org_role AS ENUM ('OWNER', 'ADMIN');

CREATE TABLE IF NOT EXISTS org_memberships (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(id),
    user_id TEXT NOT NULL,
    role org_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_memberships_org_user ON org_memberships (org_id, user_id);

-- Same partial-unique-index idiom timer-service already uses for
-- one_active_timer_per_user: enforces exactly one OWNER row per org.
-- TransferOwnership demotes the current OWNER to ADMIN before promoting the
-- new one, so this index never sees two OWNER rows for the same org at once.
CREATE UNIQUE INDEX IF NOT EXISTS one_owner_per_org ON org_memberships (org_id) WHERE role = 'OWNER';
