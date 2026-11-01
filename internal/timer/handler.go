package timer

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

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
	r.Group(func(r chi.Router) {
		r.Use(httpx.RequireUserID)
		r.Post("/timers/start", h.start)
		r.Post("/timers/stop", h.stop)
		r.Get("/timers/active", h.active)
		r.Get("/time-entries", h.list)
		r.Get("/time-entries/{id}", h.get)
		r.Patch("/time-entries/{id}", h.updateTimes)
		r.Delete("/time-entries/{id}", h.delete)
	})
}

type startRequest struct {
	TaskID      string `json:"task_id"`
	Description string `json:"description"`
}

func (h *Handler) start(w http.ResponseWriter, r *http.Request) {
	var req startRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.TaskID == "" {
		httpx.Error(w, http.StatusBadRequest, "task_id is required")
		return
	}
	userID := httpx.UserID(r.Context())
	e, err := h.svc.Start(r.Context(), workspaceIDHeader(r), userID, req.TaskID, req.Description)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, e)
}

type stopRequest struct {
	TaskID string `json:"task_id"`
}

func (h *Handler) stop(w http.ResponseWriter, r *http.Request) {
	var req stopRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.TaskID == "" {
		httpx.Error(w, http.StatusBadRequest, "task_id is required")
		return
	}
	userID := httpx.UserID(r.Context())
	e, err := h.svc.Stop(r.Context(), userID, req.TaskID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, e)
}

func (h *Handler) active(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r.Context())
	e, err := h.svc.Active(r.Context(), userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, e)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	e, access, err := h.svc.Get(r.Context(), id, workspaceIDHeader(r), userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	// Don't reveal an entry outside the caller's resolved workspace, or
	// another user's entry within it unless the caller can manage the
	// whole workspace or is the Lead of the entry's project.
	if e.WorkspaceID != access.WorkspaceID {
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
		return
	}
	if e.UserID != userID && !rbac.CanManageWorkspace(access.Role) {
		isLead, err := h.svc.IsProjectLead(r.Context(), e.ProjectID, access.WorkspaceID, userID)
		if err != nil {
			writeErr(w, err)
			return
		}
		if !isLead {
			httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
			return
		}
	}
	httpx.JSON(w, http.StatusOK, e)
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

// workspaceIDHeader is optional — absent means "use my default workspace",
// which is what keeps today's frontend (which never sends this header)
// working unchanged. See Service.resolveAccess.
func workspaceIDHeader(r *http.Request) string {
	return r.Header.Get("X-Workspace-Id")
}

type updateTimesRequest struct {
	StartedAt *string `json:"started_at"`
	EndedAt   *string `json:"ended_at"`
	TaskID    *string `json:"task_id"`
}

func (h *Handler) updateTimes(w http.ResponseWriter, r *http.Request) {
	var req updateTimesRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	startedAt, err := parseOptionalRFC3339(req.StartedAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid 'started_at' (expected RFC3339)")
		return
	}
	endedAt, err := parseOptionalRFC3339(req.EndedAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid 'ended_at' (expected RFC3339)")
		return
	}

	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	e, err := h.svc.UpdateTimes(r.Context(), workspaceIDHeader(r), userID, id, startedAt, endedAt, req.TaskID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, e)
}

func parseOptionalRFC3339(raw *string) (*time.Time, error) {
	if raw == nil {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, *raw)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r.Context())

	from, err := parseTimeParam(r, "from")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid 'from' (expected RFC3339)")
		return
	}
	to, err := parseTimeParam(r, "to")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid 'to' (expected RFC3339)")
		return
	}

	taskID := r.URL.Query().Get("task_id")
	all := r.URL.Query().Get("all") == "true"

	entries, err := h.svc.List(r.Context(), workspaceIDHeader(r), userID, from, to, taskID, all)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, entries)
}

func parseTimeParam(r *http.Request, key string) (*time.Time, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, sql.ErrNoRows):
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
	case errors.Is(err, ErrForbidden):
		httpx.Error(w, http.StatusForbidden, err.Error())
	case errors.Is(err, ErrTaskNotFound):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrActiveTimerExists):
		httpx.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, ErrNoActiveTimer):
		httpx.Error(w, http.StatusNotFound, err.Error())
	case errors.Is(err, ErrTaskMismatch):
		httpx.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, ErrInvalidTimeRange):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrInvalidTaskID):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, "internal error")
	}
}
