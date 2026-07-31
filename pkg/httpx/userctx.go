package httpx

import (
	"context"
	"net/http"
)

type contextKey int

const userIDKey contextKey = iota

// RequireUserID is a stand-in for auth middleware: until JWT exists, callers
// must pass the acting user explicitly via X-User-Id. Swapping this for a
// JWT-parsing middleware later won't change any downstream handler code.
func RequireUserID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := r.Header.Get("X-User-Id")
		if userID == "" {
			Error(w, http.StatusBadRequest, "missing X-User-Id header")
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UserID(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}
