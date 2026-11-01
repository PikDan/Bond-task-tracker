package timer

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"tracker/pkg/rbac"
)

type Service struct {
	repo            *Repository
	taskClient      *TaskClient
	workspaceClient *WorkspaceClient
	projectClient   *ProjectClient
}

func NewService(repo *Repository, taskClient *TaskClient, workspaceClient *WorkspaceClient, projectClient *ProjectClient) *Service {
	return &Service{repo: repo, taskClient: taskClient, workspaceClient: workspaceClient, projectClient: projectClient}
}

// resolveAccess resolves the caller's role for workspaceIDHeader (the raw,
// possibly-empty X-Workspace-Id header value) — empty falls back to the
// caller's own default workspace, which is what keeps today's frontend
// (which never sends that header) working unchanged. Only needed for
// operations on entries that already exist (Get/List/Delete/UpdateTimes) —
// Start/Stop/Active don't call this at all: an entry's workspace is always
// inherited from the task it's started against (see Start below), and
// Task Service is the one enforcing whether the caller may see that task in
// the first place.
func (s *Service) resolveAccess(ctx context.Context, workspaceIDHeader, userID string) (*rbac.Access, error) {
	return s.workspaceClient.ResolveAccess(ctx, workspaceIDHeader, userID)
}

func (s *Service) Start(ctx context.Context, workspaceIDHeader, userID, taskID, description string) (*TimeEntry, error) {
	info, err := s.taskClient.GetTask(ctx, taskID, workspaceIDHeader, userID)
	if err != nil {
		return nil, err
	}

	// Fast pre-check for a friendly 409 message; the partial unique index in
	// the DB is what actually prevents two concurrent starts from both succeeding.
	if _, err := s.repo.GetActive(ctx, userID); err == nil {
		return nil, ErrActiveTimerExists
	} else if !errors.Is(err, ErrNoActiveTimer) {
		return nil, err
	}

	e := &TimeEntry{
		UserID:      userID,
		TaskID:      taskID,
		TaskName:    info.TaskName,
		ProjectID:   info.ProjectID,
		WorkspaceID: info.WorkspaceID,
		Description: strings.TrimSpace(description),
	}
	if err := s.repo.StartActive(ctx, e); err != nil {
		return nil, err
	}

	// Best-effort auto-transition: starting a timer means work is underway,
	// so move the task to IN_PROGRESS unless it's already there. A failure
	// here does not roll back the timer, which already started successfully.
	if info.Status != taskStatusInProgress {
		if err := s.taskClient.SetStatus(ctx, taskID, info.WorkspaceID, userID, taskStatusInProgress); err != nil {
			slog.Warn("failed to auto-transition task to IN_PROGRESS", "task_id", taskID, "error", err)
		}
	}

	return e, nil
}

// Stop requires the caller to name which task's timer they mean to stop —
// not just "whatever is active for this user" — so a stale client can't
// accidentally stop a different task's timer than the one it thinks is running.
func (s *Service) Stop(ctx context.Context, userID, taskID string) (*TimeEntry, error) {
	active, err := s.repo.GetActive(ctx, userID)
	if err != nil {
		return nil, err
	}
	if active.TaskID != taskID {
		return nil, ErrTaskMismatch
	}
	e, err := s.repo.StopActive(ctx, userID, taskID)
	if err != nil {
		return nil, err
	}

	// Best-effort auto-transition: stopping means work paused, so the task
	// goes back to HOLD unconditionally — same non-blocking guarantee as the
	// IN_PROGRESS transition on Start (a failure here doesn't undo the stop).
	if err := s.taskClient.SetStatus(ctx, taskID, e.WorkspaceID, userID, taskStatusHold); err != nil {
		slog.Warn("failed to auto-transition task to HOLD", "task_id", taskID, "error", err)
	}

	return e, nil
}

// Active returns the running entry with duration_seconds computed live
// (elapsed time so far) — it's stored as NULL until the timer actually
// stops, since duration isn't known yet.
func (s *Service) Active(ctx context.Context, userID string) (*TimeEntry, error) {
	e, err := s.repo.GetActive(ctx, userID)
	if err != nil {
		return nil, err
	}
	elapsed := int64(time.Since(e.StartedAt).Seconds())
	e.DurationSeconds = &elapsed
	return e, nil
}

// Get returns the entry plus the resolved Access — the handler checks
// workspace membership and owner-or-CanManageWorkspace before exposing it,
// matching the existing "don't reveal another user's time entry" comment
// there.
func (s *Service) Get(ctx context.Context, id, workspaceIDHeader, userID string) (*TimeEntry, *rbac.Access, error) {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, nil, err
	}
	e, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	return e, access, nil
}

// Delete removes a time entry the caller owns, or — if they can manage the
// whole workspace — any entry in it, including the active (still-running)
// one: the partial unique index only cares about how many rows have
// ended_at IS NULL for the ENTRY'S OWNER, and removing one can only
// decrease that count, never violate the invariant, regardless of who
// triggered the delete.
func (s *Service) Delete(ctx context.Context, id, workspaceIDHeader, userID string) error {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return err
	}
	e, err := s.repo.Get(ctx, id)
	if err != nil {
		return err
	}
	if e.WorkspaceID != access.WorkspaceID {
		return ErrNotFound
	}
	isOwner := e.UserID == userID
	canManage := rbac.CanManageWorkspace(access.Role)
	if !isOwner && !canManage {
		isLead, err := s.isProjectLead(ctx, e.ProjectID, access.WorkspaceID, userID)
		if err != nil {
			return err
		}
		if !isLead {
			return ErrNotFound
		}
	}
	return s.repo.Delete(ctx, id, access.WorkspaceID)
}

