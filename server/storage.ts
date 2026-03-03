import { db } from "./db";
import {
  teachers, students, exams, answerSheets, evaluations, conversations, messages,
  answerSheetPages, mergedAnswerScripts, ncertChapters, deviationLogs, performanceProfiles,
  homework, homeworkSubmissions, admins, classes, subjects, otpCodes,
  adminUsers, classSections, managedStudents, managedTeachers,
  type Teacher, type Student, type Exam, type Admin, type Class, type Subject, type OtpCode,
  type InsertTeacher, type InsertStudent, type InsertExam, type InsertAdmin,
  type InsertClass, type InsertSubject,
  type NcertChapter, type InsertNcertChapter,
  type Homework, type InsertHomework, type HomeworkSubmission, type InsertHomeworkSubmission,
  type AdminUser, type InsertAdminUser,
  type ClassSection, type InsertClassSection,
  type ManagedStudent, type InsertManagedStudent,
  type ManagedTeacher, type InsertManagedTeacher,
} from "@shared/schema";
import { eq, and, desc, sql as drizzleSql, count, gt, inArray } from "drizzle-orm";

export interface IStorage {
  getTeacher(id: number): Promise<Teacher | undefined>;
  getTeacherById(id: number): Promise<Teacher | undefined>;
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
  getEvaluationsByStudent(admissionNumber: string): Promise<any[]>;

  // Bulk upload
  createAnswerSheetPage(page: any): Promise<any>;
  getAnswerSheetPagesByExam(examId: number): Promise<any[]>;
  updateAnswerSheetPage(id: number, data: any): Promise<any>;
  createMergedAnswerScript(script: any): Promise<any>;
  getMergedAnswerScriptsByExam(examId: number): Promise<any[]>;
  getMergedAnswerScript(id: number): Promise<any>;
  updateMergedAnswerScript(id: number, data: any): Promise<any>;

  // NCERT
  createNcertChapter(chapter: InsertNcertChapter): Promise<NcertChapter>;
  getNcertChaptersByTeacher(teacherId: number): Promise<NcertChapter[]>;
  getNcertChaptersByClassAndSubject(classLevel: string, subject: string): Promise<NcertChapter[]>;
  updateNcertChapter(id: number, data: Partial<InsertNcertChapter>): Promise<NcertChapter>;
  deleteNcertChapter(id: number): Promise<void>;
  
  // Chat
  createConversation(title: string, ownerId: number, role: "teacher" | "student"): Promise<any>;
  getConversationsByTeacher(teacherId: number): Promise<any[]>;
  getConversationsByStudent(studentId: number): Promise<any[]>;
  getMessagesByConversation(conversationId: number): Promise<any[]>;
  createMessage(message: any): Promise<any>;
  getEvaluationsByTeacher(teacherId: number): Promise<any[]>;

  // Deviation logs
  createDeviationLogs(logs: any[]): Promise<void>;
  getDeviationLogsByStudent(admissionNumber: string): Promise<any[]>;
  getDeviationLogsByTeacher(teacherId: number): Promise<any[]>;

  // Performance profile
  savePerformanceProfile(studentId: number, admissionNumber: string, profileData: object): Promise<any>;
  getPerformanceProfile(studentId: number): Promise<any>;

  // Homework
  createHomework(hw: InsertHomework): Promise<Homework>;
  getHomeworkByTeacher(teacherId: number): Promise<Homework[]>;
  getHomeworkForStudent(className: string, section: string): Promise<Homework[]>;
  createHomeworkSubmission(sub: InsertHomeworkSubmission): Promise<HomeworkSubmission>;
  getHomeworkSubmission(homeworkId: number, studentId: number): Promise<HomeworkSubmission | undefined>;
  updateHomeworkSubmission(id: number, data: Partial<HomeworkSubmission>): Promise<HomeworkSubmission>;
  getHomeworkSubmissionsByStudent(studentId: number): Promise<any[]>;
  getHomeworkSubmissionsByTeacher(teacherId: number): Promise<any[]>;
  getHomeworkById(id: number): Promise<Homework | undefined>;
  updateHomework(id: number, data: Partial<Homework>): Promise<Homework>;
  deleteHomework(id: number): Promise<void>;
  getHomeworkEvaluations(homeworkId: number): Promise<any[]>;

  // Admin
  getAdmin(id: number): Promise<Admin | undefined>;
  getAdminByEmployeeId(employeeId: string): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  updateAdminPassword(id: number, passwordHash: string): Promise<void>;
  getAdminUserByEmployeeId(employeeId: string): Promise<AdminUser | undefined>;
  getAdminUserById(id: number): Promise<AdminUser | undefined>;
  createAdminUser(data: InsertAdminUser): Promise<AdminUser>;
  getAllAdminUsers(): Promise<AdminUser[]>;
  updateAdminUserPassword(id: number, passwordHash: string): Promise<void>;
  getAllStudents(): Promise<Student[]>;
  getAllTeachers(): Promise<Teacher[]>;
  getAllExams(): Promise<Exam[]>;
  getSchoolStats(): Promise<{
    totalStudents: number;
    totalTeachers: number;
    totalExams: number;
    sheetsEvaluated: number;
    avgPerformance: number;
    activeClasses: number;
    homeworkAssigned: number;
    homeworkSubmitted: number;
  }>;
  getSchoolAnalytics(): Promise<{
    classPerformance: { className: string; section: string; avgPct: number; studentCount: number; examCount: number }[];
    subjectPerformance: { subject: string; avgPct: number; examCount: number }[];
    teacherStats: { teacherId: number; teacherName: string; examsCreated: number; sheetsEvaluated: number; avgClassPct: number }[];
    homeworkStats: { className: string; totalAssigned: number; totalSubmitted: number; completionPct: number }[];
    marksDistribution: { range: string; count: number }[];
  }>;
  getAdminKPIs(): Promise<{
    healthScore: number;
    healthGrade: string;
    improvementIndex: number;
    improvementCount: number;
    improvementTotal: number;
    interventionCount: number;
    teacherEffectivenessScore: number;
    engagementIndex: number;
    homeworkEffectivenessIndex: number;
    moreInsights: {
      classStability: { className: string; stdDev: number; label: string }[];
      subjectDifficulty: { subject: string; avgPct: number; trend: string }[];
      rankDistribution: { band: string; count: number; pct: number }[];
      engagementAlerts: { className: string; completionPct: number; alert: string }[];
    };
  }>;
  updateProfile(role: "student" | "teacher" | "admin" | "principal", id: number, data: { name?: string; phone?: string; profilePhotoUrl?: string }): Promise<void>;

  // Admin CRUD for teachers/students
  updateTeacher(id: number, data: Partial<InsertTeacher>): Promise<Teacher>;
  deleteTeacher(id: number): Promise<void>;
  updateStudent(id: number, data: Partial<InsertStudent>): Promise<Student>;
  deleteStudent(id: number): Promise<void>;

