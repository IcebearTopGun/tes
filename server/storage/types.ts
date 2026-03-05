import {
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
  updateExam(id: number, data: Partial<InsertExam>): Promise<Exam>;
  deleteExam(id: number): Promise<void>;

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
  getHomeworkSubmissionsByHomework(homeworkId: number): Promise<HomeworkSubmission[]>;
  getHomeworkSubmissionById(id: number): Promise<HomeworkSubmission | undefined>;
  updateHomeworkSubmission(id: number, data: Partial<InsertHomeworkSubmission>): Promise<HomeworkSubmission>;
  updateHomework(id: number, data: Partial<InsertHomework>): Promise<Homework>;
  deleteHomework(id: number): Promise<void>;
  getHomeworkAnalyticsByStudent(admissionNumber: string): Promise<any>;
  getHomeworkAnalyticsByTeacher(teacherId: number): Promise<any>;
  getHomeworkEvaluationsByHomework(homeworkId: number): Promise<any[]>;

  // Admin
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  getAdmin(id: number): Promise<Admin | undefined>;
  getAdminByEmployeeId(employeeId: string): Promise<Admin | undefined>;
  getSchoolStats(): Promise<{ totalStudents: number; totalTeachers: number; totalExams: number; totalEvaluations: number }>;
  getSchoolAnalytics(): Promise<{
    classPerformance: { className: string; avgPct: number; examCount: number }[];
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

  // Admin Users
  createAdminUser(adminUser: InsertAdminUser): Promise<AdminUser>;
  getAdminUserByEmployeeId(employeeId: string): Promise<AdminUser | undefined>;
  getAdminUserById(id: number): Promise<AdminUser | undefined>;
  updateAdminUser(id: number, data: Partial<InsertAdminUser>): Promise<AdminUser>;

  // Class Sections
  createClassSection(section: InsertClassSection): Promise<ClassSection>;
  getAllClassSections(): Promise<ClassSection[]>;
  updateClassSection(id: number, data: Partial<InsertClassSection>): Promise<ClassSection>;
  deleteClassSection(id: number): Promise<void>;
  getClassSectionByClassAndSection(className: number, section: string): Promise<ClassSection | undefined>;

  // Managed Students
  createManagedStudent(student: InsertManagedStudent): Promise<ManagedStudent>;
  getManagedStudents(): Promise<ManagedStudent[]>;
  updateManagedStudent(id: number, data: Partial<InsertManagedStudent>): Promise<ManagedStudent>;
  deleteManagedStudent(id: number): Promise<void>;

  // Managed Teachers
  createManagedTeacher(teacher: InsertManagedTeacher): Promise<ManagedTeacher>;
  getManagedTeachers(): Promise<ManagedTeacher[]>;
  updateManagedTeacher(id: number, data: Partial<InsertManagedTeacher>): Promise<ManagedTeacher>;
  deleteManagedTeacher(id: number): Promise<void>;

  // Managed helpers
  getAllTeachers(): Promise<Teacher[]>;
  getAllStudents(): Promise<Student[]>;
  getAllExams(): Promise<Exam[]>;
  getAllAnswerSheets(): Promise<any[]>;
  getAllEvaluations(): Promise<any[]>;
  getStudentsByClassAndSection(className: string, section: string): Promise<Student[]>;
}

/*
File Purpose:
This file defines the storage interface contract used by the server.

Responsibilities:

* Declares all storage operations required by routes and services
* Types the data access layer for teachers, students, exams, homework, and admin features

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
