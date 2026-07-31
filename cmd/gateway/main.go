package main

import (
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"tracker/internal/gateway"
	"tracker/pkg/config"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, nil)))

	port := config.GetEnvOrDefault("PORT", "8080")
	targets := gateway.Targets{
		ProjectServiceURL: config.MustGetEnv("PROJECT_SERVICE_URL"),
		TaskServiceURL:    config.MustGetEnv("TASK_SERVICE_URL"),
		TimerServiceURL:   config.MustGetEnv("TIMER_SERVICE_URL"),
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	// Frontend dev server (Vite, localhost:5173) is a different origin than
	// the Gateway (localhost:8080) — browsers enforce CORS for that.
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   strings.Split(config.GetEnvOrDefault("CORS_ALLOWED_ORIGINS", "http://localhost:5173"), ","),
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "X-User-Id"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	gateway.DocsRoutes(r)

	if err := gateway.Routes(r, targets); err != nil {
		slog.Error("configure gateway routes", "error", err)
		os.Exit(1)
	}

	slog.Info("gateway listening", "port", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}
