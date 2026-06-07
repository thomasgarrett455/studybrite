// Central API client. Everything that talks to the backend goes through here so
// the JWT auth header lives in exactly one place.

export type User = {
  id: number;
  name: string;
  email: string;
  role: "student" | "teacher" | "admin";
};

export type Classroom = {
  id: number;
  name: string;
  invite_code: string;
  created_at: string;
};

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function getUser(): User | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

// Thrown for any non-2xx response so callers can branch on status if they want.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Wrapper around fetch that adds JSON + Bearer auth headers and parses the body.
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    // Token expired/invalid — drop the session so RequireAuth bounces to /login.
    if (res.status === 401) clearAuth();
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* non-JSON error body — keep the default message */
    }
    throw new ApiError(res.status, message);
  }

  // 204 No Content has no body to parse.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function listClassrooms(): Promise<{ classrooms: Classroom[] }> {
  return apiFetch("/api/classrooms");
}

export function createClassroom(name: string): Promise<{ classroom: Classroom }> {
  return apiFetch("/api/classrooms", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
