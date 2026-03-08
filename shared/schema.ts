import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Single source-of-truth teacher roster (managed by admin)
export const teachers = pgTable("managed_teachers", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(),
  name: text("teacher_name").notNull(),
  email: text("email"),
  password: text("password"),
  assignments: text("assignments").notNull().default("[]"),
  subjectsAssigned: text("subjects_assigned").default("[]"),
  classesAssigned: text("classes_assigned").default("[]"),
  isClassTeacher: integer("is_class_teacher").notNull().default(0),
  classTeacherOf: text("class_teacher_of"),
  phone: text("phone_number"),
  profilePhotoUrl: text("profile_photo_url"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Single source-of-truth student roster (managed by admin)
export const students = pgTable("managed_students", {
  id: serial("id").primaryKey(),
  admissionNumber: text("admission_number").notNull().unique(),
  name: text("student_name").notNull(),
  studentClass: text("class").notNull(),
  section: text("section").notNull(),
  email: text("email"),
  password: text("password"),
  phone: text("phone_number"),
  profilePhotoUrl: text("profile_photo_url"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
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
  questionImages: text("question_images"), // JSON array of base64 image strings
  modelAnswerImages: text("model_answer_images"), // JSON array of base64 image strings
  section: text("section"),
  subjectCode: text("subject_code"),
  useNcert: integer("use_ncert").default(0), // 0 = no, 1 = yes
  description: text("description"),
  examDate: text("exam_date"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  showResultsToStudents: integer("show_results_to_students").notNull().default(0),
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

export const evaluations = pgTable("evaluations", {
  id: serial("id").primaryKey(),
  answerSheetId: integer("answer_sheet_id").notNull().references(() => answerSheets.id),
  studentName: text("student_name").notNull(),
  admissionNumber: text("admission_number").notNull(),
  totalMarks: integer("total_marks").notNull(),
  questions: text("questions").notNull(), // JSON string: [{question_number, chapter, marks_awarded, max_marks, deviation_reason, improvement_suggestion}]
  overallFeedback: text("overall_feedback").notNull(),
});

// Bulk upload: individual pages uploaded before grouping/merging
export const answerSheetPages = pgTable("answer_sheet_pages", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id),
  admissionNumber: text("admission_number"),
  studentName: text("student_name"),
  sheetNumber: integer("sheet_number"),
  imageBase64: text("image_base64").notNull(),
  ocrOutput: text("ocr_output"), // JSON string
  status: text("status").notNull().default("pending"), // pending | processed
  uploadedAt: text("uploaded_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Merged scripts grouped per student per exam
export const mergedAnswerScripts = pgTable("merged_answer_scripts", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id),
  admissionNumber: text("admission_number").notNull(),
  studentName: text("student_name").notNull(),
  mergedAnswers: text("merged_answers").notNull(), // JSON string - merged answers from all pages
  pageIds: text("page_ids").notNull(), // JSON array of page ids
  status: text("status").notNull().default("pending"), // pending | evaluated
  answerSheetId: integer("answer_sheet_id").references(() => answerSheets.id), // set after evaluation
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// NCERT reference chapters
export const ncertChapters = pgTable("ncert_chapters", {
  id: serial("id").primaryKey(),
  class: text("class").notNull(),
  subject: text("subject").notNull(),
  chapterName: text("chapter_name").notNull(),
  chapterContent: text("chapter_content").notNull(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id),
});

// Per-question deviation logs (extracted for efficient querying)
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

// Cached AI-generated performance profile per student
export const performanceProfiles = pgTable("performance_profiles", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id),
  admissionNumber: text("admission_number").notNull(),
  profileData: text("profile_data").notNull(), // JSON
  generatedAt: text("generated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const homework = pgTable("homework", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id),
  subject: text("subject").notNull(),
  className: text("class_name").notNull(),
  section: text("section").notNull(),
  description: text("description").notNull(),
  questionsText: text("questions_text"),
  questionImages: text("question_images"), // JSON array of base64 strings
  modelSolutionText: text("model_solution_text"),
  modelAnswerImages: text("model_answer_images"), // JSON array of base64 strings
  useNcertReference: integer("use_ncert_reference").notNull().default(0),
  showResultsBeforeDue: integer("show_results_before_due").notNull().default(0),
  dueDate: text("due_date").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const homeworkSubmissions = pgTable("homework_submissions", {
  id: serial("id").primaryKey(),
  homeworkId: integer("homework_id").notNull().references(() => homework.id),
  studentId: integer("student_id").notNull().references(() => students.id),
  admissionNumber: text("admission_number").notNull(),
  fileBase64: text("file_base64"),
  ocrText: text("ocr_text"),
  correctnessScore: integer("correctness_score"),
  totalMarks: integer("total_marks"),
  maxMarks: integer("max_marks"),
  questionAnalysis: text("question_analysis"), // JSON array
  status: text("status").notNull().default("pending"),
  aiFeedback: text("ai_feedback"),
  submittedAt: text("submitted_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  isOnTime: integer("is_on_time").notNull().default(1),
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
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

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

export const insertTeacherSchema = createInsertSchema(teachers).omit({ id: true });
export const insertStudentSchema = createInsertSchema(students).omit({ id: true });
export const insertExamSchema = createInsertSchema(exams).omit({ id: true });
export const insertAnswerSheetSchema = createInsertSchema(answerSheets).omit({ id: true });
export const insertEvaluationSchema = createInsertSchema(evaluations).omit({ id: true });
export const insertNcertChapterSchema = createInsertSchema(ncertChapters).omit({ id: true });

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

export const insertHomeworkSchema = createInsertSchema(homework).omit({ id: true, createdAt: true });
export const insertHomeworkSubmissionSchema = createInsertSchema(homeworkSubmissions).omit({ id: true, submittedAt: true });

export type Homework = typeof homework.$inferSelect;
export type InsertHomework = z.infer<typeof insertHomeworkSchema>;
export type HomeworkSubmission = typeof homeworkSubmissions.$inferSelect;
export type InsertHomeworkSubmission = z.infer<typeof insertHomeworkSubmissionSchema>;

export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  section: text("section").notNull(),
  description: text("description"),
  classTeacherId: integer("class_teacher_id").references(() => teachers.id),
});

export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  className: text("class_name"),
  section: text("section"),
  teacherId: integer("teacher_id").references(() => teachers.id),
});

export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  role: text("role").notNull(), // 'teacher' | 'student'
  identifier: text("identifier").notNull(), // employeeId or admissionNumber
  expiresAt: text("expires_at").notNull(),
  verified: integer("verified").notNull().default(0),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertClassSchema = createInsertSchema(classes).omit({ id: true });
export type Class = typeof classes.$inferSelect;
export type InsertClass = z.infer<typeof insertClassSchema>;

export const insertSubjectSchema = createInsertSchema(subjects).omit({ id: true });
export type Subject = typeof subjects.$inferSelect;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;

export type OtpCode = typeof otpCodes.$inferSelect;

// ─── ADMIN USER TABLE (ADMIN + PRINCIPAL roles) ────────────────────────────
import { pgEnum } from "drizzle-orm/pg-core";

export const adminRoleEnum = pgEnum("admin_role", ["ADMIN", "PRINCIPAL"]);

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phoneNumber: text("phone_number"),
  profilePhotoUrl: text("profile_photo_url"),
  role: text("role").notNull().default("ADMIN"), // "ADMIN" | "PRINCIPAL"
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── CLASS-SUBJECT MAPPING TABLE ─────────────────────────────────────────────
export const classSections = pgTable("class_sections", {
  id: serial("id").primaryKey(),
  className: integer("class_name").notNull(), // integer only
  section: text("section").notNull(),         // capital alphabet
  subjects: text("subjects").notNull(),       // JSON array: ["English","Maths",...]
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Backward-compatible aliases so existing managed-* API codepaths stay stable.
export const managedStudents = students;
export const managedTeachers = teachers;

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClassSectionSchema = createInsertSchema(classSections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertManagedStudentSchema = createInsertSchema(managedStudents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertManagedTeacherSchema = createInsertSchema(managedTeachers).omit({ id: true, createdAt: true, updatedAt: true });

export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type ClassSection = typeof classSections.$inferSelect;
export type InsertClassSection = z.infer<typeof insertClassSectionSchema>;
export type ManagedStudent = typeof managedStudents.$inferSelect;
export type InsertManagedStudent = z.infer<typeof insertManagedStudentSchema>;
export type ManagedTeacher = typeof managedTeachers.$inferSelect;
export type InsertManagedTeacher = z.infer<typeof insertManagedTeacherSchema>;




