import { describe, expect, it } from "vitest";
import {
  isStudentBulkDuplicate,
  isTeacherBulkDuplicate,
  validateStudentPayload,
  validateTeacherPayload,
} from "../../server/routes";

describe("admin bulk upload logic", () => {
  it("treats student uniqueness by admission number", () => {
    const existing = new Set(["ADM-001"]);
    expect(isStudentBulkDuplicate("ADM-001", existing)).toBe(true);
    expect(isStudentBulkDuplicate("ADM-002", existing)).toBe(false);
  });

  it("allows bulk student validation without phone/email", () => {
    const { errs, normalized } = validateStudentPayload(
      {
        studentName: "Student One",
        admissionNumber: "ADM-101",
        class: "5",
        section: "A",
      },
      { partial: false, requireContact: false },
    );

    expect(errs).toEqual([]);
    expect(normalized.admissionNumber).toBe("ADM-101");
  });

  it("treats teacher uniqueness by employee id", () => {
    const existing = new Set(["EMP-001"]);
    expect(isTeacherBulkDuplicate("EMP-001", existing)).toBe(true);
    expect(isTeacherBulkDuplicate("EMP-002", existing)).toBe(false);
  });

  it("derives classTeacherOf from class-section for class teachers", () => {
    const { errs, normalized } = validateTeacherPayload(
      {
        teacherName: "Teacher One",
        employeeId: "EMP-101",
        class: "6",
        section: "b",
        subjects: "Maths,Science",
        assignments: [{ class: "6", section: "B", subjects: ["Maths", "Science"] }],
        isClassTeacher: "1",
      },
      { partial: false, requireContact: false },
    );

    expect(errs).toEqual([]);
    expect(normalized.isClassTeacher).toBe(true);
    expect(normalized.classTeacherOf).toBe("6-B");
  });
});
