package task

import "errors"

var (
	ErrNotFound        = errors.New("task not found")
	ErrInvalidTitle    = errors.New("title must not be empty")
	ErrInvalidStatus   = errors.New("invalid status")
	ErrProjectNotFound = errors.New("project not found")
	// ErrForbidden covers both "no access to this workspace at all" (from
	// WorkspaceClient.ResolveAccess) and "access, but not enough role".
	ErrForbidden = errors.New("forbidden")
	// ErrProjectWorkspaceMismatch guards against attaching a task to a
	// project that belongs to a different workspace than the task itself.
	ErrProjectWorkspaceMismatch = errors.New("project belongs to a different workspace")
)
