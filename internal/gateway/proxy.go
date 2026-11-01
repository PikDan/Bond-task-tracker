package gateway

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Targets holds the upstream base URLs the gateway proxies to. The gateway
// carries no business logic of its own — just path-based routing (and, once
// auth exists, that's the natural place for JWT validation to live).
type Targets struct {
	ProjectServiceURL   string
	TaskServiceURL      string
	TimerServiceURL     string
	WorkspaceServiceURL string
}

func Routes(r chi.Router, t Targets) error {
	projectProxy, err := newProxy(t.ProjectServiceURL)
	if err != nil {
		return err
	}
	taskProxy, err := newProxy(t.TaskServiceURL)
	if err != nil {
		return err
	}
	timerProxy, err := newProxy(t.TimerServiceURL)
	if err != nil {
		return err
	}
	workspaceProxy, err := newProxy(t.WorkspaceServiceURL)
	if err != nil {
		return err
	}

	r.Handle("/api/projects", projectProxy)
	r.Handle("/api/projects/*", projectProxy)
	r.Handle("/api/tasks", taskProxy)
	r.Handle("/api/tasks/*", taskProxy)
	r.Handle("/api/timers/*", timerProxy)
	r.Handle("/api/time-entries", timerProxy)
	r.Handle("/api/time-entries/*", timerProxy)
	r.Handle("/api/workspace-access", workspaceProxy)
	r.Handle("/api/organizations", workspaceProxy)
	r.Handle("/api/organizations/*", workspaceProxy)
	r.Handle("/api/workspaces", workspaceProxy)
	r.Handle("/api/workspaces/*", workspaceProxy)

	return nil
}

// newProxy builds a reverse proxy that forwards to target with the leading
// "/api" stripped from the request path (client calls /api/projects/123,
// upstream sees /projects/123).
func newProxy(target string) (*httputil.ReverseProxy, error) {
	u, err := url.Parse(target)
	if err != nil {
		return nil, err
	}
	return &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = u.Scheme
			req.URL.Host = u.Host
			req.URL.Path = strings.TrimPrefix(req.URL.Path, "/api")
			req.Host = u.Host
		},
	}, nil
}
