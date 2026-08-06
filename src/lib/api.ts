import { pushUndo } from "./undo";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export function apiBase(): string {
  if (isTauri()) return "http://127.0.0.1:8787";
  return window.location.origin;
}

const TOKEN_KEY = "schoolhub_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export class UnpairedError extends Error {
  constructor() {
    super("device not paired");
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (init?.body) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${apiBase()}${path}`, { ...init, headers });

  if (res.status === 401) throw new UnpairedError();
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  getBlob: async (path: string): Promise<Blob> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${apiBase()}${path}`, { headers });
    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) detail = body.error;
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
    return res.blob();
  },
  create: <T,>(path: string, body: unknown) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: <T,>(path: string, body: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: async (path: string): Promise<void> => {
    const m = /^\/api\/([a-z_]+)\/(\d+)$/.exec(path);
    await request<void>(path, { method: "DELETE" });
    if (m && m[1] !== "trash") {
      pushUndo(m[1], Number(m[2]));
    }
  },
};
