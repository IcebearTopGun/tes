import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const teachers = pgTable("teachers", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
});

export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  admissionNumber: text("admission_number").notNull().unique(),
  name: text("name").notNull(),
  studentClass: text("class").notNull(),
  section: text("section").notNull(),
  password: text("password").notNull(),
});

export const exams = pgTable("exams", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id),
  subject: text("subject").notNull(),
  className: text("class_name").notNull(),
  examName: text("exam_name").notNull(),
  totalMarks: integer("total_marks").notNull(),
  questionPaperUrl: text("question_paper_url"),
  modelAnswerUrl: text("model_answer_url"),
  markingSchemeUrl: text("marking_scheme_url"),
});

export const answerSheets = pgTable("answer_sheets", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id),
  studentId: integer("student_id").references(() => students.id),
  admissionNumber: text("admission_number").notNull(),
  studentName: text("student_name").notNull(),
  ocrOutput: text("ocr_output").notNull(), // JSON string
  status: text("status").notNull().default("processed"),
});

export const answerSheetsRelations = relations(answerSheets, ({ one }) => ({
  exam: one(exams, {
    fields: [answerSheets.examId],
    references: [exams.id],
  }),
  student: one(students, {
    fields: [answerSheets.studentId],
    references: [students.id],
  }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  teacher: one(teachers, {
    fields: [exams.teacherId],
    references: [teachers.id],
  }),
  answerSheets: many(answerSheets),
}));

export const insertTeacherSchema = createInsertSchema(teachers).omit({ id: true });
export const insertStudentSchema = createInsertSchema(students).omit({ id: true });
export const insertExamSchema = createInsertSchema(exams).omit({ id: true });
export const insertAnswerSheetSchema = createInsertSchema(answerSheets).omit({ id: true });

export type Teacher = typeof teachers.$inferSelect;
export type InsertTeacher = z.infer<typeof insertTeacherSchema>;

export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;

export type Exam = typeof exams.$inferSelect;
export type InsertExam = z.infer<typeof insertExamSchema>;

export type AnswerSheet = typeof answerSheets.$inferSelect;
export type InsertAnswerSheet = z.infer<typeof insertAnswerSheetSchema>;
