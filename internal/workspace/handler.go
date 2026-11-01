package workspace

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"tracker/pkg/httpx"
	"tracker/pkg/rbac"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Routes(r chi.Router) {
	// Group (not Route) — these need shared middleware without adding a path
	// prefix of their own, same as timer's handler.go, which mounts
	// /timers/* and /time-entries/* side by side the same way.
	r.Group(func(r chi.Router) {
		r.Use(httpx.RequireUserID)

		// The one endpoint project-service/task-service/timer-service call
		// on every request — see workspaceclient.go in each of them.
		r.Get("/workspace-access", h.resolveAccess)

		r.Route("/organizations", func(r chi.Router) {
			r.Post("/", h.createOrganization)
			r.Get("/", h.listOrganizations)
			r.Get("/{id}", h.getOrganization)
			r.Patch("/{id}", h.renameOrganization)
			r.Delete("/{id}", h.deleteOrganization)
			r.Post("/{id}/transfer-owner", h.transferOwnership)
			r.Post("/{id}/members", h.addOrgMember)
			r.Get("/{id}/members", h.listOrgMembers)
			r.Delete("/{id}/members/{userId}", h.removeOrgMember)
		})

		r.Route("/workspaces", func(r chi.Router) {
			r.Post("/", h.createWorkspace)
			r.Get("/", h.listWorkspaces)
			r.Get("/{id}", h.getWorkspace)
			r.Patch("/{id}", h.renameWorkspace)
			r.Delete("/{id}", h.deleteWorkspace)
			r.Post("/{id}/members", h.addWorkspaceMember)
			r.Get("/{id}/members", h.listWorkspaceMembers)
			r.Patch("/{id}/members/{userId}", h.setWorkspaceMemberRole)
			r.Delete("/{id}/members/{userId}", h.removeWorkspaceMember)
		})
	})
}

func (h *Handler) resolveAccess(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r.Context())
	workspaceID := r.URL.Query().Get("workspace_id")
	access, err := h.svc.ResolveAccess(r.Context(), workspaceID, userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, access)
}

type nameRequest struct {
	Name string `json:"name"`
}

func (h *Handler) createOrganization(w http.ResponseWriter, r *http.Request) {
	var req nameRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userID := httpx.UserID(r.Context())
	o, err := h.svc.CreateOrganization(r.Context(), userID, req.Name)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, o)
}

func (h *Handler) listOrganizations(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r.Context())
	orgs, err := h.svc.ListOrganizationsForUser(r.Context(), userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, orgs)
}

