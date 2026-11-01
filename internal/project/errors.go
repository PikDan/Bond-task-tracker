package project

import "errors"

var (
	ErrNotFound    = errors.New("project not found")
	ErrInvalidName = errors.New("name must not be empty")
	// ErrForbidden covers both "no access to this workspace at all" (from
	// WorkspaceClient.ResolveAccess) and "access to the workspace, but not
	// enough role to do this" (e.g. a Member trying to create a project).
	ErrForbidden = errors.New("forbidden")
	// ErrAlreadyMember guards AddProjectMember: re-adding an existing
	// participant hits uq_project_memberships_project_user — translated
	// here into a friendly error instead of a raw unique-violation 500.
	ErrAlreadyMember = errors.New("user is already a participant")
)
