package dbx

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// Open connects to Postgres and waits (up to 30s) for it to accept pings,
// since in Docker Compose the DB container may still be initializing when
// the app container starts even with depends_on.
func Open(dsn string) (*sql.DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var lastErr error
	for {
		if lastErr = db.PingContext(ctx); lastErr == nil {
			return db, nil
		}
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("ping db: %w", lastErr)
		case <-time.After(500 * time.Millisecond):
		}
	}
}
