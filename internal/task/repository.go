package task

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, t *Task) error {
	t.ID = uuid.NewString()
	tagsJSON, err := marshalTags(t.Tags)
	if err != nil {
		return err
	}
	const q = `
		INSERT INTO tasks (id, project_id, user_id, workspace_id, title, status, tags)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
		RETURNING created_at, updated_at`
	return r.db.QueryRowContext(ctx, q, t.ID, t.ProjectID, t.UserID, t.WorkspaceID, t.Title, string(t.Status), tagsJSON).
		Scan(&t.CreatedAt, &t.UpdatedAt)
}

// Update assumes the caller (Service.Update) has already verified the
// acting user may touch this task (owner, or CanManageWorkspace) — the
// workspace_id filter here is defense-in-depth, not the primary check.
func (r *Repository) Update(ctx context.Context, t *Task) error {
	tagsJSON, err := marshalTags(t.Tags)
	if err != nil {
		return err
	}
	const q = `
		UPDATE tasks SET title = $1, status = $2, tags = $3::jsonb, project_id = $4, updated_at = now()
		WHERE id = $5 AND workspace_id = $6
		RETURNING updated_at`
	err = r.db.QueryRowContext(ctx, q, t.Title, string(t.Status), tagsJSON, t.ProjectID, t.ID, t.WorkspaceID).Scan(&t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// Delete's authorization decision (owner, CanManageWorkspace, or project
// Lead) is made entirely in Go by Service.Delete before this is called —
// this is a plain existence-scoped delete, matching timer-service's
// Repository.Delete.
func (r *Repository) Delete(ctx context.Context, id, workspaceID string) error {
	const q = `DELETE FROM tasks WHERE id = $1 AND workspace_id = $2`
	res, err := r.db.ExecContext(ctx, q, id, workspaceID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// Get looks up a task by id only (no owner/workspace filter) — also used
// internally by Timer Service to validate task_id and fetch its
// project_id/workspace_id.
func (r *Repository) Get(ctx context.Context, id string) (*Task, error) {
	t := &Task{ID: id}
	var status string
	var tagsRaw []byte
	const q = `SELECT project_id, user_id, workspace_id, title, status, tags, created_at, updated_at FROM tasks WHERE id = $1`
	err := r.db.QueryRowContext(ctx, q, id).
		Scan(&t.ProjectID, &t.UserID, &t.WorkspaceID, &t.Title, &status, &tagsRaw, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	t.Status = Status(status)
	if t.Tags, err = unmarshalTags(tagsRaw); err != nil {
		return nil, err
	}
	return t, nil
}

// List stays private to userID within workspaceID — the default for
// Member. See ListByWorkspace for the "everyone in the workspace" mode
// available to CanSeeAllInWorkspace roles.
func (r *Repository) List(ctx context.Context, workspaceID, userID, projectID string) ([]*Task, error) {
	q := `
		SELECT id, project_id, user_id, workspace_id, title, status, tags, created_at, updated_at
		FROM tasks WHERE workspace_id = $1 AND user_id = $2`
	args := []any{workspaceID, userID}
	if projectID != "" {
		q += ` AND project_id = $3`
		args = append(args, projectID)
	}
	q += ` ORDER BY created_at DESC`
	return r.queryTasks(ctx, q, args...)
}

// ListByWorkspace returns every task in workspaceID regardless of owner —
// gated server-side by CanSeeAllInWorkspace in Service.List, never by
// anything the client can force on its own.
func (r *Repository) ListByWorkspace(ctx context.Context, workspaceID, projectID string) ([]*Task, error) {
	q := `
		SELECT id, project_id, user_id, workspace_id, title, status, tags, created_at, updated_at
		FROM tasks WHERE workspace_id = $1`
	args := []any{workspaceID}
	if projectID != "" {
		q += ` AND project_id = $2`
		args = append(args, projectID)
	}
	q += ` ORDER BY created_at DESC`
	return r.queryTasks(ctx, q, args...)
}

func (r *Repository) queryTasks(ctx context.Context, q string, args ...any) ([]*Task, error) {
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := []*Task{}
	for rows.Next() {
		t := &Task{}
		var status string
		var tagsRaw []byte
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.UserID, &t.WorkspaceID, &t.Title, &status, &tagsRaw, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		t.Status = Status(status)
		if t.Tags, err = unmarshalTags(tagsRaw); err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

// marshalTags/unmarshalTags round-trip tags through a jsonb column — safer
// than relying on database/sql's native array scanning support, which isn't
// guaranteed to work uniformly across drivers.
func marshalTags(tags []string) (string, error) {
	if tags == nil {
		tags = []string{}
	}
	b, err := json.Marshal(tags)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func unmarshalTags(raw []byte) ([]string, error) {
	var tags []string
	if err := json.Unmarshal(raw, &tags); err != nil {
		return nil, err
	}
	return tags, nil
}
