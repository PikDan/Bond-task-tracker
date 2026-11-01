import axios, { type AxiosRequestConfig } from "axios";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080",
});

// There's no JWT yet — every request must carry X-User-Id. UserContext calls
// setCurrentUserId() whenever the active user changes, and every generated
// hook picks it up automatically without threading it through call sites.
let currentUserId = "";

export function setCurrentUserId(userId: string) {
  currentUserId = userId;
}

// X-Workspace-Id is optional — omitting it makes project/task/timer-service
// fall back to the caller's lazily-provisioned default workspace. WorkspaceContext
// calls setCurrentWorkspaceId() whenever the active workspace changes.
let currentWorkspaceId = "";

export function setCurrentWorkspaceId(workspaceId: string) {
  currentWorkspaceId = workspaceId;
}

axiosInstance.interceptors.request.use((config) => {
  if (currentUserId) {
    config.headers.set("X-User-Id", currentUserId);
  }
  if (currentWorkspaceId) {
    config.headers.set("X-Workspace-Id", currentWorkspaceId);
  }
  return config;
});

export const customInstance = <T,>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance(config).then((response) => response.data as T);
};

export default customInstance;
