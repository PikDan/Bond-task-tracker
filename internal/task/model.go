package task

import "time"

type Status string

const (
	StatusHold       Status = "HOLD"
	StatusInProgress Status = "IN_PROGRESS"
	StatusDone       Status = "DONE"
)

func (s Status) Valid() bool {
	switch s {
	case StatusHold, StatusInProgress, StatusDone:
		return true
	default:
		return false
	}
}

type Task struct {
	ID        string    `json:"id"`
	ProjectID *string   `json:"project_id"`
	UserID    string    `json:"user_id"`
	Title     string    `json:"title"`
	Status    Status    `json:"status"`
	Tags      []string  `json:"tags"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
