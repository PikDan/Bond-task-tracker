package workspace

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"tracker/pkg/rbac"
)

const uniqueViolationCode = "23505"

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ResolveAccess looks up the caller's effective role for an already-known
// workspaceID: a direct workspace_memberships row wins if present, otherwise
// falls back to this workspace's own org role — scoped to THIS workspace's
// org_id specifically, never "any org the caller happens to belong to", so
// an admin of one organization can never resolve as having access to a
// different organization's workspace.
func (r *Repository) ResolveAccess(ctx context.Context, workspaceID, userID string) (*rbac.Access, error) {
	var orgID string
	const wsQ = `SELECT org_id FROM workspaces WHERE id = $1`
	if err := r.db.QueryRowContext(ctx, wsQ, workspaceID).Scan(&orgID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	var wsRole WorkspaceRole
	const wmQ = `SELECT role FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2`
	err := r.db.QueryRowContext(ctx, wmQ, workspaceID, userID).Scan(&wsRole)
	if err == nil {
		role := rbac.Member
		if wsRole == WorkspaceRoleAdmin {
			role = rbac.WorkspaceAdmin
		}
		return &rbac.Access{WorkspaceID: workspaceID, OrgID: orgID, Role: role}, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	var orgRole OrgRole
	const omQ = `SELECT role FROM org_memberships WHERE org_id = $1 AND user_id = $2`
	err = r.db.QueryRowContext(ctx, omQ, orgID, userID).Scan(&orgRole)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrForbidden
	}
	if err != nil {
		return nil, err
	}
	role := rbac.OrgAdmin
	if orgRole == OrgRoleOwner {
		role = rbac.OrgOwner
	}
	return &rbac.Access{WorkspaceID: workspaceID, OrgID: orgID, Role: role}, nil
}

// GetOrCreateDefault is the no-workspace-header fallback: get-or-create this
// user_id's one auto-provisioned organization and its one default workspace,
// then return the caller's access to it (always OrgOwner — they own
// whatever they just auto-provisioned, or already owned from a previous
// call).
func (r *Repository) GetOrCreateDefault(ctx context.Context, userID string) (*rbac.Access, error) {
	orgID, err := r.getOrCreateDefaultOrg(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get or create default org: %w", err)
	}
	workspaceID, err := r.getOrCreateDefaultWorkspace(ctx, orgID)
	if err != nil {
		return nil, fmt.Errorf("get or create default workspace: %w", err)
	}
	return &rbac.Access{WorkspaceID: workspaceID, OrgID: orgID, Role: rbac.OrgOwner}, nil
}

const selectDefaultOrgQ = `SELECT id FROM organizations WHERE default_for_user_id = $1`

// getOrCreateDefaultOrg relies on default_for_user_id's UNIQUE constraint
// (NULLs are distinct from each other in Postgres, so this only ever
// matches a real auto-provisioned org) to make concurrent first-requests
// for the same brand-new user_id race-safe: whichever INSERT wins, the
// loser's ON CONFLICT DO NOTHING no-ops and it just reads back what the
// winner created.
func (r *Repository) getOrCreateDefaultOrg(ctx context.Context, userID string) (string, error) {
	var orgID string
	if err := r.db.QueryRowContext(ctx, selectDefaultOrgQ, userID).Scan(&orgID); err == nil {
		return orgID, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	orgID = uuid.NewString()
	const insertOrgQ = `
		INSERT INTO organizations (id, name, owner_user_id, default_for_user_id)
		VALUES ($1, $2, $3, $3)
		ON CONFLICT (default_for_user_id) DO NOTHING`
	res, err := tx.ExecContext(ctx, insertOrgQ, orgID, userID+"'s Organization", userID)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// Lost the race to a concurrent first request for this same userID.
		if err := tx.QueryRowContext(ctx, selectDefaultOrgQ, userID).Scan(&orgID); err != nil {
			return "", err
		}
		return orgID, tx.Commit()
	}

	const insertOwnerQ = `
		INSERT INTO org_memberships (id, org_id, user_id, role)
		VALUES ($1, $2, $3, 'OWNER')`
	if _, err := tx.ExecContext(ctx, insertOwnerQ, uuid.NewString(), orgID, userID); err != nil {
		return "", err
	}

	return orgID, tx.Commit()
}

const selectDefaultWorkspaceQ = `SELECT id FROM workspaces WHERE org_id = $1 AND is_default`

func (r *Repository) getOrCreateDefaultWorkspace(ctx context.Context, orgID string) (string, error) {
	var workspaceID string
	if err := r.db.QueryRowContext(ctx, selectDefaultWorkspaceQ, orgID).Scan(&workspaceID); err == nil {
		return workspaceID, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}

	workspaceID = uuid.NewString()
	const insertQ = `
		INSERT INTO workspaces (id, org_id, name, is_default)
		VALUES ($1, $2, 'Default', true)
		ON CONFLICT DO NOTHING`
	res, err := r.db.ExecContext(ctx, insertQ, workspaceID, orgID)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if err := r.db.QueryRowContext(ctx, selectDefaultWorkspaceQ, orgID).Scan(&workspaceID); err != nil {
			return "", err
		}
	}
	return workspaceID, nil
}

