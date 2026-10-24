// Client for the local companion server (companion/).
import {
  API_HEADER,
  COMPANION_PORT,
  type AddJob,
  type JobView,
  type StateResponse,
} from "./api";

const BASE = `http://127.0.0.1:${COMPANION_PORT}`;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      [API_HEADER]: "1",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    credentials: "omit",
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Companion returned ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const getState = () => call<StateResponse>("/api/state");

export const addDownload = (job: AddJob) =>
  call<JobView>("/api/downloads", {
    method: "POST",
    body: JSON.stringify(job),
  });

export const removeDownload = (key: string) =>
  call<void>(`/api/downloads/${key}`, { method: "DELETE" });
