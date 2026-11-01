package workspace

import (
	"time"

	"tracker/pkg/rbac"
)

type Organization struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// OwnerUserID is the current owner — transferable via TransferOwnership.
	OwnerUserID string `json:"owner_user_id"`
	// DefaultForUserID is set once, at auto-provision time, and never
	// touched again — it identifies "the org this user_id was given the
	// first time they showed up," which is NOT necessarily the same as
	// OwnerUserID once ownership has been transferred. Not exposed over
	// the API; it's bookkeeping for GetOrCreateDefault's race-free upsert.
	DefaultForUserID *string   `json:"-"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type Workspace struct {
	ID    string `json:"id"`
	OrgID string `json:"org_id"`
	Name  string `json:"name"`
	// IsDefault marks the one workspace GetOrCreateDefault always resolves
	// to for that org, even after other workspaces are created later via
	// the regular CRUD routes. At most one true per org (enforced by a
	// partial unique index).
	IsDefault bool      `json:"-"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// OrgRole is the org_memberships.role enum. Note this is a different, wider
// concept than rbac.Role: an org membership grants access across every
// workspace in that org (resolved into rbac.OrgOwner/rbac.OrgAdmin by
// ResolveAccess), not access to one specific workspace.
type OrgRole string

const (
	OrgRoleOwner OrgRole = "OWNER"
	OrgRoleAdmin OrgRole = "ADMIN"
)

type OrgMembership struct {
	ID        string    `json:"id"`
	OrgID     string    `json:"org_id"`
	UserID    string    `json:"user_id"`
	Role      OrgRole   `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// WorkspaceRole is the workspace_memberships.role enum. 'PROJECT_LEAD' is a
// natural future addition here, but per-project (not per-workspace) — it
// would need its own project_memberships table, not a value in this enum.
type WorkspaceRole string

const (
	WorkspaceRoleAdmin  WorkspaceRole = "ADMIN"
	WorkspaceRoleMember WorkspaceRole = "MEMBER"
)

type WorkspaceMembership struct {
	ID          string        `json:"id"`
	WorkspaceID string        `json:"workspace_id"`
	UserID      string        `json:"user_id"`
	Role        WorkspaceRole `json:"role"`
	CreatedAt   time.Time     `json:"created_at"`
}

// Access is the /workspace-access response shape: the workspace resolved
// into (either the one asked for, or the caller's lazily-provisioned
// default), its parent org, and the caller's effective role there. This is
// exactly pkg/rbac's Access type — aliased here so handler.go can encode it
// under a locally-meaningful name without duplicating the struct.
type Access = rbac.Access
