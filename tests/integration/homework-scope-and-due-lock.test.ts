import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminLogin,
  apiJson,
  makeMockTextFile,
  otpLogin,
  startIntegrationServer,
  stopIntegrationServer,
  type StartedServer,
} from "./testUtils";

function fmtDate(d: Date) {
  return d.toISOString().split("T")[0];
}

describe("Integration: Homework class scoping and due-date edit lock", () => {
  let server: StartedServer;
  let baseUrl: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for integration tests.");
    }
    server = await startIntegrationServer(5106);
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    if (server?.process) await stopIntegrationServer(server.process);
  });

  it("homework is visible only for assigned class-section, and edits are blocked after due date", async () => {
    const adminToken = await adminLogin(baseUrl);

    const ensure10A = await apiJson(
      baseUrl,
      "/api/admin/class-sections",
      {
        method: "POST",
        body: JSON.stringify({ className: 10, section: "A", subjects: ["Mathematics", "Science", "English"] }),
      },
      adminToken,
    );
    expect([201, 409]).toContain(ensure10A.status);

    const ensure10B = await apiJson(
      baseUrl,
      "/api/admin/class-sections",
      {
        method: "POST",
        body: JSON.stringify({ className: 10, section: "B", subjects: ["Mathematics", "Science", "English"] }),
      },
      adminToken,
    );
    expect([201, 409]).toContain(ensure10B.status);

    const teacherEmployeeId = `THW-${Date.now()}`;
    const teacherPhone = "9000099999";
    const teacherEmail = `hw.teacher.${Date.now()}@example.com`;

    const createTeacher = await apiJson(
      baseUrl,
      "/api/admin/managed-teachers",
      {
        method: "POST",
        body: JSON.stringify({
          teacherName: "Homework Teacher",
          employeeId: teacherEmployeeId,
          email: teacherEmail,
          phoneNumber: teacherPhone,
          assignments: [{ class: "10", section: "A", subjects: ["Mathematics"] }],
        }),
      },
      adminToken,
    );
    expect(createTeacher.status).toBe(201);

    const studentA = { admissionNumber: `HW-A-${Date.now()}`, studentName: "Student A", email: `hwa.${Date.now()}@example.com`, phone: "9222200001", class: "10", section: "A" };
    const studentB = { admissionNumber: `HW-B-${Date.now()}`, studentName: "Student B", email: `hwb.${Date.now()}@example.com`, phone: "9222200002", class: "10", section: "B" };

    const createA = await apiJson(
      baseUrl,
      "/api/admin/managed-students",
      { method: "POST", body: JSON.stringify({ ...studentA, phoneNumber: studentA.phone }) },
      adminToken,
    );
    expect(createA.status).toBe(201);

    const createB = await apiJson(
      baseUrl,
      "/api/admin/managed-students",
      { method: "POST", body: JSON.stringify({ ...studentB, phoneNumber: studentB.phone }) },
      adminToken,
    );
    expect(createB.status).toBe(201);

    const teacherToken = await otpLogin(baseUrl, "teacher", teacherEmployeeId, teacherPhone);
    const studentAToken = await otpLogin(baseUrl, "student", studentA.admissionNumber, studentA.phone);
    const studentBToken = await otpLogin(baseUrl, "student", studentB.admissionNumber, studentB.phone);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueTomorrow = fmtDate(tomorrow);

    const createHomework = await apiJson(
      baseUrl,
      "/api/teacher/homework",
      {
        method: "POST",
        body: JSON.stringify({
          subject: "Mathematics",
          studentClass: "10",
          section: "A",
          description: "Solve chapter exercise 3",
          modelSolution: "Use elimination and substitution methods and show all steps.",
          dueDate: dueTomorrow,
        }),
      },
      teacherToken,
    );
    expect(createHomework.status).toBe(201);
    const hwId = createHomework.body.id as number;
    expect(hwId).toBeGreaterThan(0);

    const aList = await apiJson(baseUrl, "/api/student/homework", undefined, studentAToken);
    expect(aList.status).toBe(200);
    expect(aList.body.some((h: any) => h.id === hwId)).toBe(true);

    const bList = await apiJson(baseUrl, "/api/student/homework", undefined, studentBToken);
    expect(bList.status).toBe(200);
    expect(bList.body.some((h: any) => h.id === hwId)).toBe(false);

    const firstSubmit = await apiJson(
      baseUrl,
      `/api/student/homework/${hwId}/submit`,
      {
        method: "POST",
        body: JSON.stringify({
          filesBase64: [makeMockTextFile("I solved using elimination and substitution with steps.")],
        }),
      },
      studentAToken,
    );
    expect(firstSubmit.status).toBe(200);

    const postSubmitList = await apiJson(baseUrl, "/api/student/homework", undefined, studentAToken);
    expect(postSubmitList.status).toBe(200);
    const submittedRow = postSubmitList.body.find((h: any) => h.id === hwId);
    expect(submittedRow?.submission).toBeTruthy();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pastDue = fmtDate(yesterday);

    const forcePastDue = await apiJson(
      baseUrl,
      `/api/teacher/homework/${hwId}`,
      { method: "PUT", body: JSON.stringify({ dueDate: pastDue }) },
      teacherToken,
    );
    expect(forcePastDue.status).toBe(200);

    const resubmit = await apiJson(
      baseUrl,
      `/api/student/homework/${hwId}/submit`,
      {
        method: "POST",
        body: JSON.stringify({
          filesBase64: [makeMockTextFile("Trying to edit after due date.")],
        }),
      },
      studentAToken,
    );
    expect(resubmit.status).toBe(400);
    expect(String(resubmit.body?.message || "")).toContain("cannot be edited after due date");
  });
});
