# Tracker

A personal time-tracking app (Toggl-style): start/stop timers on tasks, organize them into projects and tags, and analyze the time you've logged in a Reports section (summary charts + a detailed, filterable entries table).

## Stack

- **Backend** — Go, split into small services behind a gateway:
  - `gateway` — routes requests to the services below, handles CORS.
  - `project-service`, `task-service`, `timer-service` — each owns its own Postgres database.
- **Frontend** — React + TypeScript + Vite, styled with Tailwind CSS, data fetching via TanStack Query (hooks generated from the API schema with Orval).

## Running locally

The whole stack (3 Postgres databases, 4 Go services, and the Vite dev server) comes up with one command:

```bash
docker compose up
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- API gateway: [http://localhost:8080](http://localhost:8080)

To run a single Go service directly on your host instead (against the same Dockerized databases), see `.env.example` for the env vars each service expects.

## Project layout

```
cmd/            entry points for each Go service (gateway, project/task/timer-service)
internal/       per-service implementation (handler, service, repository, migrations)
pkg/            shared Go packages (config, db helpers, HTTP helpers)
web/            React frontend
deploy/         Dockerfiles for each service
postman/        Postman collection for manually exercising the API
```
