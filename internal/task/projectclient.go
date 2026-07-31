package task

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// ProjectClient calls Project Service to validate a project_id before a task
// is created against it (physically separate databases mean there is no
// real foreign key across project_db/task_db).
type ProjectClient struct {
	baseURL string
	http    *http.Client
}

func NewProjectClient(baseURL string) *ProjectClient {
	return &ProjectClient{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 5 * time.Second},
	}
}

// CheckProjectExists verifies projectID exists and belongs to userID.
// Project Service itself enforces ownership on GET /projects/{id} (returns
// 404 for another user's project), so a 200 here already means "usable by
// this user" and a 404 covers both "missing" and "not yours".
func (c *ProjectClient) CheckProjectExists(ctx context.Context, projectID, userID string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/projects/"+projectID, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-User-Id", userID)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("call project-service: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		return nil
	case http.StatusNotFound:
		return ErrProjectNotFound
	default:
		return fmt.Errorf("project-service returned status %d", resp.StatusCode)
	}
}
