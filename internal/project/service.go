package project

import (
	"context"
	"strings"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Create(ctx context.Context, userID, name string) (*Project, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	return s.repo.Create(ctx, userID, name)
}

func (s *Service) Rename(ctx context.Context, id, userID, name string) (*Project, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	return s.repo.Rename(ctx, id, userID, name)
}

func (s *Service) Delete(ctx context.Context, id, userID string) error {
	return s.repo.Delete(ctx, id, userID)
}

func (s *Service) Get(ctx context.Context, id string) (*Project, error) {
	return s.repo.Get(ctx, id)
}

func (s *Service) List(ctx context.Context, userID string) ([]*Project, error) {
	return s.repo.List(ctx, userID)
}
