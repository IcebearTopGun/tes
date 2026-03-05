import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminLogin,
  apiJson,
  otpLogin,
  startIntegrationServer,
  stopIntegrationServer,
  type StartedServer,
} from "./testUtils";

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

describe("Integration: Exam CRUD lifecycle", () => {
  let server: StartedServer;
  let baseUrl: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for integration tests.");
    }
    server = await startIntegrationServer(5107);
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    if (server?.process) await stopIntegrationServer(server.process);
  });

  it("supports create, edit, delete and list consistency for exams", async () => {
    const adminToken = await adminLogin(baseUrl);

    const ensureClass = await apiJson(
      baseUrl,
      "/api/admin/class-sections",
      {
        method: "POST",
        body: JSON.stringify({ className: 9, section: "A", subjects: ["Mathematics", "Science", "English"] }),
      },
      adminToken,
    );
    expect([201, 409]).toContain(ensureClass.status);

    const ts = Date.now();
    const teacherEmployeeId = `TCRUD-${ts}`;
    const teacherPhone = "9000011111";

    const createTeacher = await apiJson(
      baseUrl,
      "/api/admin/managed-teachers",
      {
        method: "POST",
        body: JSON.stringify({
          teacherName: "CRUD Teacher",
          employeeId: teacherEmployeeId,
          email: `crud.teacher.${ts}@example.com`,
          phoneNumber: teacherPhone,
          assignments: [{ class: "9", section: "A", subjects: ["Mathematics"] }],
        }),
      },
      adminToken,
    );
    expect(createTeacher.status).toBe(201);

    const teacherToken = await otpLogin(baseUrl, "teacher", teacherEmployeeId, teacherPhone);

    const createExam = await apiJson(
      baseUrl,
      "/api/exams",
      {
        method: "POST",
        body: JSON.stringify({
          examName: `Math Unit ${ts}`,
          subject: "Mathematics",
          className: "9",
          section: "A",
          category: "unit_test",
          totalMarks: 100,
          questionText: "Q1. Solve x + 2 = 7",
          modelAnswerText: "x = 5",
          markingSchemeText: "Full marks for correct answer",
          description: "Initial unit test",
          examDate: addDays(2),
        }),
      },
      teacherToken,
    );
    expect(createExam.status).toBe(201);
    const examId = createExam.body.id as number;
    expect(typeof examId).toBe("number");

    const listBeforeEdit = await apiJson(baseUrl, "/api/exams", undefined, teacherToken);
    expect(listBeforeEdit.status).toBe(200);
    expect(listBeforeEdit.body.some((e: any) => e.id === examId)).toBe(true);

    const updateExam = await apiJson(
      baseUrl,
      `/api/exams/${examId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          totalMarks: 80,
          description: "Updated exam scope",
          questionText: "Q1. Solve x + 3 = 8",
          examDate: addDays(3),
        }),
      },
      teacherToken,
    );
    expect(updateExam.status).toBe(200);
    expect(updateExam.body.totalMarks).toBe(80);
    expect(updateExam.body.description).toBe("Updated exam scope");

    const listAfterEdit = await apiJson(baseUrl, "/api/exams", undefined, teacherToken);
    expect(listAfterEdit.status).toBe(200);
    const edited = listAfterEdit.body.find((e: any) => e.id === examId);
    expect(edited).toBeTruthy();
    expect(edited.totalMarks).toBe(80);
    expect(edited.description).toBe("Updated exam scope");

    const deleteExam = await apiJson(
      baseUrl,
      `/api/exams/${examId}`,
      { method: "DELETE" },
      teacherToken,
    );
    expect(deleteExam.status).toBe(200);
    expect(deleteExam.body.success).toBe(true);

    const listAfterDelete = await apiJson(baseUrl, "/api/exams", undefined, teacherToken);
    expect(listAfterDelete.status).toBe(200);
    expect(listAfterDelete.body.some((e: any) => e.id === examId)).toBe(false);
  });
});
