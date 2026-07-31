package task

import (
	"context"
	"strings"
)

type Service struct {
	repo          *Repository
	projectClient *ProjectClient
}

func NewService(repo *Repository, projectClient *ProjectClient) *Service {
	return &Service{repo: repo, projectClient: projectClient}
}

func (s *Service) Create(ctx context.Context, userID string, projectID *string, title string) (*Task, error) {
	title = strings.TrimSpace(title)

	normalizedProjectID := normalizeProjectID(projectID)
	if normalizedProjectID != nil {
		if err := s.projectClient.CheckProjectExists(ctx, *normalizedProjectID, userID); err != nil {
			return nil, err
		}
	}

	t := &Task{
		ProjectID: normalizedProjectID,
		UserID:    userID,
		Title:     title,
		Status:    StatusHold,
		Tags:      []string{},
	}
	if err := s.repo.Create(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

// normalizeProjectID treats a nil pointer and a blank/whitespace-only string
// identically as "no project" — a client sending {"project_id": ""} and one
// omitting the key entirely must never diverge in what gets stored.
func normalizeProjectID(projectID *string) *string {
	if projectID == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*projectID)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// Update applies any of title/status/tags/projectID that are non-nil,
// leaving the rest of the task unchanged. projectID follows the same
// normalization as Create: a non-nil pointer to an empty/blank string clears
// the task's project, a non-nil pointer to a non-empty string reassigns it
// (re-validated against Project Service), and nil leaves it untouched.
//
// IMPORTANT wire-format gotcha: a JSON body with `"project_id": null` decodes
// to a nil *string — identical to the key being omitted entirely — so it is
// silently treated as "don't touch", not "clear". To actually clear a task's
// project via this endpoint, the client must send `"project_id": ""` (empty
// string), which decodes to a non-nil pointer and is distinguishable from
// omission. Confirmed by hand while testing this endpoint.
func (s *Service) Update(ctx context.Context, id, userID string, title *string, status *string, tags *[]string, projectID *string) (*Task, error) {
	t, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if t.UserID != userID {
		return nil, ErrNotFound
	}

	if title != nil {
		trimmed := strings.TrimSpace(*title)
		if trimmed == "" {
			return nil, ErrInvalidTitle
		}
		t.Title = trimmed
	}
	if status != nil {
		st := Status(*status)
		if !st.Valid() {
			return nil, ErrInvalidStatus
		}
		t.Status = st
	}
	if tags != nil {
		t.Tags = normalizeTags(*tags)
	}
	if projectID != nil {
		normalized := normalizeProjectID(projectID)
		if normalized != nil {
			if err := s.projectClient.CheckProjectExists(ctx, *normalized, userID); err != nil {
				return nil, err
			}
		}
		t.ProjectID = normalized
	}

	if err := s.repo.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

// normalizeTags trims whitespace, drops empty tags, and removes duplicates
// while preserving first-seen order.
func normalizeTags(tags []string) []string {
	seen := make(map[string]bool, len(tags))
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" || seen[trimmed] {
			continue
		}
		seen[trimmed] = true
		out = append(out, trimmed)
	}
	return out
}

func (s *Service) Delete(ctx context.Context, id, userID string) error {
	return s.repo.Delete(ctx, id, userID)
}

func (s *Service) Get(ctx context.Context, id string) (*Task, error) {
	return s.repo.Get(ctx, id)
}

func (s *Service) List(ctx context.Context, userID, projectID string) ([]*Task, error) {
	return s.repo.List(ctx, userID, projectID)
}
