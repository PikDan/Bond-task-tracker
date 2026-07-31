package project

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
	r.Route("/projects", func(r chi.Router) {
		r.Use(httpx.RequireUserID)
		r.Post("/", h.create)
		r.Get("/", h.list)
		r.Get("/{id}", h.get)
		r.Patch("/{id}", h.rename)
		r.Delete("/{id}", h.delete)
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
	p, err := h.svc.Create(r.Context(), userID, req.Name)
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
	p, err := h.svc.Rename(r.Context(), id, userID, req.Name)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, p)
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
	p, err := h.svc.Get(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	// Don't reveal another user's project by guessing/enumerating an id.
	if p.UserID != userID {
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, p)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r.Context())
	projects, err := h.svc.List(r.Context(), userID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, projects)
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, sql.ErrNoRows):
		httpx.Error(w, http.StatusNotFound, ErrNotFound.Error())
	case errors.Is(err, ErrInvalidName):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, "internal error")
	}
}
