const TOKEN_KEY = "db_viewer_token";

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers["x-auth-token"] = token;
  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  return fetch(url, { ...options, headers });
}
