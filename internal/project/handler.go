package project

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
	r.Route("/projects", func(r chi.Router) {
		r.Use(httpx.RequireUserID)
		r.Post("/", h.create)
		r.Get("/", h.list)
		r.Get("/{id}", h.get)
		r.Patch("/{id}", h.rename)
		r.Delete("/{id}", h.delete)
		r.Post("/{id}/members", h.addMember)
		r.Get("/{id}/members", h.listMembers)
		r.Patch("/{id}/members/{userId}", h.setMemberRole)
		r.Delete("/{id}/members/{userId}", h.removeMember)
	})
}

type upsertRequest struct {
	Name string `json:"name"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req upsertRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userID := httpx.UserID(r.Context())
	p, err := h.svc.Create(r.Context(), workspaceIDHeader(r), userID, req.Name)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, p)
}

func (h *Handler) rename(w http.ResponseWriter, r *http.Request) {
	var req upsertRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	p, err := h.svc.Rename(r.Context(), id, workspaceIDHeader(r), userID, req.Name)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, p)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	if err := h.svc.Delete(r.Context(), id, workspaceIDHeader(r), userID); err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	p, access, err := h.svc.Get(r.Context(), id, workspaceIDHeader(r), userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	isLead := p.MyRole != nil && *p.MyRole == ProjectRoleLead
	// Don't reveal a project outside the caller's resolved workspace, or
	// another user's project within it unless the caller can manage the
	// whole workspace or is this project's Lead.
	if p.WorkspaceID != access.WorkspaceID || (p.UserID != userID && !rbac.CanManageWorkspace(access.Role) && !isLead) {
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, p)
}

type addProjectMemberRequest struct {
	UserID string      `json:"user_id"`
	Role   ProjectRole `json:"role"`
}

func (h *Handler) addMember(w http.ResponseWriter, r *http.Request) {
	var req addProjectMemberRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	access, err := h.svc.resolveAccess(r.Context(), workspaceIDHeader(r), userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	canManage := rbac.CanManageWorkspace(access.Role)
	role := req.Role
	if role == "" {
		role = ProjectRoleMember
	}
	// Assigning LEAD is a Workspace Admin+ action only — a Lead adding a
	// participant can never make them a co-Lead in the same call.
	if role == ProjectRoleLead && !canManage {
		writeErr(w, ErrForbidden)
		return
	}
	if !canManage {
		isLead, err := h.svc.IsProjectLead(r.Context(), &id, userID)
		if err != nil {
			writeErr(w, err)
			return
		}
		if !isLead {
			writeErr(w, ErrForbidden)
			return
		}
	}
	m, err := h.svc.AddProjectMember(r.Context(), id, req.UserID, role)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, m)
}

func (h *Handler) listMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	// Same visibility bar as get: owner-or-CanManageWorkspace-or-Lead — not
	// "any workspace member", to stay consistent with how a single project
	// is already gated for reads.
	p, access, err := h.svc.Get(r.Context(), id, workspaceIDHeader(r), userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	isLead := p.MyRole != nil && *p.MyRole == ProjectRoleLead
	if p.WorkspaceID != access.WorkspaceID || (p.UserID != userID && !rbac.CanManageWorkspace(access.Role) && !isLead) {
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
		return
	}
	members, err := h.svc.ListProjectMembers(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, members)
}

type setProjectMemberRoleRequest struct {
	Role ProjectRole `json:"role"`
}

// setMemberRole is the only way to promote a participant to LEAD or demote
// a LEAD back to MEMBER — "Workspace Admin assigns Lead" — so it requires
// CanManageWorkspace only, never a Lead's own authority.
func (h *Handler) setMemberRole(w http.ResponseWriter, r *http.Request) {
	var req setProjectMemberRoleRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := chi.URLParam(r, "id")
	targetUserID := chi.URLParam(r, "userId")
	userID := httpx.UserID(r.Context())
	access, err := h.svc.resolveAccess(r.Context(), workspaceIDHeader(r), userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	if !rbac.CanManageWorkspace(access.Role) {
		writeErr(w, ErrForbidden)
		return
	}
	if err := h.svc.SetProjectMemberRole(r.Context(), id, targetUserID, req.Role); err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Handler) removeMember(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	targetUserID := chi.URLParam(r, "userId")
	userID := httpx.UserID(r.Context())
	access, err := h.svc.resolveAccess(r.Context(), workspaceIDHeader(r), userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	canManage := rbac.CanManageWorkspace(access.Role)
	if !canManage {
		isLead, err := h.svc.IsProjectLead(r.Context(), &id, userID)
		if err != nil {
			writeErr(w, err)
			return
		}
		if !isLead {
			writeErr(w, ErrForbidden)
			return
		}
		// A Lead can remove plain participants but not another Lead (or
		// demote themselves this way) — that would bypass setMemberRole's
		// exclusivity. Only CanManageWorkspace can remove a LEAD row.
		target, err := h.svc.GetProjectMember(r.Context(), id, targetUserID)
		if err != nil {
			writeErr(w, err)
			return
		}
		if target.Role == ProjectRoleLead {
			writeErr(w, ErrForbidden)
			return
		}
	}
	if err := h.svc.RemoveProjectMember(r.Context(), id, targetUserID); err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r.Context())
	projects, err := h.svc.List(r.Context(), workspaceIDHeader(r), userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, projects)
}

// workspaceIDHeader is optional — absent means "use my default workspace",
// which is what keeps today's frontend (which never sends this header)
// working unchanged. See Service.resolveAccess.
func workspaceIDHeader(r *http.Request) string {
	return r.Header.Get("X-Workspace-Id")
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, sql.ErrNoRows):
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
	case errors.Is(err, ErrForbidden):
		httpx.Error(w, http.StatusForbidden, err.Error())
	case errors.Is(err, ErrInvalidName):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrAlreadyMember):
		httpx.Error(w, http.StatusConflict, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, "internal error")
	}
}
