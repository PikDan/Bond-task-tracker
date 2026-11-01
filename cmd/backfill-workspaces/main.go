// backfill-workspaces is a standalone, one-off command — not a
// golang-migrate migration, since it needs live HTTP calls to
// workspace-service plus three separate live databases, which doesn't fit
// the "static SQL against one already-known DB" shape every migration in
// this repo assumes.
//
// Run once, after project-service/task-service/timer-service have deployed
// their new nullable workspace_id column (see each service's
// "..._add_workspace_id" migration) but before anything relies on
// workspace-scoped List queries actually finding pre-existing rows — see
// the rollout runbook in the org/workspace RBAC plan.
//
// Naturally idempotent/re-runnable via the `WHERE workspace_id IS NULL`
// predicate: running it twice (or after new unbackfilled rows appear from
// before this feature existed) only ever touches rows still missing a
// workspace_id.
package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"tracker/pkg/config"
	"tracker/pkg/dbx"
)

type target struct {
	service string
	dsnEnv  string
	table   string
}

// Each of the three DBs is queried independently for its own distinct
// user_ids — a user might have rows in one table but not another, so there
// is no single shared "list of users" to compute once.
var targets = []target{
	{service: "project-service", dsnEnv: "PROJECT_DATABASE_URL", table: "projects"},
	{service: "task-service", dsnEnv: "TASK_DATABASE_URL", table: "tasks"},
	{service: "timer-service", dsnEnv: "TIMER_DATABASE_URL", table: "time_entries"},
}

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, nil)))

	dryRun := flag.Bool("dry-run", false, "print what would change without writing anything")
	flag.Parse()

	workspaceServiceURL := config.MustGetEnv("WORKSPACE_SERVICE_URL")
	httpClient := &http.Client{Timeout: 5 * time.Second}

	for _, t := range targets {
		if err := backfillTable(httpClient, workspaceServiceURL, config.MustGetEnv(t.dsnEnv), t.table, *dryRun); err != nil {
			slog.Error("backfill failed", "service", t.service, "table", t.table, "error", err)
			os.Exit(1)
		}
	}
}

func backfillTable(httpClient *http.Client, workspaceServiceURL, dsn, table string, dryRun bool) error {
	db, err := dbx.Open(dsn)
	if err != nil {
		return fmt.Errorf("open %s db: %w", table, err)
	}
	defer db.Close()

	userIDs, err := distinctUnbackfilledUsers(db, table)
	if err != nil {
		return fmt.Errorf("query distinct user_ids from %s: %w", table, err)
	}
	slog.Info("found users with unbackfilled rows", "table", table, "count", len(userIDs))

	for _, userID := range userIDs {
		workspaceID, err := resolveDefaultWorkspace(httpClient, workspaceServiceURL, userID)
		if err != nil {
			return fmt.Errorf("resolve default workspace for user %q: %w", userID, err)
		}

		if dryRun {
			slog.Info("[dry-run] would backfill", "table", table, "user_id", userID, "workspace_id", workspaceID)
			continue
		}

		n, err := backfillUser(db, table, userID, workspaceID)
		if err != nil {
			return fmt.Errorf("update %s for user %q: %w", table, userID, err)
		}
		slog.Info("backfilled", "table", table, "user_id", userID, "workspace_id", workspaceID, "rows", n)
	}

	return nil
}

func distinctUnbackfilledUsers(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf(`SELECT DISTINCT user_id FROM %s WHERE workspace_id IS NULL`, table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userIDs []string
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		userIDs = append(userIDs, userID)
	}
	return userIDs, rows.Err()
}

func backfillUser(db *sql.DB, table, userID, workspaceID string) (int64, error) {
	q := fmt.Sprintf(`UPDATE %s SET workspace_id = $1 WHERE workspace_id IS NULL AND user_id = $2`, table)
	res, err := db.Exec(q, workspaceID, userID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

type accessResponse struct {
	WorkspaceID string `json:"workspace_id"`
}

// resolveDefaultWorkspace calls workspace-service's GET /workspace-access
// with no workspace_id query param — the exact same get-or-create path the
// runtime fallback (Service.resolveAccess in each of project/task/timer)
// uses when a request arrives with no X-Workspace-Id header. Reusing it
// here means there is exactly one place that knows how to auto-provision a
// user's default org+workspace, not a second copy of that logic.
func resolveDefaultWorkspace(httpClient *http.Client, baseURL, userID string) (string, error) {
	req, err := http.NewRequest(http.MethodGet, baseURL+"/workspace-access", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-User-Id", userID)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("workspace-service returned status %d", resp.StatusCode)
	}
	var a accessResponse
	if err := json.NewDecoder(resp.Body).Decode(&a); err != nil {
		return "", err
	}
	return a.WorkspaceID, nil
}
