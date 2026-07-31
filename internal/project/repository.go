package project

import (
	"context"
	"database/sql"
	"errors"

	"github.com/google/uuid"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, userID, name string) (*Project, error) {
	p := &Project{
		ID:     uuid.NewString(),
		UserID: userID,
		Name:   name,
	}
	const q = `
		INSERT INTO projects (id, user_id, name)
		VALUES ($1, $2, $3)
		RETURNING created_at, updated_at`
	err := r.db.QueryRowContext(ctx, q, p.ID, p.UserID, p.Name).Scan(&p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *Repository) Rename(ctx context.Context, id, userID, name string) (*Project, error) {
	p := &Project{ID: id, UserID: userID, Name: name}
	const q = `
		UPDATE projects SET name = $1, updated_at = now()
		WHERE id = $2 AND user_id = $3
		RETURNING created_at, updated_at`
	err := r.db.QueryRowContext(ctx, q, name, id, userID).Scan(&p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *Repository) Delete(ctx context.Context, id, userID string) error {
	const q = `DELETE FROM projects WHERE id = $1 AND user_id = $2`
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

// Get looks up a project by id only (no owner filter) since it also backs
// cross-service calls (e.g. Task Service checking a project exists). Callers
// that need ownership enforcement compare the returned UserID themselves.
func (r *Repository) Get(ctx context.Context, id string) (*Project, error) {
	p := &Project{ID: id}
	const q = `SELECT user_id, name, created_at, updated_at FROM projects WHERE id = $1`
	err := r.db.QueryRowContext(ctx, q, id).Scan(&p.UserID, &p.Name, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *Repository) List(ctx context.Context, userID string) ([]*Project, error) {
	const q = `
		SELECT id, user_id, name, created_at, updated_at
		FROM projects WHERE user_id = $1
		ORDER BY created_at DESC`
	rows, err := r.db.QueryContext(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []*Project{}
	for rows.Next() {
		p := &Project{}
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}
