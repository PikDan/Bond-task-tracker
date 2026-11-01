CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    -- Set once, at auto-provision time, and never touched again; NOT the
    -- same as owner_user_id once ownership transfers. NULLs are distinct
    -- from each other in Postgres, so this UNIQUE constraint gives "at
    -- most one auto-provisioned org per user_id" for manually-created
    -- orgs (which leave this NULL) at no extra cost.
    default_for_user_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