func (h *Handler) getOrganization(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	if err := h.requireOrgMember(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	o, err := h.svc.GetOrganization(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, o)
}

func (h *Handler) renameOrganization(w http.ResponseWriter, r *http.Request) {
	var req nameRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	if err := h.requireOrgOwnerOrAdmin(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	o, err := h.svc.RenameOrganization(r.Context(), id, req.Name)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, o)
}

func (h *Handler) deleteOrganization(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	if err := h.requireOrgOwnerOrAdmin(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	if err := h.svc.DeleteOrganization(r.Context(), id); err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

type transferOwnerRequest struct {
	ToUserID string `json:"to_user_id"`
}

func (h *Handler) transferOwnership(w http.ResponseWriter, r *http.Request) {
	var req transferOwnerRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := chi.URLParam(r, "id")
	fromUserID := httpx.UserID(r.Context())
	// TransferOwnership's own demote UPDATE already happens to enforce this
	// (0 rows affected if fromUserID isn't OWNER -> ErrForbidden), but that's
	// an emergent side effect of the SQL, not a readable authorization
	// boundary — check explicitly too.
	if err := h.requireOrgOwner(r, id, fromUserID); err != nil {
		writeErr(w, err)
		return
	}
	if err := h.svc.TransferOwnership(r.Context(), id, fromUserID, req.ToUserID); err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

type addMemberRequest struct {
	UserID string `json:"user_id"`
}

func (h *Handler) addOrgMember(w http.ResponseWriter, r *http.Request) {
	var req addMemberRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	if err := h.requireOrgOwnerOrAdmin(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	m, err := h.svc.AddOrgMember(r.Context(), id, req.UserID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, m)
}

func (h *Handler) listOrgMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	if err := h.requireOrgMember(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	members, err := h.svc.ListOrgMembers(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, members)
}

func (h *Handler) removeOrgMember(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	targetUserID := chi.URLParam(r, "userId")
	userID := httpx.UserID(r.Context())
	if err := h.requireOrgOwnerOrAdmin(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	if err := h.svc.RemoveOrgMember(r.Context(), id, targetUserID); err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

// requireOrgMember checks the caller belongs to orgID at all (any role) —
// the bar for reading org info/membership, not for mutating it.
func (h *Handler) requireOrgMember(r *http.Request, orgID, userID string) error {
	members, err := h.svc.ListOrgMembers(r.Context(), orgID)
	if err != nil {
		return err
	}
	for _, m := range members {
		if m.UserID == userID {
			return nil
		}
	}
	return ErrNotFound
}

// requireOrgOwnerOrAdmin is the bar for org-scoped mutations (rename/delete
// org, add/remove members, create a workspace under it). Deliberately
// separate from ResolveAccess/rbac.CanManageWorkspace — those resolve
// access to a specific WORKSPACE (and a plain Workspace Admin, who has no
// org_memberships row at all, would pass CanManageWorkspace) — using that
// here would let a Workspace Admin rename or delete the whole organization,
// a privilege escalation. Org-scoped actions must only ever be gated by
// this org_memberships-only check.
func (h *Handler) requireOrgOwnerOrAdmin(r *http.Request, orgID, userID string) error {
	members, err := h.svc.ListOrgMembers(r.Context(), orgID)
	if err != nil {
		return err
	}
	for _, m := range members {
		if m.UserID == userID && (m.Role == OrgRoleOwner || m.Role == OrgRoleAdmin) {
			return nil
		}
	}
	return ErrForbidden
}

// requireOrgOwner is the bar for transferring ownership — stricter than
// requireOrgOwnerOrAdmin, an Admin can't transfer an Owner's org.
func (h *Handler) requireOrgOwner(r *http.Request, orgID, userID string) error {
	members, err := h.svc.ListOrgMembers(r.Context(), orgID)
	if err != nil {
		return err
	}
	for _, m := range members {
		if m.UserID == userID && m.Role == OrgRoleOwner {
			return nil
		}
	}
	return ErrForbidden
}

type createWorkspaceRequest struct {
	OrgID string `json:"org_id"`
	Name  string `json:"name"`
}

func (h *Handler) createWorkspace(w http.ResponseWriter, r *http.Request) {
	var req createWorkspaceRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userID := httpx.UserID(r.Context())
	// No workspace exists yet, so this can't go through
	// ResolveAccess/CanManageWorkspace (workspace-scoped) — it's gated by
	// the target org itself, from the request body.
	if err := h.requireOrgOwnerOrAdmin(r, req.OrgID, userID); err != nil {
		writeErr(w, err)
		return
	}
	ws, err := h.svc.CreateWorkspace(r.Context(), req.OrgID, req.Name)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, ws)
}

func (h *Handler) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	orgID := r.URL.Query().Get("org_id")
	if orgID == "" {
		httpx.Error(w, http.StatusBadRequest, "org_id query param is required")
		return
	}
	userID := httpx.UserID(r.Context())
	if err := h.requireOrgMember(r, orgID, userID); err != nil {
		writeErr(w, err)
		return
	}
	workspaces, err := h.svc.ListWorkspacesForOrg(r.Context(), orgID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, workspaces)
}

func (h *Handler) getWorkspace(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	// Reuses the same access resolution the hot-path uses — any role at all
	// (not specifically CanManageWorkspace) is enough to read a workspace.
	if _, err := h.svc.ResolveAccess(r.Context(), id, userID); err != nil {
		writeErr(w, err)
		return
	}
	ws, err := h.svc.GetWorkspace(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, ws)
}

// requireCanManageWorkspace resolves the caller's access to workspaceID and
// checks CanManageWorkspace — the bar for workspace-scoped mutations
// (rename/delete workspace, add/remove/change-role its members). This DOES
// cascade from an org OWNER/ADMIN's membership (ResolveAccess falls back to
// the org role when there's no direct workspace_membership row), which is
// correct here — unlike the org-scoped helpers above, workspace mutations
// are exactly what org owners/admins are supposed to be able to do.
func (h *Handler) requireCanManageWorkspace(r *http.Request, workspaceID, userID string) error {
	access, err := h.svc.ResolveAccess(r.Context(), workspaceID, userID)
	if err != nil {
		return err
	}
	if !rbac.CanManageWorkspace(access.Role) {
		return ErrForbidden
	}
	return nil
}

func (h *Handler) renameWorkspace(w http.ResponseWriter, r *http.Request) {
	var req nameRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	if err := h.requireCanManageWorkspace(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	ws, err := h.svc.RenameWorkspace(r.Context(), id, req.Name)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, ws)
}

func (h *Handler) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	if err := h.requireCanManageWorkspace(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	if err := h.svc.DeleteWorkspace(r.Context(), id); err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

type addWorkspaceMemberRequest struct {
	UserID string        `json:"user_id"`
	Role   WorkspaceRole `json:"role"`
}

func (h *Handler) addWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	var req addWorkspaceMemberRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	if err := h.requireCanManageWorkspace(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	m, err := h.svc.AddWorkspaceMember(r.Context(), id, req.UserID, req.Role)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, m)
}

func (h *Handler) listWorkspaceMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	// Read-only — any resolved role (not specifically CanManageWorkspace) is
	// enough to see who's in the workspace, matching getWorkspace.
	if _, err := h.svc.ResolveAccess(r.Context(), id, userID); err != nil {
		writeErr(w, err)
		return
	}
	members, err := h.svc.ListWorkspaceMembers(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, members)
}

type setRoleRequest struct {
	Role WorkspaceRole `json:"role"`
}

func (h *Handler) setWorkspaceMemberRole(w http.ResponseWriter, r *http.Request) {
	var req setRoleRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := chi.URLParam(r, "id")
	targetUserID := chi.URLParam(r, "userId")
	userID := httpx.UserID(r.Context())
	if err := h.requireCanManageWorkspace(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	if err := h.svc.SetWorkspaceMemberRole(r.Context(), id, targetUserID, req.Role); err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Handler) removeWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	targetUserID := chi.URLParam(r, "userId")
	userID := httpx.UserID(r.Context())
	if err := h.requireCanManageWorkspace(r, id, userID); err != nil {
		writeErr(w, err)
		return
	}
	if err := h.svc.RemoveWorkspaceMember(r.Context(), id, targetUserID); err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, sql.ErrNoRows):
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
	case errors.Is(err, ErrForbidden):
		httpx.Error(w, http.StatusForbidden, err.Error())
	case errors.Is(err, ErrInvalidName):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrLastOwner):
		httpx.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, ErrAlreadyMember):
		httpx.Error(w, http.StatusConflict, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, "internal error")
	}
}
