package project

import "errors"

var (
	ErrNotFound    = errors.New("project not found")
	ErrInvalidName = errors.New("name must not be empty")
)
