import { db } from "./db";
import {
  teachers, students, exams, answerSheets, evaluations, conversations, messages,
  type Teacher, type Student, type Exam,
  type InsertTeacher, type InsertStudent, type InsertExam
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getTeacher(id: number): Promise<Teacher | undefined>;
  getTeacherByEmployeeId(employeeId: string): Promise<Teacher | undefined>;
  createTeacher(teacher: InsertTeacher): Promise<Teacher>;
  
  getStudent(id: number): Promise<Student | undefined>;
  getStudentByAdmissionNumber(admissionNumber: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;

  createExam(exam: InsertExam): Promise<Exam>;
  getExamsByTeacher(teacherId: number): Promise<Exam[]>;

  getAnswerSheetsByExam(examId: number): Promise<any[]>;
  createAnswerSheet(sheet: any): Promise<any>;
  getAnswerSheet(id: number): Promise<any>;
  getExam(id: number): Promise<Exam | undefined>;
  createEvaluation(evaluation: any): Promise<any>;
  getEvaluationByAnswerSheetId(answerSheetId: number): Promise<any>;
  
  // Chat
  createConversation(title: string, teacherId: number): Promise<any>;
  getConversationsByTeacher(teacherId: number): Promise<any[]>;
  getMessagesByConversation(conversationId: number): Promise<any[]>;
  createMessage(message: any): Promise<any>;
  getEvaluationsByTeacher(teacherId: number): Promise<any[]>;

  // Analytics
  getAnalytics(teacherId: number): Promise<{
    classAverages: { subject: string; avgMarks: number; totalMarks: number; examCount: number }[];
    studentPerformance: { studentName: string; totalMarks: number; maxMarks: number; examName: string; subject: string; pct: number }[];
    marksDistribution: { range: string; count: number }[];
    improvementTrends: { examName: string; subject: string; avgMarks: number; maxMarks: number; avgPct: number }[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async getTeacher(id: number): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id));
    return teacher;
  }
  async getTeacherByEmployeeId(employeeId: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.employeeId, employeeId));
    return teacher;
  }
  async createTeacher(teacher: InsertTeacher): Promise<Teacher> {
    const [created] = await db.insert(teachers).values(teacher).returning();
    return created;
  }

  async getStudent(id: number): Promise<Student | undefined> {
    const [student] = await db.select().from(students).where(eq(students.id, id));
    return student;
  }
  async getStudentByAdmissionNumber(admissionNumber: string): Promise<Student | undefined> {
    const [student] = await db.select().from(students).where(eq(students.admissionNumber, admissionNumber));
    return student;
  }
  async createStudent(student: InsertStudent): Promise<Student> {
    const [created] = await db.insert(students).values(student).returning();
    return created;
  }

  async createExam(exam: InsertExam): Promise<Exam> {
    const [created] = await db.insert(exams).values(exam).returning();
    return created;
  }

  async getExamsByTeacher(teacherId: number): Promise<Exam[]> {
    return await db.select().from(exams).where(eq(exams.teacherId, teacherId));
  }

  async getAnswerSheetsByExam(examId: number): Promise<any[]> {
    return await db.select().from(answerSheets).where(eq(answerSheets.examId, examId));
  }

  async createAnswerSheet(sheet: any): Promise<any> {
    const [created] = await db.insert(answerSheets).values(sheet).returning();
    return created;
  }

  async getAnswerSheet(id: number): Promise<any> {
    const [sheet] = await db.select().from(answerSheets).where(eq(answerSheets.id, id));
    return sheet;
  }

  async getExam(id: number): Promise<Exam | undefined> {
    const [exam] = await db.select().from(exams).where(eq(exams.id, id));
    return exam;
  }

  async createEvaluation(evaluation: any): Promise<any> {
    const [created] = await db.insert(evaluations).values(evaluation).returning();
    return created;
  }

  async getEvaluationByAnswerSheetId(answerSheetId: number): Promise<any> {
    const [evaluation] = await db.select().from(evaluations).where(eq(evaluations.answerSheetId, answerSheetId));
    return evaluation;
  }

  async createConversation(title: string, teacherId: number): Promise<any> {
    const [created] = await db.insert(conversations).values({ title, teacherId }).returning();
    return created;
  }

  async getConversationsByTeacher(teacherId: number): Promise<any[]> {
    return await db.select().from(conversations).where(eq(conversations.teacherId, teacherId));
  }

  async getMessagesByConversation(conversationId: number): Promise<any[]> {
    return await db.select().from(messages).where(eq(messages.conversationId, conversationId));
  }

  async createMessage(message: any): Promise<any> {
    const [created] = await db.insert(messages).values(message).returning();
    return created;
  }

  async getEvaluationsByTeacher(teacherId: number): Promise<any[]> {
    return await db.select({
      id: evaluations.id,
      studentName: evaluations.studentName,
      admissionNumber: evaluations.admissionNumber,
      totalMarks: evaluations.totalMarks,
      questions: evaluations.questions,
      overallFeedback: evaluations.overallFeedback,
      subject: exams.subject,
      examName: exams.examName,
    })
    .from(evaluations)
    .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
    .innerJoin(exams, eq(answerSheets.examId, exams.id))
    .where(eq(exams.teacherId, teacherId));
  }

  async getAnalytics(teacherId: number) {
    // Base join: evaluations → answer_sheets → exams filtered by teacher
    const rows = await db.select({
      evalId: evaluations.id,
      studentName: evaluations.studentName,
      totalMarks: evaluations.totalMarks,
      examId: exams.id,
      examName: exams.examName,
      subject: exams.subject,
      maxMarks: exams.totalMarks,
    })
    .from(evaluations)
    .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
    .innerJoin(exams, eq(answerSheets.examId, exams.id))
    .where(eq(exams.teacherId, teacherId));

    // 1. Class averages by subject
    const subjectMap = new Map<string, { total: number; maxMarks: number; count: number }>();
    for (const r of rows) {
      const key = r.subject;
      const cur = subjectMap.get(key) ?? { total: 0, maxMarks: r.maxMarks, count: 0 };
      cur.total += r.totalMarks;
      cur.count += 1;
      subjectMap.set(key, cur);
    }
    const classAverages = Array.from(subjectMap.entries()).map(([subject, d]) => ({
      subject,
      avgMarks: Math.round((d.total / d.count) * 10) / 10,
      totalMarks: d.maxMarks,
      examCount: d.count,
    }));

    // 2. Student performance (latest 15, normalized to %)
    const studentPerformance = rows.slice(-15).map(r => ({
      studentName: r.studentName.split(" ")[0], // first name for readability
      totalMarks: r.totalMarks,
      maxMarks: r.maxMarks,
      examName: r.examName,
      subject: r.subject,
      pct: Math.round((r.totalMarks / r.maxMarks) * 100),
    }));

    // 3. Marks distribution (percentage buckets)
    const buckets = [
      { range: "0–25%", min: 0, max: 25, count: 0 },
      { range: "26–50%", min: 26, max: 50, count: 0 },
      { range: "51–75%", min: 51, max: 75, count: 0 },
      { range: "76–100%", min: 76, max: 100, count: 0 },
    ];
    for (const r of rows) {
      const pct = Math.round((r.totalMarks / r.maxMarks) * 100);
      for (const b of buckets) {
        if (pct >= b.min && pct <= b.max) { b.count++; break; }
      }
    }
    const marksDistribution = buckets.map(({ range, count }) => ({ range, count }));

    // 4. Improvement trends — average score per exam ordered by exam id
    const examMap = new Map<number, { examName: string; subject: string; maxMarks: number; total: number; count: number }>();
    for (const r of rows) {
      const cur = examMap.get(r.examId) ?? { examName: r.examName, subject: r.subject, maxMarks: r.maxMarks, total: 0, count: 0 };
      cur.total += r.totalMarks;
      cur.count += 1;
      examMap.set(r.examId, cur);
    }
    const improvementTrends = Array.from(examMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, d]) => ({
        examName: d.examName,
        subject: d.subject,
        avgMarks: Math.round((d.total / d.count) * 10) / 10,
        maxMarks: d.maxMarks,
        avgPct: Math.round((d.total / d.count / d.maxMarks) * 100),
      }));

    return { classAverages, studentPerformance, marksDistribution, improvementTrends };
  }
}

export const storage = new DatabaseStorage();
