package task

import (
	"context"
	"strings"

	"tracker/pkg/rbac"
)

type Service struct {
	repo            *Repository
	projectClient   *ProjectClient
	workspaceClient *WorkspaceClient
}

func NewService(repo *Repository, projectClient *ProjectClient, workspaceClient *WorkspaceClient) *Service {
	return &Service{repo: repo, projectClient: projectClient, workspaceClient: workspaceClient}
}

// resolveAccess resolves the caller's role for workspaceIDHeader (the raw,
// possibly-empty X-Workspace-Id header value) — empty falls back to the
// caller's own default workspace, which is what keeps today's frontend
// (which never sends that header) working unchanged.
func (s *Service) resolveAccess(ctx context.Context, workspaceIDHeader, userID string) (*rbac.Access, error) {
	return s.workspaceClient.ResolveAccess(ctx, workspaceIDHeader, userID)
}

// Create has no role restriction beyond having resolved access at all — any
// role, including Member, creates their own tasks.
func (s *Service) Create(ctx context.Context, workspaceIDHeader, userID string, projectID *string, title string) (*Task, error) {
	title = strings.TrimSpace(title)

	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, err
	}

	normalizedProjectID := normalizeProjectID(projectID)
	if normalizedProjectID != nil {
		if err := s.projectClient.CheckProjectExists(ctx, *normalizedProjectID, access.WorkspaceID, userID); err != nil {
			return nil, err
		}
	}

	t := &Task{
		ProjectID:   normalizedProjectID,
		UserID:      userID,
		WorkspaceID: access.WorkspaceID,
		Title:       title,
		Status:      StatusHold,
		Tags:        []string{},
	}
	if err := s.repo.Create(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

// sameProjectID compares two possibly-nil project ids for equality,
// including both-nil.
func sameProjectID(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// normalizeProjectID treats a nil pointer and a blank/whitespace-only string
// identically as "no project" — a client sending {"project_id": ""} and one
// omitting the key entirely must never diverge in what gets stored.
func normalizeProjectID(projectID *string) *string {
	if projectID == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*projectID)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// Update applies any of title/status/tags/projectID that are non-nil,
// leaving the rest of the task unchanged. projectID follows the same
// normalization as Create: a non-nil pointer to an empty/blank string clears
// the task's project, a non-nil pointer to a non-empty string reassigns it
// (re-validated against Project Service), and nil leaves it untouched.
//
// IMPORTANT wire-format gotcha: a JSON body with `"project_id": null` decodes
// to a nil *string — identical to the key being omitted entirely — so it is
// silently treated as "don't touch", not "clear". To actually clear a task's
// project via this endpoint, the client must send `"project_id": ""` (empty
// string), which decodes to a non-nil pointer and is distinguishable from
// omission. Confirmed by hand while testing this endpoint.
func (s *Service) Update(ctx context.Context, id, workspaceIDHeader, userID string, title *string, status *string, tags *[]string, projectID *string) (*Task, error) {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, err
	}

	t, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	// Not in the caller's resolved workspace at all, or in it but not the
	// task's owner, not able to manage the whole workspace, and not the
	// Lead of the task's current project.
	if t.WorkspaceID != access.WorkspaceID {
		return nil, ErrNotFound
	}
	isOwner := t.UserID == userID
	canManage := rbac.CanManageWorkspace(access.Role)
	isLead := false
	if !isOwner && !canManage && t.ProjectID != nil {
		isLead, err = s.projectClient.IsProjectLead(ctx, *t.ProjectID, access.WorkspaceID, userID)
		if err != nil {
			return nil, err
		}
	}
	if !isOwner && !canManage && !isLead {
		return nil, ErrNotFound
	}
	// A Lead's authority covers editing tasks already in their project, not
	// moving tasks across projects — reassignment stays owner/CanManageWorkspace
	// only. Owner and CanManageWorkspace callers are unaffected.
	if projectID != nil && !isOwner && !canManage {
		normalized := normalizeProjectID(projectID)
		if !sameProjectID(normalized, t.ProjectID) {
			return nil, ErrForbidden
		}
	}

	if title != nil {
		trimmed := strings.TrimSpace(*title)
		if trimmed == "" {
			return nil, ErrInvalidTitle
		}
		t.Title = trimmed
	}
	if status != nil {
		st := Status(*status)
		if !st.Valid() {
			return nil, ErrInvalidStatus
		}
		t.Status = st
	}
	if tags != nil {
		t.Tags = normalizeTags(*tags)
	}
	if projectID != nil {
		normalized := normalizeProjectID(projectID)
		if normalized != nil {
			if err := s.projectClient.CheckProjectExists(ctx, *normalized, access.WorkspaceID, userID); err != nil {
				return nil, err
			}
		}
		t.ProjectID = normalized
	}

	if err := s.repo.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

// normalizeTags trims whitespace, drops empty tags, and removes duplicates
// while preserving first-seen order.
func normalizeTags(tags []string) []string {
	seen := make(map[string]bool, len(tags))
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" || seen[trimmed] {
			continue
		}
		seen[trimmed] = true
		out = append(out, trimmed)
	}
	return out
}

