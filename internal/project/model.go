package project

import "time"

type Project struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	WorkspaceID string    `json:"workspace_id"`
	Name        string    `json:"name"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	// MyRole is the caller's own project_memberships row for this project,
	// if any — populated per-request (never stored), via a LEFT JOIN keyed
	// on the caller's user_id in Repository.List/Get. Lets the frontend know
	// "am I this project's Lead" in the same response that lists/gets the
	// project, with no extra per-row fetch.
	MyRole *ProjectRole `json:"my_role,omitempty"`
}

// ProjectRole is the project_memberships.role enum. LEAD is deliberately
// scoped to one project at a time — distinct from rbac.Role, which is
// workspace/org-wide.
type ProjectRole string

const (
	ProjectRoleLead   ProjectRole = "LEAD"
	ProjectRoleMember ProjectRole = "MEMBER"
)

type ProjectMembership struct {
	ID        string      `json:"id"`
	ProjectID string      `json:"project_id"`
	UserID    string      `json:"user_id"`
	Role      ProjectRole `json:"role"`
	CreatedAt time.Time   `json:"created_at"`
}
