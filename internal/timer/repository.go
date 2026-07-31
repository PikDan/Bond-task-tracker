package timer

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

const uniqueViolationCode = "23505"

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// StartActive inserts a new active (ended_at = NULL) entry. If the user
// already has one, the partial unique index on (user_id) WHERE ended_at IS
// NULL rejects it — this is the race-safe source of truth, not just the
// application-level pre-check in Service.Start.
func (r *Repository) StartActive(ctx context.Context, e *TimeEntry) error {
	e.ID = uuid.NewString()
	const q = `
		INSERT INTO time_entries (id, user_id, task_id, task_name, project_id, description)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING started_at`
	err := r.db.QueryRowContext(ctx, q, e.ID, e.UserID, e.TaskID, e.TaskName, e.ProjectID, e.Description).Scan(&e.StartedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == uniqueViolationCode {
			return ErrActiveTimerExists
		}
		return err
	}
	return nil
}

// StopActive closes the active entry for userID, but only if it belongs to
// taskID — callers are expected to have already confirmed via GetActive that
// an active entry exists and matches taskID (for a precise error), this
// WHERE clause is the race-safe guard against stopping the wrong task.
func (r *Repository) StopActive(ctx context.Context, userID, taskID string) (*TimeEntry, error) {
	const q = `
		UPDATE time_entries
		SET ended_at = now(),
		    duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))::BIGINT
		WHERE user_id = $1 AND task_id = $2 AND ended_at IS NULL
		RETURNING id, user_id, task_id, task_name, project_id, description, started_at, ended_at, duration_seconds`
	e := &TimeEntry{}
	err := r.db.QueryRowContext(ctx, q, userID, taskID).Scan(
		&e.ID, &e.UserID, &e.TaskID, &e.TaskName, &e.ProjectID, &e.Description,
		&e.StartedAt, &e.EndedAt, &e.DurationSeconds)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNoActiveTimer
	}
	if err != nil {
		return nil, err
	}
	return e, nil
}

// UpdateTimes overwrites started_at/ended_at/duration_seconds (and, for
// bulk-edit split/merge, task_id/task_name/project_id) for an entry the
// caller already owns and has computed — the service resolves what each
// column's final value should be (including "unchanged") before calling
// this, so it always writes all six columns unconditionally, matching every
// other Update method in this codebase. Reassigning task_id here doesn't
// touch the partial unique index's invariant either: that index only cares
// about how many rows have ended_at IS NULL for a given user_id, which this
// never changes.
func (r *Repository) UpdateTimes(ctx context.Context, e *TimeEntry) error {
	const q = `
		UPDATE time_entries
		SET started_at = $1, ended_at = $2, duration_seconds = $3,
		    task_id = $4, task_name = $5, project_id = $6
		WHERE id = $7 AND user_id = $8`
	res, err := r.db.ExecContext(ctx, q,
		e.StartedAt, e.EndedAt, e.DurationSeconds,
		e.TaskID, e.TaskName, e.ProjectID,
		e.ID, e.UserID)
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

func (r *Repository) Delete(ctx context.Context, id, userID string) error {
	const q = `DELETE FROM time_entries WHERE id = $1 AND user_id = $2`
	res, err := r.db.ExecContext(ctx, q, id, userID)
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

func (r *Repository) GetActive(ctx context.Context, userID string) (*TimeEntry, error) {
	const q = `
		SELECT id, user_id, task_id, task_name, project_id, description, started_at, ended_at, duration_seconds
		FROM time_entries WHERE user_id = $1 AND ended_at IS NULL`
	e := &TimeEntry{}
	err := r.db.QueryRowContext(ctx, q, userID).Scan(
		&e.ID, &e.UserID, &e.TaskID, &e.TaskName, &e.ProjectID, &e.Description,
		&e.StartedAt, &e.EndedAt, &e.DurationSeconds)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNoActiveTimer
	}
	if err != nil {
		return nil, err
	}
	return e, nil
}

func (r *Repository) Get(ctx context.Context, id string) (*TimeEntry, error) {
	const q = `
		SELECT id, user_id, task_id, task_name, project_id, description, started_at, ended_at, duration_seconds
		FROM time_entries WHERE id = $1`
	e := &TimeEntry{}
	err := r.db.QueryRowContext(ctx, q, id).Scan(
		&e.ID, &e.UserID, &e.TaskID, &e.TaskName, &e.ProjectID, &e.Description,
		&e.StartedAt, &e.EndedAt, &e.DurationSeconds)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return e, nil
}

func (r *Repository) List(ctx context.Context, userID string, from, to *time.Time, taskID string) ([]*TimeEntry, error) {
	q := `
		SELECT id, user_id, task_id, task_name, project_id, description, started_at, ended_at, duration_seconds
		FROM time_entries WHERE user_id = $1`
	args := []any{userID}
	if from != nil {
		args = append(args, *from)
		q += fmt.Sprintf(" AND started_at >= $%d", len(args))
	}
	if to != nil {
		args = append(args, *to)
		q += fmt.Sprintf(" AND started_at <= $%d", len(args))
	}
	if taskID != "" {
		args = append(args, taskID)
		q += fmt.Sprintf(" AND task_id = $%d", len(args))
	}
	q += " ORDER BY started_at DESC"

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []*TimeEntry{}
	for rows.Next() {
		e := &TimeEntry{}
		if err := rows.Scan(&e.ID, &e.UserID, &e.TaskID, &e.TaskName, &e.ProjectID, &e.Description,
			&e.StartedAt, &e.EndedAt, &e.DurationSeconds); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
