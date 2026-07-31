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

axiosInstance.interceptors.request.use((config) => {
  if (currentUserId) {
    config.headers.set("X-User-Id", currentUserId);
  }
  return config;
});

export const customInstance = <T,>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance(config).then((response) => response.data as T);
};

export default customInstance;