// isProjectLead reports whether userID holds the LEAD role on projectID —
// a nil projectID (an entry logged against a task with no project)
// trivially means false.
func (s *Service) isProjectLead(ctx context.Context, projectID *string, workspaceID, userID string) (bool, error) {
	if projectID == nil {
		return false, nil
	}
	return s.projectClient.IsProjectLead(ctx, *projectID, workspaceID, userID)
}

// IsProjectLead is a thin exported wrapper so handler.go (which only holds
// *Service, not the projectClient directly) can extend its own read-side
// "don't reveal" check with the same Lead exception used by
// Delete/UpdateTimes.
func (s *Service) IsProjectLead(ctx context.Context, projectID *string, workspaceID, userID string) (bool, error) {
	return s.isProjectLead(ctx, projectID, workspaceID, userID)
}

// sameProjectID compares two possibly-nil project ids for equality,
// including both-nil.
func sameProjectID(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// UpdateTimes lets a user manually correct started_at/ended_at on any entry
// they own — or, if they can manage the whole workspace, any entry in it —
// active or already stopped. Providing ended_at on a still-active entry
// closes it out at that time (a manual "stop" with a chosen end time).
// Overlaps with other entries aren't rejected here — that's surfaced only as
// a visual hint on the frontend, matching how overlaps could already occur
// from editing via the raw API.
//
// Optionally also reassigns the entry to a different task (taskID) — used by
// the frontend's bulk-edit split/merge flows. Reassigning re-fetches the
// target task's name/project_id/workspace_id via taskClient (the same call
// Start makes) and overwrites the entry's denormalized copies, so they don't
// go stale — the entry follows its new task into that task's own workspace,
// same inheritance rule as Start. This does not re-trigger the
// IN_PROGRESS/HOLD auto-transition that Start/Stop perform — that
// transition is about whether a timer is currently running for a task,
// which is orthogonal to a historical entry changing which task it belongs
// to.
func (s *Service) UpdateTimes(ctx context.Context, workspaceIDHeader, userID, id string, startedAt, endedAt *time.Time, taskID *string) (*TimeEntry, error) {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, err
	}
	e, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if e.WorkspaceID != access.WorkspaceID {
		return nil, ErrNotFound
	}
	isOwner := e.UserID == userID
	canManage := rbac.CanManageWorkspace(access.Role)
	isLeadOnly := false
	if !isOwner && !canManage {
		isLead, err := s.isProjectLead(ctx, e.ProjectID, access.WorkspaceID, userID)
		if err != nil {
			return nil, err
		}
		if !isLead {
			return nil, ErrNotFound
		}
		isLeadOnly = true
	}

	if startedAt != nil {
		e.StartedAt = *startedAt
	}
	if endedAt != nil {
		e.EndedAt = endedAt
	}

	if e.EndedAt != nil && !e.EndedAt.After(e.StartedAt) {
		return nil, ErrInvalidTimeRange
	}

	if e.EndedAt != nil {
		duration := int64(e.EndedAt.Sub(e.StartedAt).Seconds())
		e.DurationSeconds = &duration
	} else {
		e.DurationSeconds = nil
	}

	if taskID != nil {
		trimmed := strings.TrimSpace(*taskID)
		if trimmed == "" {
			return nil, ErrInvalidTaskID
		}
		info, err := s.taskClient.GetTask(ctx, trimmed, access.WorkspaceID, userID)
		if err != nil {
			return nil, err
		}
		// A Lead's authority covers editing entries already in their
		// project, not moving entries across projects — reassignment to a
		// task in a different project stays owner/CanManageWorkspace only.
		if isLeadOnly && !sameProjectID(info.ProjectID, e.ProjectID) {
			return nil, ErrForbidden
		}
		e.TaskID = trimmed
		e.TaskName = info.TaskName
		e.ProjectID = info.ProjectID
		e.WorkspaceID = info.WorkspaceID
	}

	if err := s.repo.UpdateTimes(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

// List defaults to the caller's own entries (Member's only option). all=true
// switches to every entry in the workspace, but only takes effect when the
// resolved role is CanSeeAllInWorkspace — a Member passing all=true is
// silently ignored, not an error, so the endpoint's behavior degrades
// gracefully rather than leaking a permission error shape.
func (s *Service) List(ctx context.Context, workspaceIDHeader, userID string, from, to *time.Time, taskID string, all bool) ([]*TimeEntry, error) {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, err
	}
	if all && rbac.CanSeeAllInWorkspace(access.Role) {
		return s.repo.ListByWorkspace(ctx, access.WorkspaceID, from, to, taskID)
	}
	return s.repo.List(ctx, access.WorkspaceID, userID, from, to, taskID)
}
