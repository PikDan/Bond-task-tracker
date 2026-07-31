package timer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// TaskClient calls Task Service to validate a task_id before a timer starts
// against it, to fetch the task's project_id/title to denormalize onto the
// TimeEntry, and to auto-transition the task's status on timer start/stop.
type TaskClient struct {
	baseURL string
	http    *http.Client
}

func NewTaskClient(baseURL string) *TaskClient {
	return &TaskClient{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 5 * time.Second},
	}
}

const (
	taskStatusInProgress = "IN_PROGRESS"
	taskStatusHold       = "HOLD"
)

// TaskInfo is the subset of Task Service's task fields Timer Service needs.
type TaskInfo struct {
	ProjectID *string
	TaskName  string
	Status    string
}

type taskView struct {
	ProjectID *string `json:"project_id"`
	Title     string  `json:"title"`
	Status    string  `json:"status"`
}

// GetTask verifies taskID exists and belongs to userID, returning its project_id, title and status.
func (c *TaskClient) GetTask(ctx context.Context, taskID, userID string) (*TaskInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/tasks/"+taskID, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-User-Id", userID)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call task-service: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		var t taskView
		if err := json.NewDecoder(resp.Body).Decode(&t); err != nil {
			return nil, fmt.Errorf("decode task-service response: %w", err)
		}
		return &TaskInfo{ProjectID: t.ProjectID, TaskName: t.Title, Status: t.Status}, nil
	case http.StatusNotFound:
		return nil, ErrTaskNotFound
	default:
		return nil, fmt.Errorf("task-service returned status %d", resp.StatusCode)
	}
}

// SetStatus moves a task to the given status. Called as a best-effort side
// effect of starting/stopping a timer — a failure here does not roll back
// the timer action that already succeeded.
func (c *TaskClient) SetStatus(ctx context.Context, taskID, userID, status string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, c.baseURL+"/tasks/"+taskID,
		strings.NewReader(`{"status":"`+status+`"}`))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-User-Id", userID)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("call task-service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("task-service returned status %d", resp.StatusCode)
	}
	return nil
}
