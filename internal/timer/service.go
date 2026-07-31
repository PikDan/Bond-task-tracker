package timer

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"
)

type Service struct {
	repo       *Repository
	taskClient *TaskClient
}

func NewService(repo *Repository, taskClient *TaskClient) *Service {
	return &Service{repo: repo, taskClient: taskClient}
}

func (s *Service) Start(ctx context.Context, userID, taskID, description string) (*TimeEntry, error) {
	info, err := s.taskClient.GetTask(ctx, taskID, userID)
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
		Description: strings.TrimSpace(description),
	}
	if err := s.repo.StartActive(ctx, e); err != nil {
		return nil, err
	}

	// Best-effort auto-transition: starting a timer means work is underway,
	// so move the task to IN_PROGRESS unless it's already there. A failure
	// here does not roll back the timer, which already started successfully.
	if info.Status != taskStatusInProgress {
		if err := s.taskClient.SetStatus(ctx, taskID, userID, taskStatusInProgress); err != nil {
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
	if err := s.taskClient.SetStatus(ctx, taskID, userID, taskStatusHold); err != nil {
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

func (s *Service) Get(ctx context.Context, id string) (*TimeEntry, error) {
	return s.repo.Get(ctx, id)
}

// Delete removes a time entry the caller owns — including the active
// (still-running) one, if any: the partial unique index only cares about how
// many rows have ended_at IS NULL for this user, and removing one can only
// decrease that count, never violate the invariant.
func (s *Service) Delete(ctx context.Context, id, userID string) error {
	e, err := s.repo.Get(ctx, id)
	if err != nil {
		return err
	}
	if e.UserID != userID {
		return ErrNotFound
	}
	return s.repo.Delete(ctx, id, userID)
}

// UpdateTimes lets a user manually correct started_at/ended_at on any entry
// they own — active or already stopped. Providing ended_at on a still-active
// entry closes it out at that time (a manual "stop" with a chosen end time).
// Overlaps with other entries aren't rejected here — that's surfaced only as
// a visual hint on the frontend, matching how overlaps could already occur
// from editing via the raw API.
//
// Optionally also reassigns the entry to a different task (taskID) — used by
// the frontend's bulk-edit split/merge flows. Reassigning re-fetches the
// target task's name/project_id via taskClient (the same call Start makes)
// and overwrites the entry's denormalized copies, so they don't go stale.
// This does not re-trigger the IN_PROGRESS/HOLD auto-transition that
// Start/Stop perform — that transition is about whether a timer is currently
// running for a task, which is orthogonal to a historical entry changing
// which task it belongs to.
func (s *Service) UpdateTimes(ctx context.Context, userID, id string, startedAt, endedAt *time.Time, taskID *string) (*TimeEntry, error) {
	e, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if e.UserID != userID {
		return nil, ErrNotFound
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
		info, err := s.taskClient.GetTask(ctx, trimmed, userID)
		if err != nil {
			return nil, err
		}
		e.TaskID = trimmed
		e.TaskName = info.TaskName
		e.ProjectID = info.ProjectID
	}

	if err := s.repo.UpdateTimes(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

func (s *Service) List(ctx context.Context, userID string, from, to *time.Time, taskID string) ([]*TimeEntry, error) {
	return s.repo.List(ctx, userID, from, to, taskID)
}
