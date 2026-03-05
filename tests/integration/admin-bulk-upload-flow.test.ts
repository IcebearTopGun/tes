import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminLogin,
  apiJson,
  otpLogin,
  startIntegrationServer,
  stopIntegrationServer,
  type StartedServer,
} from "./testUtils";

describe("Integration: Admin bulk upload flows", () => {
  let server: StartedServer;
  let baseUrl: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for integration tests.");
    }
    server = await startIntegrationServer(5109);
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    if (server?.process) await stopIntegrationServer(server.process);
  });

  it("handles student and teacher bulk uploads with duplicates/errors and persists valid rows", async () => {
    const adminToken = await adminLogin(baseUrl);
    const ts = Date.now();
    const classNum = String((ts % 60) + 1);
    const sectionA = ["A", "B", "C", "D"][ts % 4];
    const sectionB = ["A", "B", "C", "D"][(ts + 1) % 4];

    const studentRecords = [
      {
        studentName: "Bulk Student One",
        admissionNumber: `BULK-S-${ts}-1`,
        class: classNum,
        section: sectionA,
        email: `bulk.student.1.${ts}@example.com`,
        phoneNumber: "9333300001",
      },
      {
        studentName: "Bulk Student Two",
        admissionNumber: `BULK-S-${ts}-2`,
        class: classNum,
        section: sectionB,
        email: `bulk.student.2.${ts}@example.com`,
        phoneNumber: "9333300002",
      },
      {
        studentName: "Bulk Student Duplicate",
        admissionNumber: `BULK-S-${ts}-1`,
        class: classNum,
        section: sectionA,
        email: `bulk.student.dup.${ts}@example.com`,
        phoneNumber: "9333300003",
      },
      {
        studentName: "",
        admissionNumber: `BULK-S-${ts}-BAD`,
        class: classNum,
        section: sectionA,
      },
    ];

    const studentBulk = await apiJson(
      baseUrl,
      "/api/admin/managed-students/bulk-upload",
      { method: "POST", body: JSON.stringify({ records: studentRecords }) },
      adminToken,
    );
    expect(studentBulk.status).toBe(200);
    expect(studentBulk.body.created).toBe(2);
    expect(studentBulk.body.duplicates).toContain(`BULK-S-${ts}-1`);
    expect(studentBulk.body.errors.length).toBeGreaterThanOrEqual(1);

    const studentsList = await apiJson(baseUrl, "/api/admin/managed-students", undefined, adminToken);
    expect(studentsList.status).toBe(200);
    expect(studentsList.body.some((s: any) => s.admissionNumber === `BULK-S-${ts}-1`)).toBe(true);
    expect(studentsList.body.some((s: any) => s.admissionNumber === `BULK-S-${ts}-2`)).toBe(true);

    const teacherEmployee = `BULK-T-${ts}-1`;
    const teacherRecords = [
      {
        teacherName: "Bulk Teacher One",
        employeeId: teacherEmployee,
        class: classNum,
        section: sectionA,
        subjects: "Science,English",
        email: `bulk.teacher.1.${ts}@example.com`,
        phoneNumber: "9444400001",
        isClassTeacher: "yes",
        classTeacherOfClass: classNum,
        classTeacherOfSection: sectionA,
      },
      {
        teacherName: "Bulk Teacher Duplicate",
        employeeId: teacherEmployee,
        class: classNum,
        section: sectionB,
        subjects: "Mathematics",
        email: `bulk.teacher.dup.${ts}@example.com`,
        phoneNumber: "9444400002",
      },
      {
        teacherName: "",
        employeeId: `BULK-T-${ts}-BAD`,
        class: classNum,
        section: sectionA,
        subjects: "Science",
      },
    ];

    const teacherBulk = await apiJson(
      baseUrl,
      "/api/admin/managed-teachers/bulk-upload",
      { method: "POST", body: JSON.stringify({ records: teacherRecords }) },
      adminToken,
    );
    expect(teacherBulk.status).toBe(200);
    expect(teacherBulk.body.created).toBe(1);
    expect(teacherBulk.body.duplicates).toContain(teacherEmployee);
    expect(teacherBulk.body.errors.length).toBeGreaterThanOrEqual(1);

    const teachersList = await apiJson(baseUrl, "/api/admin/managed-teachers", undefined, adminToken);
    expect(teachersList.status).toBe(200);
    const createdTeacher = teachersList.body.find((t: any) => t.employeeId === teacherEmployee);
    expect(createdTeacher).toBeTruthy();
    expect(createdTeacher.classTeacherOf).toBe(`${classNum}-${sectionA}`);

    const teacherToken = await otpLogin(baseUrl, "teacher", teacherEmployee, "9444400001");
    const teacherOptions = await apiJson(baseUrl, "/api/teacher/options", undefined, teacherToken);
    expect(teacherOptions.status).toBe(200);
    expect(teacherOptions.body.classSections.some((cs: any) => String(cs.className) === classNum && cs.section === sectionA)).toBe(true);
    expect(teacherOptions.body.structuredSubjects.some((s: any) => s.name === "Science" && s.className === classNum && s.section === sectionA)).toBe(true);
    expect(teacherOptions.body.structuredSubjects.some((s: any) => s.name === "English" && s.className === classNum && s.section === sectionA)).toBe(true);
  });
});
