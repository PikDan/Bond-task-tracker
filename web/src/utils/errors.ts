// Our mutator throws AxiosError on non-2xx responses; the backend's JSON
// error body ({"error": "..."}) lives at error.response.data.error. Avoids
// importing the generated `Error` schema type, which would shadow the
// built-in global Error in any file that imports it unaliased.
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response;
    const message = response?.data?.error;
    if (typeof message === "string") return message;
  }
  return fallback;
}
