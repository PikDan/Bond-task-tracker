import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useGetApiWorkspaceAccess, type AccessRole } from "../api/generated";
import { setCurrentWorkspaceId } from "../api/mutator";
import { useUser } from "./UserContext";

const WORKSPACE_STORAGE_KEY = "tracker.workspaceId";
const ORG_STORAGE_KEY = "tracker.orgId";

interface WorkspaceContextValue {
  workspaceId: string;
  orgId: string;
  role: AccessRole | null;
  isLoading: boolean;
  // Switches the active workspace (and its parent org) — used by
  // WorkspaceSwitcher when picking a different workspace or organization.
  setWorkspace: (workspaceId: string, orgId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { userId } = useUser();
  const [workspaceId, setWorkspaceIdState] = useState(() => localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "");
  const [orgId, setOrgIdState] = useState(() => localStorage.getItem(ORG_STORAGE_KEY) ?? "");

  useEffect(() => {
    setCurrentWorkspaceId(workspaceId);
  }, [workspaceId]);

  // The single source of truth for role: bootstraps the caller's default
  // workspace on first load (empty stored id) and re-resolves role whenever
  // the active workspace changes. Views must read role from this context,
  // not by calling this hook again themselves.
  const { data: access, isLoading } = useGetApiWorkspaceAccess(
    { workspace_id: workspaceId || undefined },
    { query: { enabled: !!userId } },
  );

  useEffect(() => {
    if (!access) return;
    if (access.workspace_id !== workspaceId) {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, access.workspace_id);
      setWorkspaceIdState(access.workspace_id);
    }
    if (access.org_id !== orgId) {
      localStorage.setItem(ORG_STORAGE_KEY, access.org_id);
      setOrgIdState(access.org_id);
    }
  }, [access, workspaceId, orgId]);

  function setWorkspace(nextWorkspaceId: string, nextOrgId: string) {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, nextWorkspaceId);
    localStorage.setItem(ORG_STORAGE_KEY, nextOrgId);
    setWorkspaceIdState(nextWorkspaceId);
    setOrgIdState(nextOrgId);
  }

  return (
    <WorkspaceContext.Provider value={{ workspaceId, orgId, role: access?.role ?? null, isLoading, setWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