  // Classes
  getAllClasses(): Promise<Class[]>;
  createClass(cls: InsertClass): Promise<Class>;
  updateClass(id: number, data: Partial<InsertClass>): Promise<Class>;
  deleteClass(id: number): Promise<void>;

  // Subjects
  getAllSubjects(): Promise<Subject[]>;
  createSubject(subj: InsertSubject): Promise<Subject>;
  updateSubject(id: number, data: Partial<InsertSubject>): Promise<Subject>;
  deleteSubject(id: number): Promise<void>;

  // OTP
  createOtp(phone: string, code: string, role: string, identifier: string, expiresAt: string): Promise<OtpCode>;
  getLatestOtp(phone: string, identifier: string): Promise<OtpCode | undefined>;
  markOtpVerified(id: number): Promise<void>;

  // Analytics
  getTeacherStats(teacherId: number): Promise<{
    totalStudents: number;
    activeClasses: number;
    totalExams: number;
    sheetsEvaluated: number;
    avgPerformance: number;
    recentActivity: { id: number; action: string; target: string; time: string }[];
  }>;
  getAnalytics(teacherId: number, classFilter?: string, subjectFilter?: string): Promise<{
    classAverages: { subject: string; avgMarks: number; totalMarks: number; examCount: number }[];
    studentPerformance: { studentName: string; totalMarks: number; maxMarks: number; examName: string; subject: string; pct: number }[];
    marksDistribution: { range: string; count: number }[];
    improvementTrends: { examName: string; subject: string; avgMarks: number; maxMarks: number; avgPct: number }[];
    chapterWeakness: { chapter: string; subject: string; avgScore: number; totalQuestions: number; studentsAffected: number }[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async getTeacher(id: number): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id));
    return teacher;
  }
  async getTeacherById(id: number): Promise<Teacher | undefined> {
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

  async getEvaluationsByStudent(admissionNumber: string): Promise<any[]> {
    return await db.select({
      subject: exams.subject,
      examName: exams.examName,
      category: exams.category,
      className: exams.className,
      totalMarks: evaluations.totalMarks,
      maxMarks: exams.totalMarks,
      overallFeedback: evaluations.overallFeedback,
      questions: evaluations.questions,
      evaluationId: evaluations.id,
      answerSheetId: evaluations.answerSheetId,
    })
    .from(evaluations)
    .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
    .innerJoin(exams, eq(answerSheets.examId, exams.id))
    .where(eq(answerSheets.admissionNumber, admissionNumber))
    .orderBy(desc(evaluations.id));
  }

  // Bulk upload
  async createAnswerSheetPage(page: any): Promise<any> {
    const [created] = await db.insert(answerSheetPages).values(page).returning();
    return created;
  }

  async getAnswerSheetPagesByExam(examId: number): Promise<any[]> {
    return await db.select().from(answerSheetPages).where(eq(answerSheetPages.examId, examId));
  }

  async updateAnswerSheetPage(id: number, data: any): Promise<any> {
    const [updated] = await db.update(answerSheetPages).set(data).where(eq(answerSheetPages.id, id)).returning();
    return updated;
  }

  async createMergedAnswerScript(script: any): Promise<any> {
    const [created] = await db.insert(mergedAnswerScripts).values(script).returning();
    return created;
  }

  async getMergedAnswerScriptsByExam(examId: number): Promise<any[]> {
    return await db.select().from(mergedAnswerScripts).where(eq(mergedAnswerScripts.examId, examId));
  }

  async getMergedAnswerScript(id: number): Promise<any> {
    const [script] = await db.select().from(mergedAnswerScripts).where(eq(mergedAnswerScripts.id, id));
    return script;
  }

  async updateMergedAnswerScript(id: number, data: any): Promise<any> {
    const [updated] = await db.update(mergedAnswerScripts).set(data).where(eq(mergedAnswerScripts.id, id)).returning();
    return updated;
  }

  // NCERT
  async createNcertChapter(chapter: InsertNcertChapter): Promise<NcertChapter> {
    const [created] = await db.insert(ncertChapters).values(chapter).returning();
    return created;
  }

  async getNcertChaptersByTeacher(teacherId: number): Promise<NcertChapter[]> {
    return await db.select().from(ncertChapters).where(eq(ncertChapters.teacherId, teacherId));
  }

  async getNcertChaptersByClassAndSubject(classLevel: string, subject: string): Promise<NcertChapter[]> {
    return await db.select().from(ncertChapters).where(
      and(eq(ncertChapters.class, classLevel), eq(ncertChapters.subject, subject))
    );
  }

  async updateNcertChapter(id: number, data: Partial<InsertNcertChapter>): Promise<NcertChapter> {
    const [updated] = await db.update(ncertChapters).set(data).where(eq(ncertChapters.id, id)).returning();
    return updated;
  }

  async deleteNcertChapter(id: number): Promise<void> {
    await db.delete(ncertChapters).where(eq(ncertChapters.id, id));
  }

  async createConversation(title: string, ownerId: number, role: "teacher" | "student"): Promise<any> {
    const values = role === "teacher"
      ? { title, teacherId: ownerId }
      : { title, studentId: ownerId };
    const [created] = await db.insert(conversations).values(values).returning();
    return created;
  }

  async getConversationsByTeacher(teacherId: number): Promise<any[]> {
    return await db.select().from(conversations).where(eq(conversations.teacherId, teacherId));
  }

  async getConversationsByStudent(studentId: number): Promise<any[]> {
    return await db.select().from(conversations).where(eq(conversations.studentId, studentId));
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
      className: exams.className,
      category: exams.category,
      maxMarks: exams.totalMarks,
    })
    .from(evaluations)
    .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
    .innerJoin(exams, eq(answerSheets.examId, exams.id))
    .where(eq(exams.teacherId, teacherId))
    .orderBy(desc(evaluations.id));
  }

  // Deviation logs
  async createDeviationLogs(logs: any[]): Promise<void> {
    if (logs.length === 0) return;
    await db.insert(deviationLogs).values(logs);
  }

  async getDeviationLogsByStudent(admissionNumber: string): Promise<any[]> {
    return await db.select().from(deviationLogs)
      .where(eq(deviationLogs.admissionNumber, admissionNumber))
      .orderBy(desc(deviationLogs.id));
  }

  async getDeviationLogsByTeacher(teacherId: number): Promise<any[]> {
    return await db.select({
      id: deviationLogs.id,
      admissionNumber: deviationLogs.admissionNumber,
      subject: deviationLogs.subject,
      chapter: deviationLogs.chapter,
      questionNumber: deviationLogs.questionNumber,
      expectedConcept: deviationLogs.expectedConcept,
      studentGap: deviationLogs.studentGap,
      deviationReason: deviationLogs.deviationReason,
      marksAwarded: deviationLogs.marksAwarded,
      maxMarks: deviationLogs.maxMarks,
      createdAt: deviationLogs.createdAt,
    })
    .from(deviationLogs)
    .innerJoin(exams, eq(deviationLogs.examId, exams.id))
    .where(eq(exams.teacherId, teacherId))
    .orderBy(desc(deviationLogs.id));
  }

  // Performance profile
  async savePerformanceProfile(studentId: number, admissionNumber: string, profileData: object): Promise<any> {
    const existing = await db.select().from(performanceProfiles).where(eq(performanceProfiles.studentId, studentId));
    if (existing.length > 0) {
      const [updated] = await db.update(performanceProfiles)
        .set({ profileData: JSON.stringify(profileData), generatedAt: new Date().toISOString() })
        .where(eq(performanceProfiles.studentId, studentId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(performanceProfiles)
      .values({ studentId, admissionNumber, profileData: JSON.stringify(profileData) })
      .returning();
    return created;
  }

  async getPerformanceProfile(studentId: number): Promise<any> {
    const [profile] = await db.select().from(performanceProfiles).where(eq(performanceProfiles.studentId, studentId));
    return profile;
  }

  // Homework implementations
  async createHomework(hw: InsertHomework): Promise<Homework> {
    const [created] = await db.insert(homework).values(hw).returning();
    return created;
  }

  async getHomeworkByTeacher(teacherId: number): Promise<any[]> {
    const hws = await db.select().from(homework).where(eq(homework.teacherId, teacherId)).orderBy(desc(homework.id));

    // Enrich with submission counts and total student counts per class/section
    const enriched = await Promise.all(hws.map(async (hw) => {
      // Count submissions for this homework
      const [subCount] = await db
        .select({ count: drizzleSql<number>`cast(count(*) as int)` })
        .from(homeworkSubmissions)
        .where(eq(homeworkSubmissions.homeworkId, hw.id));

      // Count total students in that class+section
      const [totalCount] = await db
        .select({ count: drizzleSql<number>`cast(count(*) as int)` })
        .from(students)
        .where(and(eq(students.studentClass, hw.className), eq(students.section, hw.section)));

      // Average correctness score across evaluated submissions
      const scoredSubs = await db
        .select({ score: homeworkSubmissions.correctnessScore })
        .from(homeworkSubmissions)
        .where(
          and(
            eq(homeworkSubmissions.homeworkId, hw.id),
            drizzleSql`${homeworkSubmissions.correctnessScore} is not null`
          )
        );
      const avgScore = scoredSubs.length > 0
        ? Math.round(scoredSubs.reduce((s, r) => s + (r.score ?? 0), 0) / scoredSubs.length)
        : null;

      return {
        ...hw,
        submissionCount: Number(subCount?.count ?? 0),
        totalStudents: Number(totalCount?.count ?? 0),
        avgScore,
      };
    }));

    return enriched;
  }

  async getHomeworkForStudent(className: string, section: string): Promise<Homework[]> {
    return await db.select().from(homework).where(
      and(eq(homework.className, className), eq(homework.section, section))
    ).orderBy(desc(homework.id));
  }

  async createHomeworkSubmission(sub: InsertHomeworkSubmission): Promise<HomeworkSubmission> {
    const [created] = await db.insert(homeworkSubmissions).values(sub).returning();
    return created;
  }

  async getHomeworkSubmission(homeworkId: number, studentId: number): Promise<HomeworkSubmission | undefined> {
    const [sub] = await db.select().from(homeworkSubmissions).where(
      and(eq(homeworkSubmissions.homeworkId, homeworkId), eq(homeworkSubmissions.studentId, studentId))
    );
    return sub;
  }

  async updateHomeworkSubmission(id: number, data: Partial<HomeworkSubmission>): Promise<HomeworkSubmission> {
    const [updated] = await db.update(homeworkSubmissions).set(data as any).where(eq(homeworkSubmissions.id, id)).returning();
    return updated;
  }

  async getHomeworkSubmissionsByStudent(studentId: number): Promise<any[]> {
    return await db.select({
      submissionId: homeworkSubmissions.id,
      homeworkId: homeworkSubmissions.homeworkId,
      status: homeworkSubmissions.status,
      correctnessScore: homeworkSubmissions.correctnessScore,
      aiFeedback: homeworkSubmissions.aiFeedback,
      submittedAt: homeworkSubmissions.submittedAt,
      isOnTime: homeworkSubmissions.isOnTime,
      subject: homework.subject,
      description: homework.description,
      dueDate: homework.dueDate,
      className: homework.className,
      section: homework.section,
    })
    .from(homeworkSubmissions)
    .innerJoin(homework, eq(homeworkSubmissions.homeworkId, homework.id))
    .where(eq(homeworkSubmissions.studentId, studentId))
    .orderBy(desc(homeworkSubmissions.submittedAt));
  }

  async getHomeworkSubmissionsByTeacher(teacherId: number): Promise<any[]> {
    return await db.select({
      submissionId: homeworkSubmissions.id,
      homeworkId: homeworkSubmissions.homeworkId,
      admissionNumber: homeworkSubmissions.admissionNumber,
      status: homeworkSubmissions.status,
      correctnessScore: homeworkSubmissions.correctnessScore,
      submittedAt: homeworkSubmissions.submittedAt,
      isOnTime: homeworkSubmissions.isOnTime,
      subject: homework.subject,
      description: homework.description,
      dueDate: homework.dueDate,
      className: homework.className,
      section: homework.section,
    })
    .from(homeworkSubmissions)
    .innerJoin(homework, eq(homeworkSubmissions.homeworkId, homework.id))
    .where(eq(homework.teacherId, teacherId))
    .orderBy(desc(homeworkSubmissions.submittedAt));
  }

  async getHomeworkById(id: number): Promise<any | undefined> {
    const [hw] = await db.select().from(homework).where(eq(homework.id, id));
    return hw;
  }

  async updateHomework(id: number, data: Partial<any>): Promise<any> {
    const [updated] = await db.update(homework).set(data as any).where(eq(homework.id, id)).returning();
    return updated;
  }

  async deleteHomework(id: number): Promise<void> {
    await db.delete(homeworkSubmissions).where(eq(homeworkSubmissions.homeworkId, id));
    await db.delete(homework).where(eq(homework.id, id));
  }

  async getHomeworkEvaluations(homeworkId: number): Promise<any[]> {
    return await db.select({
      submissionId: homeworkSubmissions.id,
      admissionNumber: homeworkSubmissions.admissionNumber,
      status: homeworkSubmissions.status,
      correctnessScore: homeworkSubmissions.correctnessScore,
      aiFeedback: homeworkSubmissions.aiFeedback,
      submittedAt: homeworkSubmissions.submittedAt,
      isOnTime: homeworkSubmissions.isOnTime,
      ocrText: homeworkSubmissions.ocrText,
      fileBase64: homeworkSubmissions.fileBase64,
      studentName: students.name,
    })
    .from(homeworkSubmissions)
    .innerJoin(students, eq(homeworkSubmissions.studentId, students.id))
    .where(eq(homeworkSubmissions.homeworkId, homeworkId))
    .orderBy(desc(homeworkSubmissions.submittedAt));
  }

  // Real teacher stats from DB
  async getTeacherStats(teacherId: number): Promise<{
    totalStudents: number;
    activeClasses: number;
    totalExams: number;
    sheetsEvaluated: number;
    avgPerformance: number;
    recentActivity: { id: number; action: string; target: string; time: string }[];
  }> {
    const teacherExams = await db.select().from(exams).where(eq(exams.teacherId, teacherId));
    const examIds = teacherExams.map(e => e.id);

    let sheetsEvaluated = 0;
    let totalMarksSum = 0;
    let totalMaxSum = 0;
    const studentSet = new Set<string>();
    const classSet = new Set<string>();
    const recentActivity: { id: number; action: string; target: string; time: string }[] = [];

    if (examIds.length > 0) {
      const evalRows = await db.select({
        evalId: evaluations.id,
        admissionNumber: evaluations.admissionNumber,
        totalMarks: evaluations.totalMarks,
        examName: exams.examName,
        className: exams.className,
        maxMarks: exams.totalMarks,
        createdAt: deviationLogs.createdAt,
      })
      .from(evaluations)
      .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
      .innerJoin(exams, eq(answerSheets.examId, exams.id))
      .leftJoin(deviationLogs, eq(deviationLogs.evaluationId, evaluations.id))
      .where(eq(exams.teacherId, teacherId))
      .orderBy(desc(evaluations.id))
      .limit(50);

      const seenEvals = new Set<number>();
      for (const r of evalRows) {
        if (!seenEvals.has(r.evalId)) {
          seenEvals.add(r.evalId);
          sheetsEvaluated++;
          totalMarksSum += r.totalMarks;
          totalMaxSum += r.maxMarks;
          studentSet.add(r.admissionNumber);
          classSet.add(r.className);
          if (recentActivity.length < 5) {
            recentActivity.push({
              id: r.evalId,
              action: "Evaluated",
              target: r.examName,
              time: r.createdAt || "recently",
            });
          }
        }
      }
    }

    for (const exam of teacherExams.slice(0, 3 - recentActivity.length)) {
      if (recentActivity.length < 3) {
        recentActivity.push({ id: exam.id * 1000, action: "Created", target: exam.examName, time: "exam on record" });
      }
    }

    const avgPerformance = totalMaxSum > 0
      ? Math.round((totalMarksSum / totalMaxSum) * 100)
      : 0;

    // Count students in teacher's assigned classes (from subjects table assignments)
    let totalStudentsCount = studentSet.size;
    try {
      const teacherRecord = await db.select().from(teachers).where(eq(teachers.id, teacherId)).then(r => r[0]);
      if (teacherRecord) {
        let classesAssigned: string[] = [];
        try { classesAssigned = JSON.parse(teacherRecord.classesAssigned || "[]"); } catch {}
        if (classesAssigned.length > 0) {
          // Count students in assigned classes
          const studentsInClass = await db.select().from(students)
            .where(inArray(students.studentClass, classesAssigned));
          if (studentsInClass.length > 0) totalStudentsCount = studentsInClass.length;
        }
      }
    } catch {}

    return {
      totalStudents: totalStudentsCount,
      activeClasses: classSet.size || 0,
      totalExams: teacherExams.length,
      sheetsEvaluated,
      avgPerformance,
      recentActivity: recentActivity.slice(0, 5),
    };
  }

  async getAnalytics(teacherId: number, classFilter?: string, subjectFilter?: string) {
    const rows = await db.select({
      evalId: evaluations.id,
      studentName: evaluations.studentName,
      admissionNumber: evaluations.admissionNumber,
      totalMarks: evaluations.totalMarks,
      questions: evaluations.questions,
      examId: exams.id,
      examName: exams.examName,
      subject: exams.subject,
      className: exams.className,
      category: exams.category,
      maxMarks: exams.totalMarks,
    })
    .from(evaluations)
    .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
    .innerJoin(exams, eq(answerSheets.examId, exams.id))
    .where(eq(exams.teacherId, teacherId))
    .orderBy(desc(evaluations.id));

    // Apply filters in memory
    const filtered = rows.filter(r => {
      if (classFilter && r.className !== classFilter) return false;
      if (subjectFilter && r.subject !== subjectFilter) return false;
      return true;
    });

    // Class averages by subject
    const subjectMap = new Map<string, { total: number; maxMarks: number; count: number }>();
    for (const r of filtered) {
      const cur = subjectMap.get(r.subject) ?? { total: 0, maxMarks: r.maxMarks, count: 0 };
      cur.total += r.totalMarks;
      cur.count += 1;
      subjectMap.set(r.subject, cur);
    }
    const classAverages = Array.from(subjectMap.entries()).map(([subject, d]) => ({
      subject,
      avgMarks: Math.round((d.total / d.count) * 10) / 10,
      totalMarks: d.maxMarks,
      examCount: d.count,
    }));

    // Student performance (last 15)
    const studentPerformance = filtered.slice(0, 15).map(r => ({
      studentName: r.studentName.split(" ")[0],
      totalMarks: r.totalMarks,
      maxMarks: r.maxMarks,
      examName: r.examName,
      subject: r.subject,
      pct: Math.round((r.totalMarks / r.maxMarks) * 100),
    }));

    // Marks distribution
    const buckets = [
      { range: "0–25%", min: 0, max: 25, count: 0 },
      { range: "26–50%", min: 26, max: 50, count: 0 },
      { range: "51–75%", min: 51, max: 75, count: 0 },
      { range: "76–100%", min: 76, max: 100, count: 0 },
    ];
    for (const r of filtered) {
      const pct = Math.round((r.totalMarks / r.maxMarks) * 100);
      for (const b of buckets) {
        if (pct >= b.min && pct <= b.max) { b.count++; break; }
      }
    }
    const marksDistribution = buckets.map(({ range, count }) => ({ range, count }));

    // Improvement trends (per exam)
    const examMap = new Map<number, { examName: string; subject: string; maxMarks: number; total: number; count: number }>();
    for (const r of filtered) {
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

    // Chapter weakness analysis from deviation_logs
    const devLogs = await db.select({
      chapter: deviationLogs.chapter,
      subject: deviationLogs.subject,
      marksAwarded: deviationLogs.marksAwarded,
      maxMarks: deviationLogs.maxMarks,
      admissionNumber: deviationLogs.admissionNumber,
    })
    .from(deviationLogs)
    .innerJoin(exams, eq(deviationLogs.examId, exams.id))
    .where(eq(exams.teacherId, teacherId));

    const chapterMap = new Map<string, { subject: string; totalScore: number; totalMax: number; count: number; students: Set<string> }>();
    for (const log of devLogs) {
      if (!log.chapter || log.chapter === "General") continue;
      if (classFilter || subjectFilter) {
        // For now skip class filtering on deviation logs (they don't store class directly)
        if (subjectFilter && log.subject !== subjectFilter) continue;
      }
      const key = `${log.chapter}__${log.subject}`;
      const cur = chapterMap.get(key) ?? { subject: log.subject, totalScore: 0, totalMax: 0, count: 0, students: new Set() };
      cur.totalScore += log.marksAwarded ?? 0;
      cur.totalMax += log.maxMarks ?? 1;
      cur.count++;
      cur.students.add(log.admissionNumber);
      chapterMap.set(key, cur);
    }
    const chapterWeakness = Array.from(chapterMap.entries())
      .map(([key, d]) => ({
        chapter: key.split("__")[0],
        subject: d.subject,
        avgScore: d.totalMax > 0 ? Math.round((d.totalScore / d.totalMax) * 100) : 0,
        totalQuestions: d.count,
        studentsAffected: d.students.size,
      }))
      .sort((a, b) => a.avgScore - b.avgScore) // weakest first
      .slice(0, 10);

    return { classAverages, studentPerformance, marksDistribution, improvementTrends, chapterWeakness };
  }

  // ─── ADMIN METHODS ──────────────────────────────────────────────────────────

  async getAdmin(id: number): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.id, id));
    return admin;
  }

  async getAdminByEmployeeId(employeeId: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.employeeId, employeeId));
    return admin;
  }

  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    const [created] = await db.insert(admins).values(admin).returning();
    return created;
  }

  async updateAdminPassword(id: number, passwordHash: string): Promise<void> {
    await db.update(admins).set({ password: passwordHash }).where(eq(admins.id, id));
  }

  async getAllStudents(): Promise<Student[]> {
    return db.select().from(students).orderBy(students.studentClass, students.section, students.name);
  }

  async getAllTeachers(): Promise<Teacher[]> {
    return db.select().from(teachers).orderBy(teachers.name);
  }

  async getAllExams(): Promise<Exam[]> {
    return db.select().from(exams).orderBy(desc(exams.id));
  }

  async getAllEvaluations(): Promise<any[]> {
    return db.select().from(evaluations).orderBy(evaluations.id);
  }

  async getAllAnswerSheets(): Promise<any[]> {
    return db.select().from(answerSheets).orderBy(answerSheets.id);
  }


  async getSchoolStats(): Promise<{
    totalStudents: number;
    totalTeachers: number;
    totalExams: number;
    sheetsEvaluated: number;
    avgPerformance: number;
    activeClasses: number;
    homeworkAssigned: number;
    homeworkSubmitted: number;
  }> {
    const [studentCount] = await db.select({ count: drizzleSql<number>`count(*)` }).from(students);
    const [teacherCount] = await db.select({ count: drizzleSql<number>`count(*)` }).from(teachers);
    const [examCount] = await db.select({ count: drizzleSql<number>`count(*)` }).from(exams);
    const [hwCount] = await db.select({ count: drizzleSql<number>`count(*)` }).from(homework);
    const [hwSubCount] = await db.select({ count: drizzleSql<number>`count(*)` }).from(homeworkSubmissions);

    const allEvals = await db.select({
      totalMarks: evaluations.totalMarks,
      answerSheetId: evaluations.answerSheetId,
    }).from(evaluations);

    const sheetsEvaluated = allEvals.length;

    // Get max marks per evaluation by joining with answer sheets and exams
    const evalData = await db
      .select({ marks: evaluations.totalMarks, maxMarks: exams.totalMarks })
      .from(evaluations)
      .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
      .innerJoin(exams, eq(answerSheets.examId, exams.id));

    const avgPerformance = evalData.length > 0
      ? Math.round(evalData.reduce((sum, e) => sum + (e.maxMarks > 0 ? e.marks / e.maxMarks : 0), 0) / evalData.length * 100)
      : 0;

    const classSet = new Set<string>();
    const allStudents = await db.select({ cls: students.studentClass, sec: students.section }).from(students);
    allStudents.forEach(s => classSet.add(`${s.cls}-${s.sec}`));

    return {
      totalStudents: Number(studentCount.count),
      totalTeachers: Number(teacherCount.count),
      totalExams: Number(examCount.count),
      sheetsEvaluated,
      avgPerformance,
      activeClasses: classSet.size,
      homeworkAssigned: Number(hwCount.count),
      homeworkSubmitted: Number(hwSubCount.count),
    };
  }

  async getSchoolAnalytics(): Promise<{
    classPerformance: { className: string; section: string; avgPct: number; studentCount: number; examCount: number }[];
    subjectPerformance: { subject: string; avgPct: number; examCount: number }[];
    teacherStats: { teacherId: number; teacherName: string; examsCreated: number; sheetsEvaluated: number; avgClassPct: number }[];
    homeworkStats: { className: string; totalAssigned: number; totalSubmitted: number; completionPct: number }[];
    marksDistribution: { range: string; count: number }[];
  }> {
    const evalData = await db
      .select({
        marks: evaluations.totalMarks,
        maxMarks: exams.totalMarks,
        subject: exams.subject,
        className: exams.className,
        teacherId: exams.teacherId,
        admissionNumber: evaluations.admissionNumber,
        examId: exams.id,
      })
      .from(evaluations)
      .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
      .innerJoin(exams, eq(answerSheets.examId, exams.id));

    // Class performance (aggregate by className + section from students)
    const studentData = await db.select({ admNo: students.admissionNumber, cls: students.studentClass, sec: students.section }).from(students);
    const studentMap = new Map(studentData.map(s => [s.admNo, { cls: s.cls, sec: s.sec }]));

    const classAccum = new Map<string, { total: number; count: number; students: Set<string>; exams: Set<number> }>();
    for (const e of evalData) {
      const studentInfo = studentMap.get(e.admissionNumber);
      const sec = studentInfo?.sec || "A";
      const key = `${e.className}-${sec}`;
      const cur = classAccum.get(key) || { total: 0, count: 0, students: new Set(), exams: new Set() };
      cur.total += e.maxMarks > 0 ? e.marks / e.maxMarks : 0;
      cur.count++;
      cur.students.add(e.admissionNumber);
      cur.exams.add(e.examId);
      classAccum.set(key, cur);
    }
    const classPerformance = Array.from(classAccum.entries())
      .map(([key, d]) => {
        const [className, section] = key.split("-");
        return { className, section, avgPct: Math.round((d.total / d.count) * 100), studentCount: d.students.size, examCount: d.exams.size };
      })
      .sort((a, b) => b.avgPct - a.avgPct);

    // Subject performance
    const subjAccum = new Map<string, { total: number; count: number; exams: Set<number> }>();
    for (const e of evalData) {
      const cur = subjAccum.get(e.subject) || { total: 0, count: 0, exams: new Set() };
      cur.total += e.maxMarks > 0 ? e.marks / e.maxMarks : 0;
      cur.count++;
      cur.exams.add(e.examId);
      subjAccum.set(e.subject, cur);
    }
    const subjectPerformance = Array.from(subjAccum.entries())
      .map(([subject, d]) => ({ subject, avgPct: Math.round((d.total / d.count) * 100), examCount: d.exams.size }))
      .sort((a, b) => b.avgPct - a.avgPct);

    // Teacher stats
    const allTeachers = await db.select().from(teachers);
    const teacherStats = await Promise.all(allTeachers.map(async (t) => {
      const tEvals = evalData.filter(e => e.teacherId === t.id);
      const examSet = new Set(tEvals.map(e => e.examId));
      const avgPct = tEvals.length > 0 ? Math.round(tEvals.reduce((s, e) => s + (e.maxMarks > 0 ? e.marks / e.maxMarks : 0), 0) / tEvals.length * 100) : 0;
      return { teacherId: t.id, teacherName: t.name, examsCreated: examSet.size, sheetsEvaluated: tEvals.length, avgClassPct: avgPct };
    }));

    // Homework stats
    const hwData = await db.select().from(homework);
    const hwSubs = await db.select().from(homeworkSubmissions);
    const hwClassAccum = new Map<string, { assigned: number; submitted: number }>();
    for (const hw of hwData) {
      const key = `${hw.className}-${hw.section}`;
      const cur = hwClassAccum.get(key) || { assigned: 0, submitted: 0 };
      cur.assigned++;
      hwClassAccum.set(key, cur);
    }
    for (const sub of hwSubs) {
      const hw = hwData.find(h => h.id === sub.homeworkId);
      if (hw) {
        const key = `${hw.className}-${hw.section}`;
        const cur = hwClassAccum.get(key);
        if (cur) cur.submitted++;
      }
    }
    const homeworkStats = Array.from(hwClassAccum.entries())
      .map(([key, d]) => ({
        className: key,
        totalAssigned: d.assigned,
        totalSubmitted: d.submitted,
        completionPct: d.assigned > 0 ? Math.round((d.submitted / d.assigned) * 100) : 0,
      }));

    // Marks distribution
    const dist = [
      { range: "0–25%", count: 0 }, { range: "26–50%", count: 0 },
      { range: "51–75%", count: 0 }, { range: "76–100%", count: 0 },
    ];
    for (const e of evalData) {
      const pct = e.maxMarks > 0 ? (e.marks / e.maxMarks) * 100 : 0;
      if (pct <= 25) dist[0].count++;
      else if (pct <= 50) dist[1].count++;
      else if (pct <= 75) dist[2].count++;
      else dist[3].count++;
    }

    return { classPerformance, subjectPerformance, teacherStats, homeworkStats, marksDistribution: dist };
  }

  async getAdminKPIs() {
    // Get all evaluations with context
    const evalData = await db
      .select({
        admissionNumber: evaluations.admissionNumber,
        marks: evaluations.totalMarks,
        maxMarks: exams.totalMarks,
        examId: exams.id,
        subject: exams.subject,
        className: exams.className,
        teacherId: exams.teacherId,
      })
      .from(evaluations)
      .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
      .innerJoin(exams, eq(answerSheets.examId, exams.id))
      .orderBy(exams.id);

    // Per-student avg
    const studentAccum = new Map<string, { pctsInOrder: number[] }>();
    for (const e of evalData) {
      const pct = e.maxMarks > 0 ? (e.marks / e.maxMarks) * 100 : 0;
      const cur = studentAccum.get(e.admissionNumber) || { pctsInOrder: [] };
      cur.pctsInOrder.push(pct);
      studentAccum.set(e.admissionNumber, cur);
    }

    // 1. Improvement Index — students whose last exam > first exam
    let improvementCount = 0;
    let studentsWithMultiple = 0;
    studentAccum.forEach(({ pctsInOrder }) => {
      if (pctsInOrder.length >= 2) {
        studentsWithMultiple++;
        if (pctsInOrder[pctsInOrder.length - 1] > pctsInOrder[0]) improvementCount++;
      }
    });
    const improvementIndex = studentsWithMultiple > 0 ? Math.round((improvementCount / studentsWithMultiple) * 100) : 0;

    // 2. Intervention Count — students with avg < 50%
    let interventionCount = 0;
    studentAccum.forEach(({ pctsInOrder }) => {
      const avg = pctsInOrder.reduce((s, p) => s + p, 0) / pctsInOrder.length;
      if (avg < 50) interventionCount++;
    });

    // 3. School avg performance
    const avgPerformance = evalData.length > 0
      ? evalData.reduce((s, e) => s + (e.maxMarks > 0 ? e.marks / e.maxMarks * 100 : 0), 0) / evalData.length
      : 0;

    // 4. Homework stats
    const hwData = await db.select().from(homework);
    const hwSubs = await db.select().from(homeworkSubmissions);
    const hwAssigned = hwData.length;
    const hwSubmitted = hwSubs.length;
    const engagementIndex = hwAssigned > 0 ? Math.round((hwSubmitted / hwAssigned) * 100) : 0;

    // 5. Homework effectiveness — ratio of completed vs needs_improvement
    const completedHw = hwSubs.filter(s => s.status === "completed").length;
    const needsImpHw = hwSubs.filter(s => s.status === "needs_improvement").length;
    const totalGraded = completedHw + needsImpHw;
    const hwEffectiveness = totalGraded > 0 ? Math.round((completedHw / totalGraded) * 100) : 0;
    const avgCorrectness = hwSubs.length > 0
      ? Math.round(hwSubs.reduce((s, h) => s + (h.correctnessScore || 0), 0) / hwSubs.length)
      : 0;
    const homeworkEffectivenessIndex = avgCorrectness > 0 ? avgCorrectness : hwEffectiveness;

    // 6. Teacher Effectiveness Score — consistency across class avgs (lower std dev = higher score)
    const classAccum = new Map<string, number[]>();
    for (const e of evalData) {
      const pct = e.maxMarks > 0 ? (e.marks / e.maxMarks) * 100 : 0;
      const key = e.className;
      const cur = classAccum.get(key) || [];
      cur.push(pct);
      classAccum.set(key, cur);
    }
    const classAvgs = Array.from(classAccum.values()).map(pcts => pcts.reduce((s, p) => s + p, 0) / pcts.length);
    let teacherEffectivenessScore = 75;
    if (classAvgs.length >= 2) {
      const mean = classAvgs.reduce((s, v) => s + v, 0) / classAvgs.length;
      const variance = classAvgs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / classAvgs.length;
      const stdDev = Math.sqrt(variance);
      teacherEffectivenessScore = Math.max(0, Math.round(100 - stdDev));
    } else if (classAvgs.length === 1) {
      teacherEffectivenessScore = Math.round(classAvgs[0]);
    }

    // Health Score = weighted composite
    const evaluationRate = evalData.length > 0 ? Math.min(100, Math.round(evalData.length / Math.max(1, hwAssigned + 1) * 100)) : 0;
    const healthScore = Math.round(
      avgPerformance * 0.5 +
      engagementIndex * 0.25 +
      teacherEffectivenessScore * 0.25
    );
    const healthGrade = healthScore >= 80 ? "A" : healthScore >= 65 ? "B" : healthScore >= 50 ? "C" : "D";

    // More Insights
    // Class stability (std dev per class)
    const classStability = Array.from(classAccum.entries()).map(([cls, pcts]) => {
      const mean = pcts.reduce((s, p) => s + p, 0) / pcts.length;
      const variance = pcts.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / pcts.length;
      const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;
      return { className: cls, stdDev, label: stdDev < 10 ? "Stable" : stdDev < 20 ? "Moderate" : "Volatile" };
    }).sort((a, b) => a.stdDev - b.stdDev);

    // Subject difficulty
    const subjAccum = new Map<string, number[]>();
    for (const e of evalData) {
      const pct = e.maxMarks > 0 ? (e.marks / e.maxMarks) * 100 : 0;
      const cur = subjAccum.get(e.subject) || [];
      cur.push(pct);
      subjAccum.set(e.subject, cur);
    }
    const subjectDifficulty = Array.from(subjAccum.entries()).map(([subject, pcts]) => {
      const avgPct = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
      return { subject, avgPct, trend: avgPct >= 70 ? "Easy" : avgPct >= 55 ? "Medium" : "Hard" };
    }).sort((a, b) => a.avgPct - b.avgPct);

    // Rank distribution
    const bands = [
      { band: "A+ (90–100%)", min: 90, max: 100, count: 0 },
      { band: "A (75–89%)", min: 75, max: 89, count: 0 },
      { band: "B (60–74%)", min: 60, max: 74, count: 0 },
      { band: "C (45–59%)", min: 45, max: 59, count: 0 },
      { band: "D (<45%)", min: 0, max: 44, count: 0 },
    ];
    studentAccum.forEach(({ pctsInOrder }) => {
      const avg = pctsInOrder.reduce((s, p) => s + p, 0) / pctsInOrder.length;
      const band = bands.find(b => avg >= b.min && avg <= b.max);
      if (band) band.count++;
    });
    const totalStudentsInEval = studentAccum.size;
    const rankDistribution = bands.map(b => ({
      band: b.band, count: b.count,
      pct: totalStudentsInEval > 0 ? Math.round((b.count / totalStudentsInEval) * 100) : 0,
    }));

    // Engagement alerts
    const hwClassMap = new Map<string, { assigned: number; submitted: number }>();
    for (const hw of hwData) {
      const key = `${hw.className}-${hw.section}`;
      const cur = hwClassMap.get(key) || { assigned: 0, submitted: 0 };
      cur.assigned++;
      hwClassMap.set(key, cur);
    }
    for (const sub of hwSubs) {
      const hw = hwData.find(h => h.id === sub.homeworkId);
      if (hw) {
        const key = `${hw.className}-${hw.section}`;
        const cur = hwClassMap.get(key);
        if (cur) cur.submitted++;
      }
    }
    const engagementAlerts = Array.from(hwClassMap.entries())
      .map(([className, d]) => ({
        className,
        completionPct: d.assigned > 0 ? Math.round((d.submitted / d.assigned) * 100) : 0,
        alert: d.assigned > 0 && (d.submitted / d.assigned) < 0.5 ? "Low submission rate" : "",
      }))
      .filter(a => a.alert);

    return {
      healthScore,
      healthGrade,
      improvementIndex,
      improvementCount,
      improvementTotal: studentsWithMultiple,
      interventionCount,
      teacherEffectivenessScore,
      engagementIndex,
      homeworkEffectivenessIndex,
      moreInsights: { classStability, subjectDifficulty, rankDistribution, engagementAlerts },
    };
  }

  async updateProfile(role: "student" | "teacher" | "admin" | "principal", id: number, data: { name?: string; phone?: string; profilePhotoUrl?: string }): Promise<void> {
    if (role === "student") {
      await db.update(students).set(data).where(eq(students.id, id));
    } else if (role === "teacher") {
      await db.update(teachers).set(data).where(eq(teachers.id, id));
    } else if (role === "principal") {
      const mapped: any = {};
      if (data.name !== undefined) mapped.name = data.name;
      if (data.phone !== undefined) mapped.phoneNumber = data.phone;
      if (data.profilePhotoUrl !== undefined) mapped.profilePhotoUrl = data.profilePhotoUrl;
      await db.update(adminUsers).set({ ...mapped, updatedAt: new Date().toISOString() }).where(eq(adminUsers.id, id));
    } else {
      const mapped: any = {};
      if (data.name !== undefined) mapped.name = data.name;
      if (data.phone !== undefined) mapped.phoneNumber = data.phone;
      if (data.profilePhotoUrl !== undefined) mapped.profilePhotoUrl = data.profilePhotoUrl;
      const existingAdminUser = await this.getAdminUserById(id);
      if (existingAdminUser) {
        await db.update(adminUsers).set({ ...mapped, updatedAt: new Date().toISOString() }).where(eq(adminUsers.id, id));
      } else {
        await db.update(admins).set(data).where(eq(admins.id, id));
      }
    }
  }

  // ─── ADMIN CRUD: Teachers ────────────────────────────────────────────────────
  async updateTeacher(id: number, data: Partial<InsertTeacher>): Promise<Teacher> {
    const [updated] = await db.update(teachers).set(data).where(eq(teachers.id, id)).returning();
    return updated;
  }

  async deleteTeacher(id: number): Promise<void> {
    await db.delete(teachers).where(eq(teachers.id, id));
  }

  // ─── ADMIN CRUD: Students ───────────────────────────────────────────────────
  async updateStudent(id: number, data: Partial<InsertStudent>): Promise<Student> {
    const [updated] = await db.update(students).set(data).where(eq(students.id, id)).returning();
    return updated;
  }

  async deleteStudent(id: number): Promise<void> {
    await db.delete(students).where(eq(students.id, id));
  }

  // ─── Classes ─────────────────────────────────────────────────────────────────
  async getAllClasses(): Promise<Class[]> {
    return db.select().from(classes).orderBy(classes.name, classes.section);
  }

  async createClass(cls: InsertClass): Promise<Class> {
    const [created] = await db.insert(classes).values(cls).returning();
    return created;
  }

  async updateClass(id: number, data: Partial<InsertClass>): Promise<Class> {
    const [updated] = await db.update(classes).set(data).where(eq(classes.id, id)).returning();
    return updated;
  }

  async deleteClass(id: number): Promise<void> {
    await db.delete(classes).where(eq(classes.id, id));
  }

  // ─── Subjects ────────────────────────────────────────────────────────────────
  async getAllSubjects(): Promise<Subject[]> {
    return db.select().from(subjects).orderBy(subjects.name);
  }

  async createSubject(subj: InsertSubject): Promise<Subject> {
    const [created] = await db.insert(subjects).values(subj).returning();
    return created;
  }

  async updateSubject(id: number, data: Partial<InsertSubject>): Promise<Subject> {
    const [updated] = await db.update(subjects).set(data).where(eq(subjects.id, id)).returning();
    return updated;
  }

  async deleteSubject(id: number): Promise<void> {
    await db.delete(subjects).where(eq(subjects.id, id));
  }

  // ─── OTP ─────────────────────────────────────────────────────────────────────
  async createOtp(phone: string, code: string, role: string, identifier: string, expiresAt: string): Promise<OtpCode> {
    const [created] = await db.insert(otpCodes).values({ phone, code, role, identifier, expiresAt }).returning();
    return created;
  }

  async getLatestOtp(phone: string, identifier: string): Promise<OtpCode | undefined> {
    const [otp] = await db.select().from(otpCodes)
      .where(and(eq(otpCodes.phone, phone), eq(otpCodes.identifier, identifier), eq(otpCodes.verified, 0)))
      .orderBy(desc(otpCodes.id))
      .limit(1);
    return otp;
  }

  async markOtpVerified(id: number): Promise<void> {
    await db.update(otpCodes).set({ verified: 1 }).where(eq(otpCodes.id, id));
  }
  // ─── AdminUsers ────────────────────────────────────────────────────────────
  async getAdminUserByEmployeeId(employeeId: string): Promise<AdminUser | undefined> {
    const [u] = await db.select().from(adminUsers).where(eq(adminUsers.employeeId, employeeId)).limit(1);
    return u;
  }

  async getAdminUserById(id: number): Promise<AdminUser | undefined> {
    const [u] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
    return u;
  }

  async createAdminUser(data: InsertAdminUser): Promise<AdminUser> {
    const [created] = await db.insert(adminUsers).values(data).returning();
    return created;
  }

  async getAllAdminUsers(): Promise<AdminUser[]> {
    return db.select().from(adminUsers).orderBy(adminUsers.name);
  }

  async updateAdminUserPassword(id: number, passwordHash: string): Promise<void> {
    await db.update(adminUsers).set({ passwordHash, updatedAt: new Date().toISOString() }).where(eq(adminUsers.id, id));
  }

  // ─── ClassSections ──────────────────────────────────────────────────────────
  async getAllClassSections(): Promise<ClassSection[]> {
    return db.select().from(classSections).orderBy(classSections.className, classSections.section);
  }

  async getClassSectionByClassAndSection(className: number, section: string): Promise<ClassSection | undefined> {
    const [c] = await db.select().from(classSections)
      .where(and(eq(classSections.className, className), eq(classSections.section, section)))
      .limit(1);
    return c;
  }

  async createClassSection(data: InsertClassSection): Promise<ClassSection> {
    const [created] = await db.insert(classSections).values(data).returning();
    return created;
  }

  async updateClassSection(id: number, data: Partial<InsertClassSection>): Promise<ClassSection> {
    const [updated] = await db.update(classSections).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(classSections.id, id)).returning();
    return updated;
  }

  async deleteClassSection(id: number): Promise<void> {
    await db.delete(classSections).where(eq(classSections.id, id));
  }

  async bulkCreateClassSections(records: InsertClassSection[]): Promise<{ created: number; duplicates: string[] }> {
    let created = 0;
    const duplicates: string[] = [];
    for (const r of records) {
      const existing = await this.getClassSectionByClassAndSection(r.className, r.section);
      if (existing) { duplicates.push(String(r.className) + "-" + r.section); continue; }
      await this.createClassSection(r);
      created++;
    }
    return { created, duplicates };
  }

  // ─── ManagedStudents ────────────────────────────────────────────────────────
  async getAllManagedStudents(): Promise<ManagedStudent[]> {
    return db.select().from(managedStudents).orderBy(managedStudents.studentName);
  }

  async getManagedStudentByAdmission(admissionNumber: string): Promise<ManagedStudent | undefined> {
    const [s] = await db.select().from(managedStudents).where(eq(managedStudents.admissionNumber, admissionNumber)).limit(1);
    return s;
  }

  async createManagedStudent(data: InsertManagedStudent): Promise<ManagedStudent> {
    const [created] = await db.insert(managedStudents).values(data).returning();
    return created;
  }

  async updateManagedStudent(id: number, data: Partial<InsertManagedStudent>): Promise<ManagedStudent> {
    const [updated] = await db.update(managedStudents).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(managedStudents.id, id)).returning();
    return updated;
  }

  async deleteManagedStudent(id: number): Promise<void> {
    await db.delete(managedStudents).where(eq(managedStudents.id, id));
  }

  async bulkCreateManagedStudents(records: InsertManagedStudent[]): Promise<{ created: number; duplicates: string[] }> {
    let created = 0;
    const duplicates: string[] = [];
    for (const r of records) {
      const existing = await this.getManagedStudentByAdmission(r.admissionNumber);
      if (existing) { duplicates.push(r.admissionNumber); continue; }
      await this.createManagedStudent(r);
      created++;
    }
    return { created, duplicates };
  }

  // ─── ManagedTeachers ────────────────────────────────────────────────────────
  async getAllManagedTeachers(): Promise<ManagedTeacher[]> {
    return db.select().from(managedTeachers).orderBy(managedTeachers.teacherName);
  }

  async getManagedTeacherByEmployeeId(employeeId: string): Promise<ManagedTeacher | undefined> {
    const [t] = await db.select().from(managedTeachers).where(eq(managedTeachers.employeeId, employeeId)).limit(1);
    return t;
  }

  async getManagedTeacherById(id: number): Promise<ManagedTeacher | undefined> {
    const [t] = await db.select().from(managedTeachers).where(eq(managedTeachers.id, id)).limit(1);
    return t;
  }

  async createManagedTeacher(data: InsertManagedTeacher): Promise<ManagedTeacher> {
    const [created] = await db.insert(managedTeachers).values(data).returning();
    return created;
  }

  async updateManagedTeacher(id: number, data: Partial<InsertManagedTeacher>): Promise<ManagedTeacher> {
    const [updated] = await db.update(managedTeachers).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(managedTeachers.id, id)).returning();
    return updated;
  }

  async deleteManagedTeacher(id: number): Promise<void> {
    await db.delete(managedTeachers).where(eq(managedTeachers.id, id));
  }

  async bulkCreateManagedTeachers(records: InsertManagedTeacher[]): Promise<{ created: number; duplicates: string[] }> {
    let created = 0;
    const duplicates: string[] = [];
    for (const r of records) {
      const existing = await this.getManagedTeacherByEmployeeId(r.employeeId);
      if (existing) { duplicates.push(r.employeeId); continue; }
      await this.createManagedTeacher(r);
      created++;
    }
    return { created, duplicates };
  }

}

export const storage = new DatabaseStorage();
