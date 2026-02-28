import { db } from "./db";
import {
  teachers, students, exams, answerSheets, evaluations,
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

  createAnswerSheet(sheet: any): Promise<any>;
  getAnswerSheet(id: number): Promise<any>;
  getExam(id: number): Promise<Exam | undefined>;
  createEvaluation(evaluation: any): Promise<any>;
  getEvaluationByAnswerSheetId(answerSheetId: number): Promise<any>;
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
}

export const storage = new DatabaseStorage();
