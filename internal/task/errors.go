package task

import "errors"

var (
	ErrNotFound        = errors.New("task not found")
	ErrInvalidTitle    = errors.New("title must not be empty")
	ErrInvalidStatus   = errors.New("invalid status")
	ErrProjectNotFound = errors.New("project not found")
)