// --- Organizations ---

func (r *Repository) CreateOrganization(ctx context.Context, ownerUserID, name string) (*Organization, error) {
	o := &Organization{ID: uuid.NewString(), Name: name, OwnerUserID: ownerUserID}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	const insertOrgQ = `
		INSERT INTO organizations (id, name, owner_user_id)
		VALUES ($1, $2, $3)
		RETURNING created_at, updated_at`
	if err := tx.QueryRowContext(ctx, insertOrgQ, o.ID, o.Name, o.OwnerUserID).Scan(&o.CreatedAt, &o.UpdatedAt); err != nil {
		return nil, err
	}
	const insertOwnerQ = `INSERT INTO org_memberships (id, org_id, user_id, role) VALUES ($1, $2, $3, 'OWNER')`
	if _, err := tx.ExecContext(ctx, insertOwnerQ, uuid.NewString(), o.ID, ownerUserID); err != nil {
		return nil, err
	}
	return o, tx.Commit()
}

func (r *Repository) GetOrganization(ctx context.Context, id string) (*Organization, error) {
	o := &Organization{ID: id}
	const q = `SELECT name, owner_user_id, default_for_user_id, created_at, updated_at FROM organizations WHERE id = $1`
	err := r.db.QueryRowContext(ctx, q, id).Scan(&o.Name, &o.OwnerUserID, &o.DefaultForUserID, &o.CreatedAt, &o.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return o, nil
}

// ListOrganizationsForUser returns every org this user belongs to (owner or
// admin), for a future workspace/org switcher UI.
func (r *Repository) ListOrganizationsForUser(ctx context.Context, userID string) ([]*Organization, error) {
	const q = `
		SELECT o.id, o.name, o.owner_user_id, o.default_for_user_id, o.created_at, o.updated_at
		FROM organizations o
		JOIN org_memberships m ON m.org_id = o.id
		WHERE m.user_id = $1
		ORDER BY o.created_at`
	rows, err := r.db.QueryContext(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orgs := []*Organization{}
	for rows.Next() {
		o := &Organization{}
		if err := rows.Scan(&o.ID, &o.Name, &o.OwnerUserID, &o.DefaultForUserID, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		orgs = append(orgs, o)
	}
	return orgs, rows.Err()
}

func (r *Repository) RenameOrganization(ctx context.Context, id, name string) (*Organization, error) {
	const q = `UPDATE organizations SET name = $1, updated_at = now() WHERE id = $2 RETURNING owner_user_id, default_for_user_id, created_at, updated_at`
	o := &Organization{ID: id, Name: name}
	err := r.db.QueryRowContext(ctx, q, name, id).Scan(&o.OwnerUserID, &o.DefaultForUserID, &o.CreatedAt, &o.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return o, nil
}

func (r *Repository) DeleteOrganization(ctx context.Context, id string) error {
	const q = `DELETE FROM organizations WHERE id = $1`
	res, err := r.db.ExecContext(ctx, q, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// TransferOwnership demotes the current OWNER to ADMIN and promotes toUserID
// to OWNER, in that order within one transaction — one_owner_per_org only
// ever sees at most one OWNER row at any statement boundary this way.
func (r *Repository) TransferOwnership(ctx context.Context, orgID, fromUserID, toUserID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	const demoteQ = `UPDATE org_memberships SET role = 'ADMIN' WHERE org_id = $1 AND user_id = $2 AND role = 'OWNER'`
	res, err := tx.ExecContext(ctx, demoteQ, orgID, fromUserID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrForbidden
	}

	const promoteQ = `
		INSERT INTO org_memberships (id, org_id, user_id, role)
		VALUES ($1, $2, $3, 'OWNER')
		ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'OWNER'`
	if _, err := tx.ExecContext(ctx, promoteQ, uuid.NewString(), orgID, toUserID); err != nil {
		return err
	}

	const updateOwnerQ = `UPDATE organizations SET owner_user_id = $1, updated_at = now() WHERE id = $2`
	if _, err := tx.ExecContext(ctx, updateOwnerQ, toUserID, orgID); err != nil {
		return err
	}

	return tx.Commit()
}

// --- Org memberships ---

func (r *Repository) AddOrgMember(ctx context.Context, orgID, userID string, role OrgRole) (*OrgMembership, error) {
	m := &OrgMembership{ID: uuid.NewString(), OrgID: orgID, UserID: userID, Role: role}
	const q = `
		INSERT INTO org_memberships (id, org_id, user_id, role)
		VALUES ($1, $2, $3, $4)
		RETURNING created_at`
	if err := r.db.QueryRowContext(ctx, q, m.ID, m.OrgID, m.UserID, m.Role).Scan(&m.CreatedAt); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == uniqueViolationCode {
			return nil, ErrAlreadyMember
		}
		return nil, err
	}
	return m, nil
}

func (r *Repository) ListOrgMembers(ctx context.Context, orgID string) ([]*OrgMembership, error) {
	const q = `SELECT id, org_id, user_id, role, created_at FROM org_memberships WHERE org_id = $1 ORDER BY created_at`
	rows, err := r.db.QueryContext(ctx, q, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []*OrgMembership{}
	for rows.Next() {
		m := &OrgMembership{}
		if err := rows.Scan(&m.ID, &m.OrgID, &m.UserID, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

// SetOrgMemberRole is only ever called with role=ADMIN — promoting/demoting
// to/from OWNER goes through TransferOwnership instead, which is the only
// path that keeps one_owner_per_org satisfied.
func (r *Repository) SetOrgMemberRole(ctx context.Context, orgID, userID string, role OrgRole) error {
	const q = `UPDATE org_memberships SET role = $1 WHERE org_id = $2 AND user_id = $3 AND role != 'OWNER'`
	res, err := r.db.ExecContext(ctx, q, role, orgID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrLastOwner
	}
	return nil
}

func (r *Repository) RemoveOrgMember(ctx context.Context, orgID, userID string) error {
	const q = `DELETE FROM org_memberships WHERE org_id = $1 AND user_id = $2 AND role != 'OWNER'`
	res, err := r.db.ExecContext(ctx, q, orgID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrLastOwner
	}
	return nil
}

// --- Workspaces ---

func (r *Repository) CreateWorkspace(ctx context.Context, orgID, name string) (*Workspace, error) {
	w := &Workspace{ID: uuid.NewString(), OrgID: orgID, Name: name}
	const q = `
		INSERT INTO workspaces (id, org_id, name)
		VALUES ($1, $2, $3)
		RETURNING created_at, updated_at`
	if err := r.db.QueryRowContext(ctx, q, w.ID, w.OrgID, w.Name).Scan(&w.CreatedAt, &w.UpdatedAt); err != nil {
		return nil, err
	}
	return w, nil
}

func (r *Repository) GetWorkspace(ctx context.Context, id string) (*Workspace, error) {
	w := &Workspace{ID: id}
	const q = `SELECT org_id, name, is_default, created_at, updated_at FROM workspaces WHERE id = $1`
	err := r.db.QueryRowContext(ctx, q, id).Scan(&w.OrgID, &w.Name, &w.IsDefault, &w.CreatedAt, &w.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return w, nil
}

func (r *Repository) ListWorkspacesForOrg(ctx context.Context, orgID string) ([]*Workspace, error) {
	const q = `SELECT id, org_id, name, is_default, created_at, updated_at FROM workspaces WHERE org_id = $1 ORDER BY created_at`
	rows, err := r.db.QueryContext(ctx, q, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	workspaces := []*Workspace{}
	for rows.Next() {
		w := &Workspace{}
		if err := rows.Scan(&w.ID, &w.OrgID, &w.Name, &w.IsDefault, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, err
		}
		workspaces = append(workspaces, w)
	}
	return workspaces, rows.Err()
}

func (r *Repository) RenameWorkspace(ctx context.Context, id, name string) (*Workspace, error) {
	const q = `UPDATE workspaces SET name = $1, updated_at = now() WHERE id = $2 RETURNING org_id, is_default, created_at, updated_at`
	w := &Workspace{ID: id, Name: name}
	err := r.db.QueryRowContext(ctx, q, name, id).Scan(&w.OrgID, &w.IsDefault, &w.CreatedAt, &w.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return w, nil
}

func (r *Repository) DeleteWorkspace(ctx context.Context, id string) error {
	const q = `DELETE FROM workspaces WHERE id = $1`
	res, err := r.db.ExecContext(ctx, q, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// --- Workspace memberships ---

func (r *Repository) AddWorkspaceMember(ctx context.Context, workspaceID, userID string, role WorkspaceRole) (*WorkspaceMembership, error) {
	m := &WorkspaceMembership{ID: uuid.NewString(), WorkspaceID: workspaceID, UserID: userID, Role: role}
	const q = `
		INSERT INTO workspace_memberships (id, workspace_id, user_id, role)
		VALUES ($1, $2, $3, $4)
		RETURNING created_at`
	if err := r.db.QueryRowContext(ctx, q, m.ID, m.WorkspaceID, m.UserID, m.Role).Scan(&m.CreatedAt); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == uniqueViolationCode {
			return nil, ErrAlreadyMember
		}
		return nil, err
	}
	return m, nil
}

func (r *Repository) ListWorkspaceMembers(ctx context.Context, workspaceID string) ([]*WorkspaceMembership, error) {
	const q = `SELECT id, workspace_id, user_id, role, created_at FROM workspace_memberships WHERE workspace_id = $1 ORDER BY created_at`
	rows, err := r.db.QueryContext(ctx, q, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []*WorkspaceMembership{}
	for rows.Next() {
		m := &WorkspaceMembership{}
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

func (r *Repository) SetWorkspaceMemberRole(ctx context.Context, workspaceID, userID string, role WorkspaceRole) error {
	const q = `UPDATE workspace_memberships SET role = $1 WHERE workspace_id = $2 AND user_id = $3`
	res, err := r.db.ExecContext(ctx, q, role, workspaceID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) RemoveWorkspaceMember(ctx context.Context, workspaceID, userID string) error {
	const q = `DELETE FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2`
	res, err := r.db.ExecContext(ctx, q, workspaceID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
