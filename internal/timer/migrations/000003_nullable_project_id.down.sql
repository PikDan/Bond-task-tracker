-- Fails if any projectless entries exist at downgrade time — same honest
-- non-backfilling behavior as the matching Task Service migration.
ALTER TABLE time_entries ALTER COLUMN project_id SET NOT NULL;
