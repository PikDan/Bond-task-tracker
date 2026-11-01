import { useRef, useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import {
  useGetApiWorkspaces,
  useGetApiWorkspacesId,
  useGetApiOrganizations,
  useGetApiOrganizationsId,
  getApiWorkspaces,
} from "../api/generated";
import { useWorkspace } from "../context/WorkspaceContext";
import { useClickOutside } from "../hooks/useClickOutside";

export function WorkspaceSwitcher() {
  const { workspaceId, orgId, setWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [switchingOrg, setSwitchingOrg] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const { data: currentOrg } = useGetApiOrganizationsId(orgId);
  const { data: currentWorkspace } = useGetApiWorkspacesId(workspaceId);
  const { data: workspaces } = useGetApiWorkspaces({ org_id: orgId }, { query: { enabled: !!orgId && open } });
  const { data: organizations } = useGetApiOrganizations({ query: { enabled: open } });

  // Switching org has no direct "role" to resolve into yet — re-resolve to
  // that org's first/oldest workspace (ListWorkspacesForOrg orders by
  // created_at). This coincides with the org's real default workspace only
  // because GetOrCreateDefault always creates it first; Workspace.IsDefault
  // itself is never serialized over the API, so this is an ordering
  // assumption, not a contract.
  async function handleSwitchOrg(nextOrgId: string) {
    if (nextOrgId === orgId) {
      setOpen(false);
      return;
    }
    setSwitchingOrg(true);
    try {
      const orgWorkspaces = await getApiWorkspaces({ org_id: nextOrgId });
      const first = orgWorkspaces[0];
      if (first) setWorkspace(first.id, nextOrgId);
    } finally {
      setSwitchingOrg(false);
      setOpen(false);
    }
  }

  if (!workspaceId) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
      >
        <Building2 size={14} />
        <span className="max-w-[10rem] truncate">{currentWorkspace?.name ?? "…"}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
          <p className="mb-1 px-1 text-xs font-semibold text-neutral-400">{currentOrg?.name ?? "Organization"}</p>
          <div className="mb-2 max-h-48 overflow-y-auto">
            {(workspaces ?? []).map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  setWorkspace(ws.id, orgId);
                  setOpen(false);
                }}
                className={`block w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-800 ${
                  ws.id === workspaceId ? "text-blue-300" : "text-neutral-200"
                }`}
              >
                {ws.name}
              </button>
            ))}
          </div>

          {(organizations?.length ?? 0) > 1 && (
            <div className="border-t border-neutral-800 pt-2">
              <p className="mb-1 px-1 text-xs font-semibold text-neutral-500">Switch organization</p>
              {(organizations ?? []).map((org) => (
                <button
                  key={org.id}
                  disabled={switchingOrg}
                  onClick={() => handleSwitchOrg(org.id)}
                  className={`block w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-800 disabled:opacity-50 ${
                    org.id === orgId ? "text-blue-300" : "text-neutral-400"
                  }`}
                >
                  {org.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
