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

// Turn any caught error into a user-facing string: the API's message when we have
// one, a generic fallback otherwise. One copy so every screen phrases errors alike.
export function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
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

// ---- Study plans (M4) ----

export type PlanPacing = "long_infrequent" | "short_frequent";
export type PlanRating = "know_it" | "shaky" | "new";
export type PlanModality = "reading" | "practice" | "video" | "flashcards" | "quiz" | "review";

export type TopicRating = { topic: string; rating: PlanRating };

export type PlanPreferences = {
  pacing: PlanPacing;
  modalities: string[];
  topic_ratings: TopicRating[];
};

// What the "new plan" form needs: the classroom's current topics (extracted
// from its materials) and the last plan's preferences to pre-fill the form.
export function getPlanSetup(
  classroomId: number
): Promise<{ topics: string[]; lastPreferences: PlanPreferences | null }> {
  return apiFetch(`/api/classrooms/${classroomId}/plan-setup`);
}

export function generatePlan(
  classroomId: number,
  input: {
    deadline: string; // YYYY-MM-DD
    pacing: PlanPacing;
    modalities: string[];
    topicRatings: TopicRating[];
  }
): Promise<{ planId: number; title: string }> {
  return apiFetch(`/api/classrooms/${classroomId}/plans`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type PlanSummary = {
  id: number;
  title: string;
  deadline: string; // YYYY-MM-DD
  created_at: string;
  dayCount: number;
  sessionCount: number;
};

export function listPlans(classroomId: number): Promise<{ plans: PlanSummary[] }> {
  return apiFetch(`/api/classrooms/${classroomId}/plans`);
}

export type PlanSession = {
  topic: string;
  activity: string;
  modality: PlanModality;
  minutes: number;
};

export type PlanDay = {
  date: string; // YYYY-MM-DD
  focus: string;
  sessions: PlanSession[];
};

export type StudyPlan = {
  id: number;
  title: string;
  deadline: string;
  created_at: string;
  preferences: PlanPreferences;
  overview: string;
  days: PlanDay[];
};

export function getPlan(classroomId: number, planId: number): Promise<StudyPlan> {
  return apiFetch(`/api/classrooms/${classroomId}/plans/${planId}`);
}

// ---- Teach the bot (M5) ----

export type TeachAssessment = {
  verdict: string;
  correct: string[];
  incorrect: string[];
  missing: string[];
};

export type TeachMessage = { id: number; sender: "user" | "ai"; text: string };

export type TeachSession = {
  conversationId: number;
  topic: string | null;
  assessedAt: string | null;
  messages: TeachMessage[];
  assessment: TeachAssessment | null;
};

// First message of a session declares the topic; omit conversationId to start one.
export function sendTeach(
  classroomId: number,
  message: string,
  conversationId?: number
): Promise<{ conversationId: number; answer: string; topic: string }> {
  return apiFetch(`/api/classrooms/${classroomId}/teach`, {
    method: "POST",
    body: JSON.stringify({ message, conversationId }),
  });
}

export function assessTeach(
  classroomId: number,
  conversationId: number
): Promise<{ conversationId: number; assessment: TeachAssessment }> {
  return apiFetch(`/api/classrooms/${classroomId}/teach/${conversationId}/assess`, {
    method: "POST",
  });
}

export function getLatestTeach(
  classroomId: number
): Promise<{ session: TeachSession | null }> {
  return apiFetch(`/api/classrooms/${classroomId}/teach/latest`);
}

export type TeachSessionSummary = {
  conversationId: number;
  topic: string | null;
  assessedAt: string | null;
  updatedAt: string;
}

export function listTeachSessions(
  classroomId: number
) : Promise<{ sessions: TeachSessionSummary[] }> {
  return apiFetch(`/api/classrooms/${classroomId}/teach/sessions`)
}

export function getTeachSession(
  classroomId: number,
  conversationId: number
): Promise<{ session: TeachSession }> {
  return apiFetch(`/api/classrooms/${classroomId}/teach/sessions/${conversationId}`);
}

