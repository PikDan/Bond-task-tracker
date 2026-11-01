package main

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"tracker/internal/workspace"
	"tracker/pkg/config"
	"tracker/pkg/dbx"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, nil)))

	dsn := config.MustGetEnv("DATABASE_URL")
	port := config.GetEnvOrDefault("PORT", "8084")

	db, err := dbx.Open(dsn)
	if err != nil {
		slog.Error("connect to db", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := workspace.RunMigrations(db); err != nil {
		slog.Error("run migrations", "error", err)
		os.Exit(1)
	}

	handler := workspace.NewHandler(workspace.NewService(workspace.NewRepository(db)))

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	handler.Routes(r)

	slog.Info("workspace-service listening", "port", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}
