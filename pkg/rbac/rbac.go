// Package rbac holds the small set of authorization rules shared across
// project-service, task-service, and timer-service. Each service resolves
// "what role does this caller have in this workspace" for itself (via its
// own workspaceclient.go, calling workspace-service's /workspace-access) —
// this package only answers "given that role, is this action allowed,"
// so the rules live in exactly one place instead of being reimplemented
// three times, inconsistently.
package rbac

// Role mirrors the workspace-service Access.Role values exactly — see
// internal/workspace/model.go. Project Lead is deliberately not modeled yet
// (per-project, not per-workspace; a future addition).
type Role string

const (
	OrgOwner       Role = "OWNER"
	OrgAdmin       Role = "ADMIN"
	WorkspaceAdmin Role = "WORKSPACE_ADMIN"
	Member         Role = "MEMBER"
)

// Access is what a workspaceclient's ResolveAccess call returns: the
// workspace the caller resolved into (either the one they asked for, or
// their lazily-provisioned default) and their role there.
type Access struct {
	WorkspaceID string `json:"workspace_id"`
	OrgID       string `json:"org_id"`
	Role        Role   `json:"role"`
}

// CanManageWorkspace is true for anyone who can change workspace settings,
// create/delete projects, and act on any row (not just their own) within
// the workspace — Organization Owner, Organization Admin, and Workspace
// Admin all collapse to this one capability at the project/task/time-entry
// level; only Member is excluded.
func CanManageWorkspace(role Role) bool {
	switch role {
	case OrgOwner, OrgAdmin, WorkspaceAdmin:
		return true
	default:
		return false
	}
}

// CanSeeAllInWorkspace gates the task/time-entry "?all=true" list mode —
// today it's the exact same set as CanManageWorkspace, but kept as its own
// named predicate since "who can see everything" and "who can mutate
// anything" are different questions that happen to have the same answer
// right now (a future viewer-only role would split them).
func CanSeeAllInWorkspace(role Role) bool {
	return CanManageWorkspace(role)
}
