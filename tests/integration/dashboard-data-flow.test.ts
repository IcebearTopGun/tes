import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminLogin,
  apiJson,
  otpLogin,
  startIntegrationServer,
  stopIntegrationServer,
  type StartedServer,
} from "./testUtils";

describe("Integration: Dashboard data flow coverage", () => {
  let server: StartedServer;
  let baseUrl: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for integration tests.");
    }
    server = await startIntegrationServer(5108);
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    if (server?.process) await stopIntegrationServer(server.process);
  });

  it("propagates admin-created class/teacher/student data to teacher, student and principal endpoints", async () => {
    const adminToken = await adminLogin(baseUrl);
    const ts = Date.now();

    const ensure7A = await apiJson(
      baseUrl,
      "/api/admin/class-sections",
      {
        method: "POST",
        body: JSON.stringify({ className: 7, section: "A", subjects: ["Science", "English"] }),
      },
      adminToken,
    );
    expect([201, 409]).toContain(ensure7A.status);

    const ensure8B = await apiJson(
      baseUrl,
      "/api/admin/class-sections",
      {
        method: "POST",
        body: JSON.stringify({ className: 8, section: "B", subjects: ["Mathematics", "English"] }),
      },
      adminToken,
    );
    expect([201, 409]).toContain(ensure8B.status);

    const t1Employee = `TDATA1-${ts}`;
    const t2Employee = `TDATA2-${ts}`;

    const createTeacher1 = await apiJson(
      baseUrl,
      "/api/admin/managed-teachers",
      {
        method: "POST",
        body: JSON.stringify({
          teacherName: "Teacher Data One",
          employeeId: t1Employee,
          email: `teacher.one.${ts}@example.com`,
          phoneNumber: "9000022221",
          assignments: [{ class: "7", section: "A", subjects: ["Science"] }],
        }),
      },
      adminToken,
    );
    expect(createTeacher1.status).toBe(201);

    const createTeacher2 = await apiJson(
      baseUrl,
      "/api/admin/managed-teachers",
      {
        method: "POST",
        body: JSON.stringify({
          teacherName: "Teacher Data Two",
          employeeId: t2Employee,
          email: `teacher.two.${ts}@example.com`,
          phoneNumber: "9000022222",
          assignments: [{ class: "8", section: "B", subjects: ["Mathematics"] }],
        }),
      },
      adminToken,
    );
    expect(createTeacher2.status).toBe(201);

    const studentAAdmission = `SDATA-A-${ts}`;
    const studentBAdmission = `SDATA-B-${ts}`;

    const createStudentA = await apiJson(
      baseUrl,
      "/api/admin/managed-students",
      {
        method: "POST",
        body: JSON.stringify({
          studentName: "Student Data A",
          admissionNumber: studentAAdmission,
          email: `student.a.${ts}@example.com`,
          phoneNumber: "9111100001",
          class: "7",
          section: "A",
        }),
      },
      adminToken,
    );
    expect(createStudentA.status).toBe(201);

    const createStudentB = await apiJson(
      baseUrl,
      "/api/admin/managed-students",
      {
        method: "POST",
        body: JSON.stringify({
          studentName: "Student Data B",
          admissionNumber: studentBAdmission,
          email: `student.b.${ts}@example.com`,
          phoneNumber: "9111100002",
          class: "8",
          section: "B",
        }),
      },
      adminToken,
    );
    expect(createStudentB.status).toBe(201);

    const teacherToken = await otpLogin(baseUrl, "teacher", t1Employee, "9000022221");
    const studentToken = await otpLogin(baseUrl, "student", studentAAdmission, "9111100001");

    const teacherOptions = await apiJson(baseUrl, "/api/teacher/options", undefined, teacherToken);
    expect(teacherOptions.status).toBe(200);
    expect(Array.isArray(teacherOptions.body.classSections)).toBe(true);
    expect(teacherOptions.body.classSections.some((cs: any) => String(cs.className) === "7" && cs.section === "A")).toBe(true);
    expect(Array.isArray(teacherOptions.body.structuredSubjects)).toBe(true);
    expect(teacherOptions.body.structuredSubjects.some((s: any) => s.className === "7" && s.section === "A" && s.name === "Science")).toBe(true);

    const teacherList = await apiJson(baseUrl, "/api/admin/managed-teachers", undefined, adminToken);
    expect(teacherList.status).toBe(200);
    expect(teacherList.body.some((t: any) => t.employeeId === t1Employee)).toBe(true);
    expect(teacherList.body.some((t: any) => t.employeeId === t2Employee)).toBe(true);

    const studentList = await apiJson(baseUrl, "/api/admin/managed-students", undefined, adminToken);
    expect(studentList.status).toBe(200);
    expect(studentList.body.some((s: any) => s.admissionNumber === studentAAdmission)).toBe(true);
    expect(studentList.body.some((s: any) => s.admissionNumber === studentBAdmission)).toBe(true);

    const principalLogin = await apiJson(baseUrl, "/api/auth/adminuser/login", {
      method: "POST",
      body: JSON.stringify({ employeeId: "PRIN001", password: "123" }),
    });
    expect(principalLogin.status).toBe(200);
    const principalToken = principalLogin.body.token as string;

    const classPerf = await apiJson(baseUrl, "/api/principal/class-performance", undefined, principalToken);
    expect(classPerf.status).toBe(200);
    expect(classPerf.body.some((c: any) => String(c.class) === "7" && c.section === "A")).toBe(true);
    expect(classPerf.body.some((c: any) => String(c.class) === "8" && c.section === "B")).toBe(true);

    const teacherEffectiveness = await apiJson(baseUrl, "/api/principal/teacher-effectiveness", undefined, principalToken);
    expect(teacherEffectiveness.status).toBe(200);
    expect(teacherEffectiveness.body.some((t: any) => t.name === "Teacher Data One")).toBe(true);
    expect(teacherEffectiveness.body.some((t: any) => t.name === "Teacher Data Two")).toBe(true);

    const principalStats = await apiJson(baseUrl, "/api/principal/stats", undefined, principalToken);
    expect(principalStats.status).toBe(200);
    expect(principalStats.body.totalStudents).toBeGreaterThanOrEqual(2);
    expect(principalStats.body.totalTeachers).toBeGreaterThanOrEqual(2);

    const studentDashboard = await apiJson(baseUrl, "/api/student/dashboard", undefined, studentToken);
    expect(studentDashboard.status).toBe(200);
    expect(typeof studentDashboard.body.attendance).toBe("number");
    expect(Array.isArray(studentDashboard.body.marksOverview)).toBe(true);
    expect(Array.isArray(studentDashboard.body.improvementAreas)).toBe(true);
  });
});
