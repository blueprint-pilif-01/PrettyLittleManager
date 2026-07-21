export type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown }; correlationId?: string };

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | undefined;
let refreshSession: (() => Promise<string | undefined>) | undefined;

export function configureApiSession(input: { token?: string; refresh?: () => Promise<string | undefined> }) {
  accessToken = input.token;
  refreshSession = input.refresh;
}

export function setApiAccessToken(token?: string) { accessToken = token; }

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path.startsWith("/api/") ? path : `/api/v1${path}`, { ...init, headers, credentials: "include" });
  if (response.status === 401 && retry && refreshSession && !path.includes("/auth/")) {
    const token = await refreshSession();
    if (token) return api<T>(path, init, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new ApiError(response.status, body.error?.code ?? `HTTP_${response.status}`, body.error?.message ?? "Request failed", body.error?.details);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export async function downloadApiFile(path: string, fileName: string) {
  const headers = new Headers(); if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  let response = await fetch(`/api/v1${path}`, { headers, credentials: "include" });
  if (response.status === 401 && refreshSession) { const token = await refreshSession(); if (token) { headers.set("Authorization", `Bearer ${token}`); response = await fetch(`/api/v1${path}`, { headers, credentials: "include" }); } }
  if (!response.ok) throw new ApiError(response.status, `HTTP_${response.status}`, "Download failed");
  const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
