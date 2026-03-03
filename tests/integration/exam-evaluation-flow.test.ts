import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminLogin,
  apiJson,
  makeMockOcrImage,
  otpLogin,
  startIntegrationServer,
  stopIntegrationServer,
  type StartedServer,
} from "./testUtils";

describe("Integration: Exam evaluation end-to-end", () => {
  let server: StartedServer;
  let baseUrl: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for integration tests.");
    }
    server = await startIntegrationServer(5105);
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    if (server?.process) await stopIntegrationServer(server.process);
  });

  it("teacher uploads model Q/A, evaluates 40 scripts, and results appear on teacher and student sides", async () => {
    const adminToken = await adminLogin(baseUrl);

    const ensureClassSection = await apiJson(
      baseUrl,
      "/api/admin/class-sections",
      {
        method: "POST",
        body: JSON.stringify({ className: 10, section: "A", subjects: ["Science", "Mathematics", "English"] }),
      },
      adminToken,
    );
    expect([201, 409]).toContain(ensureClassSection.status);

    const teacherEmployeeId = `TINT-${Date.now()}`;
    const teacherPhone = "9000012345";
    const teacherEmail = `integration.teacher.${Date.now()}@example.com`;

    const createTeacher = await apiJson(
      baseUrl,
      "/api/admin/managed-teachers",
      {
        method: "POST",
        body: JSON.stringify({
          teacherName: "Integration Teacher",
          employeeId: teacherEmployeeId,
          email: teacherEmail,
          phoneNumber: teacherPhone,
          assignments: [{ class: "10", section: "A", subjects: ["Science"] }],
        }),
      },
      adminToken,
    );
    expect(createTeacher.status).toBe(201);

    const students = Array.from({ length: 40 }).map((_, i) => ({
      admissionNumber: `INT10A-${String(i + 1).padStart(3, "0")}`,
      studentName: `Student ${i + 1}`,
      email: `int10a.student.${i + 1}.${Date.now()}@example.com`,
      phone: `91000${String(i + 1).padStart(5, "0")}`,
      class: "10",
      section: "A",
    }));

    for (const s of students) {
      const createStudent = await apiJson(
        baseUrl,
        "/api/admin/managed-students",
        {
          method: "POST",
          body: JSON.stringify({
            studentName: s.studentName,
            admissionNumber: s.admissionNumber,
            email: s.email,
            phoneNumber: s.phone,
            class: s.class,
            section: s.section,
          }),
        },
        adminToken,
      );
      expect([201, 409]).toContain(createStudent.status);
    }

    const teacherToken = await otpLogin(baseUrl, "teacher", teacherEmployeeId, teacherPhone);

    const createExam = await apiJson(
      baseUrl,
      "/api/exams",
      {
        method: "POST",
        body: JSON.stringify({
          examName: "Integration Science Test",
          subject: "Science",
          className: "10",
          section: "A",
          totalMarks: 100,
          questionText:
            "Q1 (20 marks): Explain photosynthesis.\nQ2 (20 marks): Explain Newton's first law.\nQ3 (20 marks): Explain water cycle.\nQ4 (20 marks): Explain DNA basics.\nQ5 (20 marks): Explain human heart function.",
          modelAnswerText:
            "Q1 (20 marks): Photosynthesis uses sunlight, water and carbon dioxide to make glucose and oxygen.\nQ2 (20 marks): Newton's first law states inertia and effect of external force.\nQ3 (20 marks): Water cycle includes evaporation, condensation, precipitation and collection.\nQ4 (20 marks): DNA is a double helix with A-T and G-C pairing.\nQ5 (20 marks): Heart has four chambers and pumps oxygenated/deoxygenated blood.",
          markingSchemeText: "Award marks based on key concept match and completeness.",
        }),
      },
      teacherToken,
    );
    expect(createExam.status).toBe(201);
    const examId = createExam.body.id;
    expect(typeof examId).toBe("number");

    for (const s of students) {
      const ocrPayload = {
        student_name: s.studentName,
        admission_number: s.admissionNumber,
        answers: [
          { question_number: 1, answer_text: "Photosynthesis is process of making food using sunlight." },
          { question_number: 2, answer_text: "First law says object keeps state unless force acts." },
          { question_number: 3, answer_text: "Water cycle has evaporation and rain." },
          { question_number: 4, answer_text: "DNA has A T G C in double helix." },
          { question_number: 5, answer_text: "Heart has chambers and pumps blood." },
        ],
      };

      const processSheet = await apiJson(
        baseUrl,
        `/api/exams/${examId}/process-answer-sheet`,
        {
          method: "POST",
          body: JSON.stringify({ imageBase64: makeMockOcrImage(ocrPayload) }),
        },
        teacherToken,
      );
      expect(processSheet.status).toBe(200);
      const sheetId = processSheet.body.id as number;
      expect(sheetId).toBeGreaterThan(0);

      const evaluate = await apiJson(
        baseUrl,
        `/api/answer-sheets/${sheetId}/evaluate`,
        { method: "POST", body: JSON.stringify({}) },
        teacherToken,
      );
      expect(evaluate.status).toBe(200);
      expect(evaluate.body.totalMarks).toBeGreaterThanOrEqual(0);
    }

    const teacherView = await apiJson(baseUrl, `/api/exams/${examId}/answer-sheets`, undefined, teacherToken);
    expect(teacherView.status).toBe(200);
    expect(teacherView.body.length).toBeGreaterThanOrEqual(40);
    const evaluatedCount = teacherView.body.filter((s: any) => !!s.evaluation).length;
    expect(evaluatedCount).toBeGreaterThanOrEqual(40);

    const firstStudent = students[0];
    const studentToken = await otpLogin(baseUrl, "student", firstStudent.admissionNumber, firstStudent.phone);
    const studentEvals = await apiJson(baseUrl, "/api/student/evaluations", undefined, studentToken);
    expect(studentEvals.status).toBe(200);
    expect(studentEvals.body.length).toBeGreaterThan(0);
    expect(studentEvals.body.some((e: any) => e.examName === "Integration Science Test")).toBe(true);

    const studentDashboard = await apiJson(baseUrl, "/api/student/dashboard", undefined, studentToken);
    expect(studentDashboard.status).toBe(200);
    expect(studentDashboard.body.assignments).toBeGreaterThan(0);
  });
});
