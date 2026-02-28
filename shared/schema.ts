import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
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

export const EXAM_CATEGORIES = ["mid_term", "unit_test", "end_sem", "class_test"] as const;
export type ExamCategory = typeof EXAM_CATEGORIES[number];

export const exams = pgTable("exams", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id),
  subject: text("subject").notNull(),
  className: text("class_name").notNull(),
  examName: text("exam_name").notNull(),
  category: text("category").notNull().default("unit_test"),
  totalMarks: integer("total_marks").notNull(),
  questionPaperUrl: text("question_paper_url"),
  modelAnswerUrl: text("model_answer_url"),
  markingSchemeUrl: text("marking_scheme_url"),
  questionText: text("question_text"),
  modelAnswerText: text("model_answer_text"),
  markingSchemeText: text("marking_scheme_text"),
});

export const answerSheets = pgTable("answer_sheets", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id),
  studentId: integer("student_id").references(() => students.id),
  admissionNumber: text("admission_number").notNull(),
  studentName: text("student_name").notNull(),
  ocrOutput: text("ocr_output").notNull(),
  status: text("status").notNull().default("processed"),
});

export const evaluations = pgTable("evaluations", {
  id: serial("id").primaryKey(),
  answerSheetId: integer("answer_sheet_id").notNull().references(() => answerSheets.id),
  studentName: text("student_name").notNull(),
  admissionNumber: text("admission_number").notNull(),
  totalMarks: integer("total_marks").notNull(),
  questions: text("questions").notNull(),
  overallFeedback: text("overall_feedback").notNull(),
});

