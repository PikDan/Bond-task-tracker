package timer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ProjectClient calls Project Service to check whether the caller is a
// project's Lead — used to extend time-entry edit/delete rights to a
// project's Lead even when they're only a plain workspace Member otherwise.
// Timer Service has no other reason to reach Project Service directly (task
// validation goes through TaskClient instead), so this is a narrow client
// with a single method.
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

type projectMemberView struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
}

// IsProjectLead reports whether userID holds the LEAD role on projectID.
// Both 404 (project doesn't exist) and 403 (caller has no visibility into
// this project's membership at all) map to false, nil, not an error — a
// caller who can't even see the members list trivially isn't its Lead.
// Only a transport, decode, or unexpected-status failure is a hard error
// (fail-closed, matching TaskClient.GetTask's convention) — a broken
// project-service call blocks the mutation rather than silently allowing it.
func (c *ProjectClient) IsProjectLead(ctx context.Context, projectID, workspaceID, userID string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/projects/"+projectID+"/members", nil)
	if err != nil {
		return false, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-User-Id", userID)
	req.Header.Set("X-Workspace-Id", workspaceID)

	resp, err := c.http.Do(req)
	if err != nil {
		return false, fmt.Errorf("call project-service: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		var members []projectMemberView
		if err := json.NewDecoder(resp.Body).Decode(&members); err != nil {
			return false, fmt.Errorf("decode project-service response: %w", err)
		}
		for _, m := range members {
			if m.UserID == userID && m.Role == "LEAD" {
				return true, nil
			}
		}
		return false, nil
	case http.StatusNotFound, http.StatusForbidden:
		return false, nil
	default:
		return false, fmt.Errorf("project-service returned status %d", resp.StatusCode)
	}
}
