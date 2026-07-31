-- Fails if any projectless tasks exist at downgrade time — there is no
-- synthetic "default project" to backfill them with, so this is the honest
-- reversible behavior rather than silently inventing project ownership.
ALTER TABLE tasks ALTER COLUMN project_id SET NOT NULL;