// Delete loads the task first (unlike its previous SQL-conditional form) so
// a project Lead exception can be computed in Go alongside the existing
// owner-or-CanManageWorkspace check — there's no atomicity reason to keep
// the authorization decision in the SQL WHERE clause, and this now matches
// timer-service's Delete, which already has this shape.
func (s *Service) Delete(ctx context.Context, id, workspaceIDHeader, userID string) error {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return err
	}
	t, err := s.repo.Get(ctx, id)
	if err != nil {
		return err
	}
	if t.WorkspaceID != access.WorkspaceID {
		return ErrNotFound
	}
	canDelete := t.UserID == userID || rbac.CanManageWorkspace(access.Role)
	if !canDelete && t.ProjectID != nil {
		isLead, err := s.projectClient.IsProjectLead(ctx, *t.ProjectID, access.WorkspaceID, userID)
		if err != nil {
			return err
		}
		canDelete = isLead
	}
	if !canDelete {
		return ErrNotFound
	}
	return s.repo.Delete(ctx, id, access.WorkspaceID)
}

// Get returns the task plus the resolved Access — the handler checks
// workspace membership and owner-or-CanManageWorkspace-or-Lead before
// exposing it, matching the existing "don't reveal another user's task"
// comment there.
func (s *Service) Get(ctx context.Context, id, workspaceIDHeader, userID string) (*Task, *rbac.Access, error) {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, nil, err
	}
	t, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	return t, access, nil
}

// IsProjectLead is a thin wrapper so handler.go (which only holds *Service,
// not the projectClient directly) can extend its own read-side "don't
// reveal" check with the same Lead exception used by Update/Delete.
func (s *Service) IsProjectLead(ctx context.Context, projectID *string, workspaceID, userID string) (bool, error) {
	if projectID == nil {
		return false, nil
	}
	return s.projectClient.IsProjectLead(ctx, *projectID, workspaceID, userID)
}

// List defaults to the caller's own tasks (Member's only option). all=true
// switches to every task in the workspace, but only takes effect when the
// resolved role is CanSeeAllInWorkspace — a Member passing all=true is
// silently ignored, not an error, so the endpoint's behavior degrades
// gracefully rather than leaking a permission error shape.
func (s *Service) List(ctx context.Context, workspaceIDHeader, userID, projectID string, all bool) ([]*Task, error) {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, err
	}
	if all && rbac.CanSeeAllInWorkspace(access.Role) {
		return s.repo.ListByWorkspace(ctx, access.WorkspaceID, projectID)
	}
	return s.repo.List(ctx, access.WorkspaceID, userID, projectID)
}
