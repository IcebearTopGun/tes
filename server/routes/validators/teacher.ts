import { storage } from "../../storage";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9]{10,15}$/;
const EMPLOYEE_RE = /^[A-Za-z0-9._/-]{2,32}$/;
const CLASS_RE = /^[0-9]{1,2}$/;
const SECTION_RE = /^[A-Z]$/;

function normalizeClass(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeSection(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeAssignments(input: any): Array<{ class: string; section: string; subjects: string[] }> {
  if (!Array.isArray(input)) return [];
  return input
    .map((a: any) => ({
      class: normalizeClass(a?.class),
      section: normalizeSection(a?.section),
      subjects: Array.from(new Set((Array.isArray(a?.subjects) ? a.subjects : [])
        .map((s: any) => String(s).trim())
        .filter(Boolean))),
    }))
    .filter((a) => CLASS_RE.test(a.class) && SECTION_RE.test(a.section) && a.subjects.length > 0);
}

export function validateTeacherPayload(payload: any, opts: { partial?: boolean; requireContact?: boolean } = {}) {
  const partial = !!opts.partial;
  const requireContact = opts.requireContact !== false;
  const errs: string[] = [];
  const teacherName = String(payload?.teacherName ?? payload?.name ?? "").trim();
  const employeeId = String(payload?.employeeId ?? "").trim();
  const phone = String(payload?.phone ?? payload?.phoneNumber ?? "").trim();
  const email = String(payload?.email ?? "").trim();
  const assignments = normalizeAssignments(payload?.assignments);
  const isClassTeacher = payload?.isClassTeacher ? 1 : 0;
  const classTeacherOf = String(payload?.classTeacherOf ?? "").trim();

  if (!partial || "teacherName" in payload || "name" in payload) {
    if (!teacherName || teacherName.length < 2) errs.push("Valid teacher name is required");
  }
  if (!partial || "employeeId" in payload) {
    if (!EMPLOYEE_RE.test(employeeId)) errs.push("Employee ID must be 2-32 characters and alphanumeric");
  }
  if (!partial || "phone" in payload || "phoneNumber" in payload) {
    if (requireContact && !phone) errs.push("Phone number is required");
    else if (phone && !PHONE_RE.test(phone)) errs.push("Phone number must be 10-15 digits");
  }
  if (!partial || "email" in payload) {
    if (requireContact && !email) errs.push("Email is required");
    else if (email && !EMAIL_RE.test(email)) errs.push("Valid email is required");
  }
  if (!partial || "assignments" in payload) {
    if (!assignments.length) errs.push("At least one class-section-subject assignment is required");
  }
  if (isClassTeacher) {
    if (!/^[0-9]{1,2}-[A-Z]$/.test(classTeacherOf)) errs.push("Class teacher assignment must be in format like 10-A");
  }

  return { errs, normalized: { teacherName, employeeId, phone, email, assignments, isClassTeacher, classTeacherOf } };
}

export function isTeacherBulkDuplicate(employeeId: string, employeeSet: Set<string>): boolean {
  return employeeSet.has(employeeId);
}

export function deriveTeacherLists(assignments: Array<{ class: string; section: string; subjects: string[] }>) {
  const classesAssigned = Array.from(new Set(assignments.map((a) => a.class)));
  const subjectsAssigned = Array.from(new Set(assignments.flatMap((a) => a.subjects)));
  return { classesAssigned, subjectsAssigned };
}

export async function validateTeacherAssignments(assignments: Array<{ class: string; section: string; subjects: string[] }>): Promise<string | null> {
  for (const assignment of assignments) {
    const classSection = await storage.getClassSectionByClassAndSection(parseInt(assignment.class, 10), assignment.section);
    if (!classSection) return `Class ${assignment.class}-${assignment.section} does not exist`;
    let allowedSubjects: string[] = [];
    try { allowedSubjects = JSON.parse(classSection.subjects || "[]"); } catch {}
    const invalidSubject = assignment.subjects.find((s) => !allowedSubjects.includes(s));
    if (invalidSubject) return `Subject "${invalidSubject}" is not available in class ${assignment.class}-${assignment.section}`;
  }
  return null;
}

/*
File Purpose:
This file validates teacher payloads and assignments for create/update and bulk operations.

Responsibilities:

* Validates teacher fields and formats
* Normalizes class/section/subject assignments
* Provides bulk-duplicate detection and assignment validation

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
