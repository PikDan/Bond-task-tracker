package task

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"tracker/pkg/httpx"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Routes(r chi.Router) {
	r.Route("/tasks", func(r chi.Router) {
		r.Use(httpx.RequireUserID)
		r.Post("/", h.create)
		r.Get("/", h.list)
		r.Get("/{id}", h.get)
		r.Patch("/{id}", h.update)
		r.Delete("/{id}", h.delete)
	})
}

type createRequest struct {
	ProjectID *string `json:"project_id"`
	Title     string  `json:"title"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userID := httpx.UserID(r.Context())
	t, err := h.svc.Create(r.Context(), userID, req.ProjectID, req.Title)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, t)
}

type updateRequest struct {
	Title  *string   `json:"title"`
	Status *string   `json:"status"`
	Tags   *[]string `json:"tags"`
	// ProjectID: nil (key omitted) leaves the project untouched. A JSON
	// `null` value ALSO decodes to nil here — indistinguishable from
	// omission — so it does NOT clear the project. To clear it, send
	// `"project_id": ""` (empty string), which is a non-nil pointer. See
	// Service.Update's doc comment for the full explanation.
	ProjectID *string `json:"project_id"`
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	var req updateRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	t, err := h.svc.Update(r.Context(), id, userID, req.Title, req.Status, req.Tags, req.ProjectID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, t)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := httpx.UserID(r.Context())
	t, err := h.svc.Get(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	// Don't reveal another user's task by guessing/enumerating an id.
	if t.UserID != userID {
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, t)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r.Context())
	projectID := r.URL.Query().Get("project_id")
	tasks, err := h.svc.List(r.Context(), userID, projectID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, tasks)
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, sql.ErrNoRows):
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
	case errors.Is(err, ErrProjectNotFound):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrInvalidTitle), errors.Is(err, ErrInvalidStatus):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, "internal error")
	}
}
