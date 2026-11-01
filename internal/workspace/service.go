package workspace

import (
	"context"
	"strings"

	"tracker/pkg/rbac"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// ResolveAccess is what project/task/timer's workspaceclient.go calls on
// every request: workspaceID given (from an optional X-Workspace-Id header)
// resolves against that specific workspace; empty falls back to the
// caller's lazily-provisioned default — the path every request from
// today's frontend takes, since it never sends that header.
func (s *Service) ResolveAccess(ctx context.Context, workspaceID, userID string) (*rbac.Access, error) {
	if workspaceID == "" {
		return s.repo.GetOrCreateDefault(ctx, userID)
	}
	return s.repo.ResolveAccess(ctx, workspaceID, userID)
}

func (s *Service) CreateOrganization(ctx context.Context, ownerUserID, name string) (*Organization, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	return s.repo.CreateOrganization(ctx, ownerUserID, name)
}

func (s *Service) GetOrganization(ctx context.Context, id string) (*Organization, error) {
	return s.repo.GetOrganization(ctx, id)
}

func (s *Service) ListOrganizationsForUser(ctx context.Context, userID string) ([]*Organization, error) {
	return s.repo.ListOrganizationsForUser(ctx, userID)
}

func (s *Service) RenameOrganization(ctx context.Context, id, name string) (*Organization, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	return s.repo.RenameOrganization(ctx, id, name)
}

func (s *Service) DeleteOrganization(ctx context.Context, id string) error {
	return s.repo.DeleteOrganization(ctx, id)
}

func (s *Service) TransferOwnership(ctx context.Context, orgID, fromUserID, toUserID string) error {
	toUserID = strings.TrimSpace(toUserID)
	if toUserID == "" {
		return ErrInvalidName
	}
	return s.repo.TransferOwnership(ctx, orgID, fromUserID, toUserID)
}

// AddOrgMember only ever grants ADMIN — OWNER is assigned exactly once, at
// org creation, and moved only via TransferOwnership.
func (s *Service) AddOrgMember(ctx context.Context, orgID, userID string) (*OrgMembership, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, ErrInvalidName
	}
	return s.repo.AddOrgMember(ctx, orgID, userID, OrgRoleAdmin)
}

func (s *Service) ListOrgMembers(ctx context.Context, orgID string) ([]*OrgMembership, error) {
	return s.repo.ListOrgMembers(ctx, orgID)
}

func (s *Service) RemoveOrgMember(ctx context.Context, orgID, userID string) error {
	return s.repo.RemoveOrgMember(ctx, orgID, userID)
}

func (s *Service) CreateWorkspace(ctx context.Context, orgID, name string) (*Workspace, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	return s.repo.CreateWorkspace(ctx, orgID, name)
}

func (s *Service) GetWorkspace(ctx context.Context, id string) (*Workspace, error) {
	return s.repo.GetWorkspace(ctx, id)
}

func (s *Service) ListWorkspacesForOrg(ctx context.Context, orgID string) ([]*Workspace, error) {
	return s.repo.ListWorkspacesForOrg(ctx, orgID)
}

func (s *Service) RenameWorkspace(ctx context.Context, id, name string) (*Workspace, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	return s.repo.RenameWorkspace(ctx, id, name)
}

func (s *Service) DeleteWorkspace(ctx context.Context, id string) error {
	return s.repo.DeleteWorkspace(ctx, id)
}

// AddWorkspaceMember defaults to MEMBER — the caller can promote via
// SetWorkspaceMemberRole afterward.
func (s *Service) AddWorkspaceMember(ctx context.Context, workspaceID, userID string, role WorkspaceRole) (*WorkspaceMembership, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, ErrInvalidName
	}
	if role == "" {
		role = WorkspaceRoleMember
	}
	return s.repo.AddWorkspaceMember(ctx, workspaceID, userID, role)
}

func (s *Service) ListWorkspaceMembers(ctx context.Context, workspaceID string) ([]*WorkspaceMembership, error) {
	return s.repo.ListWorkspaceMembers(ctx, workspaceID)
}

func (s *Service) SetWorkspaceMemberRole(ctx context.Context, workspaceID, userID string, role WorkspaceRole) error {
	return s.repo.SetWorkspaceMemberRole(ctx, workspaceID, userID, role)
}

func (s *Service) RemoveWorkspaceMember(ctx context.Context, workspaceID, userID string) error {
	return s.repo.RemoveWorkspaceMember(ctx, workspaceID, userID)
}
