package project

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"tracker/pkg/rbac"
)

// WorkspaceClient calls Workspace Service to resolve the caller's role for a
// workspace — or, when no specific workspace was requested, their own
// lazily-provisioned default. Called on every Service method (see
// service.go), so its timeout is shorter than ProjectClient/TaskClient's 5s
// convention elsewhere in the repo.
type WorkspaceClient struct {
	baseURL string
	http    *http.Client
}

func NewWorkspaceClient(baseURL string) *WorkspaceClient {
	return &WorkspaceClient{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 3 * time.Second},
	}
}

// ResolveAccess resolves the caller's role for workspaceID — or, if
// workspaceID is empty (no X-Workspace-Id header on the incoming request),
// their own default workspace. Both a 404 (the workspace doesn't exist) and
// a 403 (it exists, but the caller has no membership in it or its org) from
// Workspace Service mean the caller has no access to that specific
// workspace at all.
func (c *WorkspaceClient) ResolveAccess(ctx context.Context, workspaceID, userID string) (*rbac.Access, error) {
	url := c.baseURL + "/workspace-access"
	if workspaceID != "" {
		url += "?workspace_id=" + workspaceID
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-User-Id", userID)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call workspace-service: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		var access rbac.Access
		if err := json.NewDecoder(resp.Body).Decode(&access); err != nil {
			return nil, fmt.Errorf("decode workspace-service response: %w", err)
		}
		return &access, nil
	case http.StatusNotFound, http.StatusForbidden:
		return nil, ErrForbidden
	default:
		return nil, fmt.Errorf("workspace-service returned status %d", resp.StatusCode)
	}
}
