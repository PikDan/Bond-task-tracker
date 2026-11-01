package task

import (
	"context"
	"encoding/json"
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

type projectView struct {
	WorkspaceID string `json:"workspace_id"`
}

// CheckProjectExists verifies projectID exists, belongs to userID, AND
// belongs to workspaceID — without the workspace check, RBAC would happily
// let a task attach to a project from an unrelated workspace. Project
// Service itself enforces ownership on GET /projects/{id} (returns 404 for
// another user's project), so a 200 here already means "usable by this
// user"; the workspace comparison is this method's own job on top of that.
func (c *ProjectClient) CheckProjectExists(ctx context.Context, projectID, workspaceID, userID string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/projects/"+projectID, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-User-Id", userID)
	// Forward the caller's own already-resolved workspace so Project
	// Service resolves access against that exact workspace, rather than
	// independently falling back to its own default for this same user.
	req.Header.Set("X-Workspace-Id", workspaceID)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("call project-service: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		var p projectView
		if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
			return fmt.Errorf("decode project-service response: %w", err)
		}
		if p.WorkspaceID != workspaceID {
			return ErrProjectWorkspaceMismatch
		}
		return nil
	case http.StatusNotFound:
		return ErrProjectNotFound
	default:
		return fmt.Errorf("project-service returned status %d", resp.StatusCode)
	}
}

type projectMemberView struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
}

// IsProjectLead reports whether userID holds the LEAD role on projectID —
// used to extend task edit/delete rights to a project's Lead even when
// they're only a plain workspace Member otherwise. Both 404 (project
// doesn't exist) and 403 (caller has no visibility into this project's
// membership at all) map to false, nil, not an error — a caller who can't
// even see the members list trivially isn't its Lead. Only a transport,
// decode, or unexpected-status failure is a hard error, matching
// CheckProjectExists's fail-closed convention (a broken project-service
// call blocks the mutation rather than silently allowing it).
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
