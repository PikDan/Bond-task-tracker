package project

import (
	"context"
	"errors"
	"strings"

	"tracker/pkg/rbac"
)

type Service struct {
	repo            *Repository
	workspaceClient *WorkspaceClient
}

func NewService(repo *Repository, workspaceClient *WorkspaceClient) *Service {
	return &Service{repo: repo, workspaceClient: workspaceClient}
}

// resolveAccess resolves the caller's role for workspaceIDHeader (the raw,
// possibly-empty X-Workspace-Id header value) — empty means "no header
// sent", which falls back to the caller's own default workspace. Every
// public method below calls this first.
func (s *Service) resolveAccess(ctx context.Context, workspaceIDHeader, userID string) (*rbac.Access, error) {
	return s.workspaceClient.ResolveAccess(ctx, workspaceIDHeader, userID)
}

// Create requires CanManageWorkspace — unlike Rename/Delete, a brand new
// project has no existing owner to fall back on, so this is a plain
// allow/deny rather than an owner-or-admin check.
func (s *Service) Create(ctx context.Context, workspaceIDHeader, userID, name string) (*Project, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, err
	}
	if !rbac.CanManageWorkspace(access.Role) {
		return nil, ErrForbidden
	}
	return s.repo.Create(ctx, userID, access.WorkspaceID, name)
}

func (s *Service) Rename(ctx context.Context, id, workspaceIDHeader, userID, name string) (*Project, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, err
	}
	canManageOrLead := rbac.CanManageWorkspace(access.Role)
	if !canManageOrLead {
		isLead, err := s.IsProjectLead(ctx, &id, userID)
		if err != nil {
			return nil, err
		}
		canManageOrLead = isLead
	}
	return s.repo.Rename(ctx, id, access.WorkspaceID, userID, name, canManageOrLead)
}

func (s *Service) Delete(ctx context.Context, id, workspaceIDHeader, userID string) error {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return err
	}
	return s.repo.Delete(ctx, id, access.WorkspaceID, userID, rbac.CanManageWorkspace(access.Role))
}

// Get returns the project only if it belongs to the resolved workspace —
// the handler additionally checks owner-or-CanManageWorkspace-or-Lead before
// exposing it (see handler.go), matching the existing "don't reveal
// another user's project" comment there. The returned Project's MyRole is
// already populated by the repository's LEFT JOIN, so the handler doesn't
// need a separate IsProjectLead call for its own read-side check.
func (s *Service) Get(ctx context.Context, id, workspaceIDHeader, userID string) (*Project, *rbac.Access, error) {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, nil, err
	}
	p, err := s.repo.Get(ctx, id, userID)
	if err != nil {
		return nil, nil, err
	}
	return p, access, nil
}

// List is workspace-wide for every role — see Repository.List's comment.
func (s *Service) List(ctx context.Context, workspaceIDHeader, userID string) ([]*Project, error) {
	access, err := s.resolveAccess(ctx, workspaceIDHeader, userID)
	if err != nil {
		return nil, err
	}
	return s.repo.List(ctx, access.WorkspaceID, userID)
}

// IsProjectLead reports whether userID holds the LEAD role on projectID. A
// nil projectID trivially means false — used by task-service/timer-service's
// own local check (a task/entry with no project can't have a project Lead),
// and here directly for a project itself.
func (s *Service) IsProjectLead(ctx context.Context, projectID *string, userID string) (bool, error) {
	if projectID == nil {
		return false, nil
	}
	m, err := s.repo.GetProjectMember(ctx, *projectID, userID)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return m.Role == ProjectRoleLead, nil
}

// AddProjectMember defaults to MEMBER. Assigning LEAD is a separate,
// stricter action — see Handler.addProjectMember, which is the only place
// that decides whether role=LEAD is allowed for this particular caller.
func (s *Service) AddProjectMember(ctx context.Context, projectID, userID string, role ProjectRole) (*ProjectMembership, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, ErrInvalidName
	}
	if role == "" {
		role = ProjectRoleMember
	}
	return s.repo.AddProjectMember(ctx, projectID, userID, role)
}

func (s *Service) ListProjectMembers(ctx context.Context, projectID string) ([]*ProjectMembership, error) {
	return s.repo.ListProjectMembers(ctx, projectID)
}

func (s *Service) GetProjectMember(ctx context.Context, projectID, userID string) (*ProjectMembership, error) {
	return s.repo.GetProjectMember(ctx, projectID, userID)
}

func (s *Service) SetProjectMemberRole(ctx context.Context, projectID, userID string, role ProjectRole) error {
	return s.repo.SetProjectMemberRole(ctx, projectID, userID, role)
}

func (s *Service) RemoveProjectMember(ctx context.Context, projectID, userID string) error {
	return s.repo.RemoveProjectMember(ctx, projectID, userID)
}
