import { db } from "./db";
import {
  teachers, students, exams, answerSheets, evaluations, conversations, messages,
  answerSheetPages, mergedAnswerScripts, ncertChapters, deviationLogs, performanceProfiles,
  homework, homeworkSubmissions, admins,
  type Teacher, type Student, type Exam, type Admin,
  type InsertTeacher, type InsertStudent, type InsertExam, type InsertAdmin,
  type NcertChapter, type InsertNcertChapter,
  type Homework, type InsertHomework, type HomeworkSubmission, type InsertHomeworkSubmission,
} from "@shared/schema";
import { eq, and, desc, sql as drizzleSql, count } from "drizzle-orm";

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

  // Admin
  getAdmin(id: number): Promise<Admin | undefined>;
  getAdminByEmployeeId(employeeId: string): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
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

  async getHomeworkByTeacher(teacherId: number): Promise<Homework[]> {
    return await db.select().from(homework).where(eq(homework.teacherId, teacherId)).orderBy(desc(homework.id));
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

    return {
      totalStudents: studentSet.size || 0,
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

  async getAllStudents(): Promise<Student[]> {
    return db.select().from(students).orderBy(students.studentClass, students.section, students.name);
  }

  async getAllTeachers(): Promise<Teacher[]> {
    return db.select().from(teachers).orderBy(teachers.name);
  }

  async getAllExams(): Promise<Exam[]> {
    return db.select().from(exams).orderBy(desc(exams.id));
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
}

export const storage = new DatabaseStorage();
