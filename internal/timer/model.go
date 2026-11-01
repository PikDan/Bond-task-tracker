package timer

import "time"

// TimeEntry is the only persisted concept of a "timer": while ended_at is
// NULL the entry is the active timer for that user.
type TimeEntry struct {
	ID        string  `json:"id"`
	UserID    string  `json:"user_id"`
	TaskID    string  `json:"task_id"`
	TaskName  string  `json:"task_name"`
	ProjectID *string `json:"project_id"`
	// WorkspaceID is denormalized from the task this entry is logged
	// against (via TaskClient.GetTask) — never set directly by the caller,
	// so it can never disagree with the task's real workspace.
	WorkspaceID     string     `json:"workspace_id"`
	Description     string     `json:"description"`
	StartedAt       time.Time  `json:"started_at"`
	EndedAt         *time.Time `json:"ended_at"`
	DurationSeconds *int64     `json:"duration_seconds"`
}
