package timer

import "errors"

var (
	ErrNotFound          = errors.New("time entry not found")
	ErrTaskNotFound      = errors.New("task not found")
	ErrActiveTimerExists = errors.New("an active timer already exists for this user")
	ErrNoActiveTimer     = errors.New("no active timer for this user")
	ErrTaskMismatch      = errors.New("active timer belongs to a different task")
	ErrInvalidTimeRange  = errors.New("ended_at must be after started_at")
	ErrInvalidTaskID     = errors.New("task_id must not be empty")
)
