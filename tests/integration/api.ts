const BASE = "http://localhost:5009";

export type Role = "teacher" | "student";

let authToken: string | null = null;

export async function loginTeacher(employeeId: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/teacher/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId, password }),
  });
  if (!res.ok) throw new Error(`Teacher login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  authToken = data.token;
  return authToken!;
}

function headers() {
  return {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

export async function createExam(payload: {
  examName: string;
  subject: string;
  className: string;
  totalMarks: number;
  questionText?: string;
  modelAnswerText?: string;
  markingSchemeText?: string;
}) {
  const res = await fetch(`${BASE}/api/exams`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create exam failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function processAnswerSheet(examId: number, imageBase64: string) {
  const res = await fetch(`${BASE}/api/exams/${examId}/process-answer-sheet`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ imageBase64 }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OCR failed [${res.status}]: ${body}`);
  }
  return res.json();
}

export async function evaluateSheet(sheetId: number) {
  const res = await fetch(`${BASE}/api/answer-sheets/${sheetId}/evaluate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evaluation failed [${res.status}]: ${body}`);
  }
  return res.json();
}

export async function createConversation(title: string) {
  const res = await fetch(`${BASE}/api/chat/conversations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Create conversation failed: ${res.status}`);
  return res.json();
}

export async function sendMessage(conversationId: number, content: string) {
  const res = await fetch(`${BASE}/api/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Send message failed [${res.status}]: ${body}`);
  }
  return res.json();
}
