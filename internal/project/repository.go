package project

import (
	"context"
	"database/sql"
	"errors"

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

func (r *Repository) Create(ctx context.Context, userID, workspaceID, name string) (*Project, error) {
	p := &Project{
		ID:          uuid.NewString(),
		UserID:      userID,
		WorkspaceID: workspaceID,
		Name:        name,
	}
	const q = `
		INSERT INTO projects (id, user_id, workspace_id, name)
		VALUES ($1, $2, $3, $4)
		RETURNING created_at, updated_at`
	err := r.db.QueryRowContext(ctx, q, p.ID, p.UserID, p.WorkspaceID, p.Name).Scan(&p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

// Rename requires id to belong to workspaceID, and — unless canManageOrLead
// (an Organization Owner/Admin, Workspace Admin, or this project's Lead) —
// also requires userID to be the project's own owner.
func (r *Repository) Rename(ctx context.Context, id, workspaceID, userID, name string, canManageOrLead bool) (*Project, error) {
	p := &Project{ID: id, WorkspaceID: workspaceID, Name: name}
	const q = `
		UPDATE projects SET name = $1, updated_at = now()
		WHERE id = $2 AND workspace_id = $3 AND ($4 OR user_id = $5)
		RETURNING user_id, created_at, updated_at`
	err := r.db.QueryRowContext(ctx, q, name, id, workspaceID, canManageOrLead, userID).Scan(&p.UserID, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *Repository) Delete(ctx context.Context, id, workspaceID, userID string, canManageWorkspace bool) error {
	const q = `DELETE FROM projects WHERE id = $1 AND workspace_id = $2 AND ($3 OR user_id = $4)`
	res, err := r.db.ExecContext(ctx, q, id, workspaceID, canManageWorkspace, userID)
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

// Get looks up a project by id only (no owner/workspace filter) since it
// also backs cross-service calls (e.g. Task Service checking a project
// exists and belongs to the expected workspace). Callers that need
// ownership/workspace enforcement compare the returned fields themselves.
// userID is used only to populate MyRole (via a LEFT JOIN) — it never
// filters which project is returned.
func (r *Repository) Get(ctx context.Context, id, userID string) (*Project, error) {
	p := &Project{ID: id}
	var myRole sql.NullString
	const q = `
		SELECT p.user_id, p.workspace_id, p.name, p.created_at, p.updated_at, pm.role
		FROM projects p
		LEFT JOIN project_memberships pm ON pm.project_id = p.id AND pm.user_id = $2
		WHERE p.id = $1`
	err := r.db.QueryRowContext(ctx, q, id, userID).Scan(&p.UserID, &p.WorkspaceID, &p.Name, &p.CreatedAt, &p.UpdatedAt, &myRole)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if myRole.Valid {
		role := ProjectRole(myRole.String)
		p.MyRole = &role
	}
	return p, nil
}

// List is workspace-wide for every role, not just the caller's own projects
// — projects are a shared container everyone in the workspace can see, even
// a Member who didn't create them (only mutation is ownership/role-gated).
// userID is used only to populate MyRole (via a LEFT JOIN) on each row.
func (r *Repository) List(ctx context.Context, workspaceID, userID string) ([]*Project, error) {
	const q = `
		SELECT p.id, p.user_id, p.workspace_id, p.name, p.created_at, p.updated_at, pm.role
		FROM projects p
		LEFT JOIN project_memberships pm ON pm.project_id = p.id AND pm.user_id = $2
		WHERE p.workspace_id = $1
		ORDER BY p.created_at DESC`
	rows, err := r.db.QueryContext(ctx, q, workspaceID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []*Project{}
	for rows.Next() {
		p := &Project{}
		var myRole sql.NullString
		if err := rows.Scan(&p.ID, &p.UserID, &p.WorkspaceID, &p.Name, &p.CreatedAt, &p.UpdatedAt, &myRole); err != nil {
			return nil, err
		}
		if myRole.Valid {
			role := ProjectRole(myRole.String)
			p.MyRole = &role
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

// --- Project memberships ---

func (r *Repository) AddProjectMember(ctx context.Context, projectID, userID string, role ProjectRole) (*ProjectMembership, error) {
	m := &ProjectMembership{ID: uuid.NewString(), ProjectID: projectID, UserID: userID, Role: role}
	const q = `
		INSERT INTO project_memberships (id, project_id, user_id, role)
		VALUES ($1, $2, $3, $4)
		RETURNING created_at`
	if err := r.db.QueryRowContext(ctx, q, m.ID, m.ProjectID, m.UserID, m.Role).Scan(&m.CreatedAt); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == uniqueViolationCode {
			return nil, ErrAlreadyMember
		}
		return nil, err
	}
	return m, nil
}

func (r *Repository) ListProjectMembers(ctx context.Context, projectID string) ([]*ProjectMembership, error) {
	const q = `SELECT id, project_id, user_id, role, created_at FROM project_memberships WHERE project_id = $1 ORDER BY created_at`
	rows, err := r.db.QueryContext(ctx, q, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []*ProjectMembership{}
	for rows.Next() {
		m := &ProjectMembership{}
		if err := rows.Scan(&m.ID, &m.ProjectID, &m.UserID, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

// GetProjectMember looks up a single member's row — used to check a
// removal target's role before allowing a Lead (as opposed to
// CanManageWorkspace) to remove them.
func (r *Repository) GetProjectMember(ctx context.Context, projectID, userID string) (*ProjectMembership, error) {
	m := &ProjectMembership{ProjectID: projectID, UserID: userID}
	const q = `SELECT id, role, created_at FROM project_memberships WHERE project_id = $1 AND user_id = $2`
	err := r.db.QueryRowContext(ctx, q, projectID, userID).Scan(&m.ID, &m.Role, &m.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return m, nil
}

func (r *Repository) SetProjectMemberRole(ctx context.Context, projectID, userID string, role ProjectRole) error {
	const q = `UPDATE project_memberships SET role = $1 WHERE project_id = $2 AND user_id = $3`
	res, err := r.db.ExecContext(ctx, q, role, projectID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) RemoveProjectMember(ctx context.Context, projectID, userID string) error {
	const q = `DELETE FROM project_memberships WHERE project_id = $1 AND user_id = $2`
	res, err := r.db.ExecContext(ctx, q, projectID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
