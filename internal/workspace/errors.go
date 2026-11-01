package workspace

import "errors"

var (
	ErrNotFound    = errors.New("not found")
	ErrForbidden   = errors.New("forbidden")
	ErrInvalidName = errors.New("name must not be empty")
	// ErrLastOwner guards RemoveOrgMember/SetOrgMemberRole: an org's OWNER
	// can't be demoted or removed directly — TransferOwnership must be used
	// first, since one_owner_per_org requires exactly one OWNER row at all
	// times.
	ErrLastOwner = errors.New("cannot remove or demote the only owner — transfer ownership first")
	// ErrAlreadyMember guards AddOrgMember/AddWorkspaceMember: re-adding an
	// existing member hits uq_org_memberships_org_user/
	// uq_workspace_memberships_ws_user — translated here into a friendly
	// error instead of surfacing a raw unique-violation as a 500.
	ErrAlreadyMember = errors.New("user is already a member")
)
