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
  // For FormData, let the browser set Content-Type (with the multipart boundary).
  const isFormData = options.body instanceof FormData;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
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

export type Material = {
  id: number;
  created_at: string;
  currentVersion: { title: string };
};

export function getMaterials(classroomId: number): Promise<{ materials: Material[] }> {
  return apiFetch(`/api/classrooms/${classroomId}/materials`);
}

export function uploadMaterial(
  classroomId: number,
  file: File
): Promise<{ material: { id: number; title: string; chunks: number } }> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/api/classrooms/${classroomId}/materials`, {
    method: "POST",
    body: form,
  });
}

export function uploadSyllabus(
  classroomId: number,
  file: File
): Promise<{ syllabus: { filename: string; length: number } }> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/api/classrooms/${classroomId}/syllabus`, {
    method: "PUT",
    body: form,
  });
}

// Exactly one of these describes where the answer came from.
export type ChatSourceKind = "materials" | "training" | "web" | "off_topic";

// A web citation — only present when source === "web".
export type ChatCitation = { url: string; title: string };

export type ChatResponse = {
  conversationId: number;
  answer: string;
  source: ChatSourceKind;
  sources: ChatCitation[];
  topScore: number;
};

export function sendChat(
  classroomId: number,
  question: string,
  conversationId?: number
): Promise<ChatResponse> {
  return apiFetch(`/api/classrooms/${classroomId}/chat`, {
    method: "POST",
    body: JSON.stringify({ question, conversationId }),
  });
}

// ---- Quizzes (M3) ----
// Quiz URLs use the quiz HEADER id; the server resolves the current version.

export type QuizSummary = {
  id: number;
  title: string;
  topic: string | null;
  created_at: string;
  questionCount: number;
};

export function listQuizzes(classroomId: number): Promise<{ quizzes: QuizSummary[] }> {
  return apiFetch(`/api/classrooms/${classroomId}/quizzes`);
}

export function generateQuiz(
  classroomId: number,
  topic: string,
  count: number
): Promise<{ quizId: number; versionId: number; title: string; questionCount: number }> {
  return apiFetch(`/api/classrooms/${classroomId}/quizzes`, {
    method: "POST",
    body: JSON.stringify({ topic, count }),
  });
}

// A question as served during an attempt — the answer key never reaches the client.
export type AttemptQuestion = {
  id: number;
  question_text: string;
  options: string[];
};

export function startAttempt(
  classroomId: number,
  quizId: number
): Promise<{ attemptId: number; title?: string; questions: AttemptQuestion[] }> {
  return apiFetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/attempts`, {
    method: "POST",
  });
}

export type QuizAnswer = { questionId: number; selectedIndex: number };

export function submitAttempt(
  classroomId: number,
  quizId: number,
  attemptId: number,
  answers: QuizAnswer[]
): Promise<{ attemptId: number; scoreCorrect: number; scoreTotal: number }> {
  return apiFetch(
    `/api/classrooms/${classroomId}/quizzes/${quizId}/attempts/${attemptId}/submit`,
    { method: "POST", body: JSON.stringify({ answers }) }
  );
}

// Which grounding tier the question was generated from (mirrors chat's escalation).
export type QuizSourceTier = "materials" | "general" | "web";

export type ReviewQuestion = {
  id: number;
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
  source: QuizSourceTier;
  selectedIndex: number | null;
  is_correct: boolean;
};

export type AttemptReview = {
  attemptId: number;
  title?: string;
  scoreCorrect: number;
  scoreTotal: number;
  questions: ReviewQuestion[];
};

export function getAttemptReview(
  classroomId: number,
  quizId: number,
  attemptId: number
): Promise<AttemptReview> {
  return apiFetch(
    `/api/classrooms/${classroomId}/quizzes/${quizId}/attempts/${attemptId}/review`
  );
}
