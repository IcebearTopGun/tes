import type { Request, Response, NextFunction } from "express";
import type { UserContext } from "../privacy/privacyGuard";
import { db } from "../db";
import { teachers, students } from "../../shared/schema";
import { eq } from "drizzle-orm";

export interface AiRequest extends Request {
  user?: { id: number; role: "teacher" | "student" | "admin" };
  aiContext?: UserContext;
}

export async function aiContextMiddleware(
  req: AiRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    next();
    return;
  }

  const { id, role } = req.user;
  const ctx: UserContext = { id, role };

  try {
    if (role === "student") {
      const [student] = await db.select().from(students).where(eq(students.id, id));
      if (student) {
        ctx.ownName = student.name;
        ctx.ownAdmissionNumber = student.admissionNumber;
      }
    } else if (role === "teacher") {
      const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id));
      if (teacher) {
        ctx.ownName = teacher.name;
        let assignedClasses: string[] = [];
        try { assignedClasses = JSON.parse(teacher.classesAssigned || "[]"); } catch {}
        ctx.assignedClassIds = assignedClasses;

        const allStudents = await db.select({ name: students.name, studentClass: students.studentClass }).from(students);
        ctx.allowedStudentNames = allStudents
          .filter(s => assignedClasses.includes(s.studentClass))
          .map(s => s.name);
      }
    }
  } catch (err) {
    console.warn("[aiContextMiddleware] Failed to enrich context:", err);
  }

  req.aiContext = ctx;
  next();
}
