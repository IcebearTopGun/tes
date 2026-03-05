import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  answerSheets,
  conversations,
  exams,
  evaluations,
  homework,
  homeworkSubmissions,
  ncertChapters,
  students,
} from "../../shared/schema";
import { buildClassAIContext, buildSubjectAIContext, getTeacherScope } from "./teacherDataScope";

type ScopedRole = "teacher" | "student";

export class ScopedAccessError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function ensureValidConversationId(conversationId: number): void {
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    throw new ScopedAccessError(400, "Invalid conversation id");
  }
}

export async function assertConversationAccess(params: {
  conversationId: number;
  role: ScopedRole;
  userId: number;
}): Promise<void> {
  ensureValidConversationId(params.conversationId);

  const [conv] = await db
    .select({
      id: conversations.id,
      teacherId: conversations.teacherId,
      studentId: conversations.studentId,
    })
    .from(conversations)
    .where(eq(conversations.id, params.conversationId))
    .limit(1);

  if (!conv) throw new ScopedAccessError(404, "Conversation not found");

  if (params.role === "teacher" && conv.teacherId !== params.userId) {
    throw new ScopedAccessError(403, "Forbidden");
  }
  if (params.role === "student" && conv.studentId !== params.userId) {
    throw new ScopedAccessError(403, "Forbidden");
  }
}

export async function buildTeacherScopedChatContext(teacherId: number, viewMode?: string): Promise<string> {
  const scope = await getTeacherScope(teacherId);
  if (viewMode === "class" && scope.isClassTeacher && scope.classTeacherOf) {
    return buildClassAIContext(scope.classTeacherOf, teacherId);
  }
  return buildSubjectAIContext(teacherId);
}

export async function buildStudentScopedChatContext(studentId: number): Promise<string> {
  const [student] = await db
    .select({
      id: students.id,
      admissionNumber: students.admissionNumber,
      studentClass: students.studentClass,
      section: students.section,
    })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);

  if (!student) {
    throw new ScopedAccessError(404, "Student not found");
  }

  const [evalRows, hwRows] = await Promise.all([
    db
      .select({
        subject: exams.subject,
        examName: exams.examName,
        totalMarks: evaluations.totalMarks,
        maxMarks: exams.totalMarks,
        overallFeedback: evaluations.overallFeedback,
      })
      .from(evaluations)
      .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
      .innerJoin(exams, eq(answerSheets.examId, exams.id))
      .where(eq(answerSheets.admissionNumber, student.admissionNumber))
      .orderBy(desc(evaluations.id))
      .limit(60),
    db
      .select({
        subject: homework.subject,
        description: homework.description,
        status: homeworkSubmissions.status,
        correctnessScore: homeworkSubmissions.correctnessScore,
        isOnTime: homeworkSubmissions.isOnTime,
        submittedAt: homeworkSubmissions.submittedAt,
      })
      .from(homeworkSubmissions)
      .innerJoin(homework, eq(homeworkSubmissions.homeworkId, homework.id))
      .where(eq(homeworkSubmissions.studentId, studentId))
      .orderBy(desc(homeworkSubmissions.submittedAt))
      .limit(80),
  ]);

  const subjects = Array.from(
    new Set(
      [...evalRows.map((r) => r.subject), ...hwRows.map((r) => r.subject)]
        .map((v) => String(v || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);

  const chapterRows = subjects.length
    ? await db
        .select({
          subject: ncertChapters.subject,
          chapterName: ncertChapters.chapterName,
          chapterContent: ncertChapters.chapterContent,
        })
        .from(ncertChapters)
        .where(and(eq(ncertChapters.class, student.studentClass), inArray(ncertChapters.subject, subjects)))
        .limit(30)
    : [];

  const ncertSummary = chapterRows.map((ch) => ({
    subject: ch.subject,
    chapterName: ch.chapterName,
    chapterContentSnippet: String(ch.chapterContent || "").slice(0, 240),
  }));

  return `SCOPE: Student View (strictly own data)
STUDENT: ${JSON.stringify({
    admissionNumber: student.admissionNumber,
    class: student.studentClass,
    section: student.section,
  })}
OWN EXAM EVALUATIONS: ${evalRows.length > 0 ? JSON.stringify(evalRows) : "No evaluation data available yet."}
OWN HOMEWORK HISTORY: ${hwRows.length > 0 ? JSON.stringify(hwRows) : "No homework submissions yet."}
RELEVANT NCERT CHAPTERS (class/subject scoped): ${ncertSummary.length > 0 ? JSON.stringify(ncertSummary) : "No NCERT context available."}`;
}

/*
File Purpose:
This file enforces AI-context segregation and access control boundaries.

Responsibilities:

* Validates teacher/student ownership before conversation message access
* Builds teacher-scoped and student-scoped AI chat context strings
* Prevents cross-user data leakage by centralizing scope logic

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