export const answerSheetPages = pgTable("answer_sheet_pages", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id),
  admissionNumber: text("admission_number"),
  studentName: text("student_name"),
  sheetNumber: integer("sheet_number"),
  imageBase64: text("image_base64").notNull(),
  ocrOutput: text("ocr_output"),
  status: text("status").notNull().default("pending"),
  uploadedAt: text("uploaded_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const mergedAnswerScripts = pgTable("merged_answer_scripts", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id),
  admissionNumber: text("admission_number").notNull(),
  studentName: text("student_name").notNull(),
  mergedAnswers: text("merged_answers").notNull(),
  pageIds: text("page_ids").notNull(),
  status: text("status").notNull().default("pending"),
  answerSheetId: integer("answer_sheet_id").references(() => answerSheets.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const ncertChapters = pgTable("ncert_chapters", {
  id: serial("id").primaryKey(),
  class: text("class").notNull(),
  subject: text("subject").notNull(),
  chapterName: text("chapter_name").notNull(),
  chapterContent: text("chapter_content").notNull(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id),
});

export const deviationLogs = pgTable("deviation_logs", {
  id: serial("id").primaryKey(),
  evaluationId: integer("evaluation_id").notNull().references(() => evaluations.id),
  answerSheetId: integer("answer_sheet_id").notNull().references(() => answerSheets.id),
  admissionNumber: text("admission_number").notNull(),
  examId: integer("exam_id").notNull().references(() => exams.id),
  subject: text("subject").notNull(),
  questionNumber: integer("question_number").notNull(),
  chapter: text("chapter"),
  expectedConcept: text("expected_concept"),
  studentGap: text("student_gap"),
  deviationReason: text("deviation_reason"),
  marksAwarded: integer("marks_awarded"),
  maxMarks: integer("max_marks"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const performanceProfiles = pgTable("performance_profiles", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id),
  admissionNumber: text("admission_number").notNull(),
  profileData: text("profile_data").notNull(),
  generatedAt: text("generated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  teacherId: integer("teacher_id").references(() => teachers.id),
  studentId: integer("student_id").references(() => students.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Homework assigned by teacher to a class/section
export const homework = pgTable("homework", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id),
  subject: text("subject").notNull(),
  className: text("class_name").notNull(),
  section: text("section").notNull(),
  instruction: text("instruction").notNull(),
  modelSolutionText: text("model_solution_text"),
  dueDate: text("due_date").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Student submissions for homework
export const homeworkSubmissions = pgTable("homework_submissions", {
  id: serial("id").primaryKey(),
  homeworkId: integer("homework_id").notNull().references(() => homework.id),
  studentId: integer("student_id").notNull().references(() => students.id),
  admissionNumber: text("admission_number").notNull(),
  ocrText: text("ocr_text"),
  score: integer("score"),
  status: text("status").notNull().default("pending"),
  submittedAt: text("submitted_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Relations
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  answerSheet: one(answerSheets, {
    fields: [evaluations.answerSheetId],
    references: [answerSheets.id],
  }),
}));

export const answerSheetsRelations = relations(answerSheets, ({ one, many }) => ({
  exam: one(exams, {
    fields: [answerSheets.examId],
    references: [exams.id],
  }),
  student: one(students, {
    fields: [answerSheets.studentId],
    references: [students.id],
  }),
  evaluations: many(evaluations),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  teacher: one(teachers, {
    fields: [exams.teacherId],
    references: [teachers.id],
  }),
  answerSheets: many(answerSheets),
}));

export const homeworkRelations = relations(homework, ({ one, many }) => ({
  teacher: one(teachers, {
    fields: [homework.teacherId],
    references: [teachers.id],
  }),
  submissions: many(homeworkSubmissions),
}));

export const homeworkSubmissionsRelations = relations(homeworkSubmissions, ({ one }) => ({
  homework: one(homework, {
    fields: [homeworkSubmissions.homeworkId],
    references: [homework.id],
  }),
  student: one(students, {
    fields: [homeworkSubmissions.studentId],
    references: [students.id],
  }),
}));

export const insertTeacherSchema = createInsertSchema(teachers).omit({ id: true });
export const insertStudentSchema = createInsertSchema(students).omit({ id: true });
export const insertExamSchema = createInsertSchema(exams).omit({ id: true });
export const insertAnswerSheetSchema = createInsertSchema(answerSheets).omit({ id: true });
export const insertEvaluationSchema = createInsertSchema(evaluations).omit({ id: true });
export const insertNcertChapterSchema = createInsertSchema(ncertChapters).omit({ id: true });
export const insertHomeworkSchema = createInsertSchema(homework).omit({ id: true, createdAt: true });
export const insertHomeworkSubmissionSchema = createInsertSchema(homeworkSubmissions).omit({ id: true, submittedAt: true });

export type Teacher = typeof teachers.$inferSelect;
export type InsertTeacher = z.infer<typeof insertTeacherSchema>;

export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;

export type Exam = typeof exams.$inferSelect;
export type InsertExam = z.infer<typeof insertExamSchema>;

export type AnswerSheet = typeof answerSheets.$inferSelect;
export type InsertAnswerSheet = z.infer<typeof insertAnswerSheetSchema>;

export type Evaluation = typeof evaluations.$inferSelect;
export type InsertEvaluation = z.infer<typeof insertEvaluationSchema>;

export type AnswerSheetPage = typeof answerSheetPages.$inferSelect;
export type MergedAnswerScript = typeof mergedAnswerScripts.$inferSelect;
export type NcertChapter = typeof ncertChapters.$inferSelect;
export type InsertNcertChapter = z.infer<typeof insertNcertChapterSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type InsertMessage = typeof messages.$inferInsert;

export type DeviationLog = typeof deviationLogs.$inferSelect;
export type PerformanceProfile = typeof performanceProfiles.$inferSelect;

export type Homework = typeof homework.$inferSelect;
export type InsertHomework = z.infer<typeof insertHomeworkSchema>;
export type HomeworkSubmission = typeof homeworkSubmissions.$inferSelect;
export type InsertHomeworkSubmission = z.infer<typeof insertHomeworkSubmissionSchema>;
