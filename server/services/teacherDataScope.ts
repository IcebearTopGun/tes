import { db } from "../db";
import {
  teachers,
  students,
  evaluations,
  answerSheets,
  exams,
  homework,
  homeworkSubmissions,
  deviationLogs,
} from "../../shared/schema";
import { eq, desc, and, inArray } from "drizzle-orm";

export interface TeacherScope {
  isClassTeacher: boolean;
  classTeacherOf: string;
  subjectsAssigned: string[];
  classesAssigned: string[];
}

function parseJson(raw: string | null | undefined, fallback: any = []): any {
  try { return JSON.parse(raw || "[]"); } catch { return fallback; }
}

export async function getTeacherScope(teacherId: number): Promise<TeacherScope> {
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId));
  if (!teacher) throw new Error("Teacher not found");
  return {
    isClassTeacher: teacher.isClassTeacher === 1,
    classTeacherOf: teacher.classTeacherOf || "",
    subjectsAssigned: parseJson(teacher.subjectsAssigned),
    classesAssigned: parseJson(teacher.classesAssigned),
  };
}

function parseClassTeacherOf(classTeacherOf: string): { className: string; section: string } {
  const [className, section] = (classTeacherOf || "").split("-");
  return { className: className || "", section: section || "" };
}

export async function getClassViewAnalytics(classTeacherOf: string) {
  const { className, section } = parseClassTeacherOf(classTeacherOf);
  if (!className) return null;

  const classStudents = await db
    .select()
    .from(students)
    .where(
      section
        ? and(eq(students.studentClass, className), eq(students.section, section))
        : eq(students.studentClass, className)
    );

  if (classStudents.length === 0) return null;
  const admNums = classStudents.map((s) => s.admissionNumber);

  const rows = await db
    .select({
      evalId: evaluations.id,
      studentName: evaluations.studentName,
      admissionNumber: evaluations.admissionNumber,
      totalMarks: evaluations.totalMarks,
      examId: exams.id,
      examName: exams.examName,
      subject: exams.subject,
      className: exams.className,
      maxMarks: exams.totalMarks,
    })
    .from(evaluations)
    .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
    .innerJoin(exams, eq(answerSheets.examId, exams.id))
    .where(inArray(evaluations.admissionNumber, admNums))
    .orderBy(desc(evaluations.id));

  const subjectMap = new Map<string, { total: number; maxMarks: number; count: number }>();
  for (const r of rows) {
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

  const studentPerf = new Map<string, { name: string; total: number; max: number; count: number }>();
  for (const r of rows) {
    const cur = studentPerf.get(r.admissionNumber) ?? { name: r.studentName, total: 0, max: 0, count: 0 };
    cur.total += r.totalMarks;
    cur.max += r.maxMarks;
    cur.count += 1;
    studentPerf.set(r.admissionNumber, cur);
  }
  const studentPerformance = Array.from(studentPerf.values())
    .map((s) => ({
      studentName: s.name.split(" ")[0],
      totalMarks: s.total,
      maxMarks: s.max,
      examName: "All Subjects",
      subject: "Combined",
      pct: s.max > 0 ? Math.round((s.total / s.max) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 15);

  const buckets = [
    { range: "0–25%", min: 0, max: 25, count: 0 },
    { range: "26–50%", min: 26, max: 50, count: 0 },
    { range: "51–75%", min: 51, max: 75, count: 0 },
    { range: "76–100%", min: 76, max: 100, count: 0 },
  ];
  for (const s of studentPerformance) {
    for (const b of buckets) {
      if (s.pct >= b.min && s.pct <= b.max) { b.count++; break; }
    }
  }
  const marksDistribution = buckets.map(({ range, count }) => ({ range, count }));

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

  return { classAverages, studentPerformance, marksDistribution, improvementTrends, chapterWeakness: [] };
}

export interface QuestionQualityItem {
  examId: number;
  examName: string;
  subject: string;
  questionNumber: number | string;
  avgPct: number;
  studentsAffected: number;
  sampleDeviations: string[];
  flag: "Teaching Gap" | "Question Clarity" | "Pending";
  flagReason: string;
}

export async function computeQuestionQuality(teacherId: number): Promise<QuestionQualityItem[]> {
  const rows = await db
    .select({
      evalId: evaluations.id,
      admissionNumber: evaluations.admissionNumber,
      questions: evaluations.questions,
      examId: exams.id,
      examName: exams.examName,
      subject: exams.subject,
    })
    .from(evaluations)
    .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
    .innerJoin(exams, eq(answerSheets.examId, exams.id))
    .where(eq(exams.teacherId, teacherId));

  type AggEntry = {
    examId: number;
    examName: string;
    subject: string;
    questionNumber: number | string;
    totalMarks: number;
    maxMarks: number;
    students: Set<string>;
    deviationReasons: string[];
  };

  const questionMap = new Map<string, AggEntry>();

  for (const row of rows) {
    let qs: any[] = [];
    try { qs = JSON.parse(row.questions || "[]"); } catch { continue; }

    for (const q of qs) {
      const qNum = q.question_number ?? q.questionNumber ?? "?";
      const key = `${row.examId}_Q${qNum}`;
      const cur: AggEntry = questionMap.get(key) ?? {
        examId: row.examId,
        examName: row.examName,
        subject: row.subject,
        questionNumber: qNum,
        totalMarks: 0,
        maxMarks: 0,
        students: new Set(),
        deviationReasons: [],
      };

      cur.totalMarks += q.marks_awarded ?? 0;
      cur.maxMarks += q.max_marks ?? 0;
      cur.students.add(row.admissionNumber);
      if (q.deviation_reason && cur.deviationReasons.length < 4) {
        cur.deviationReasons.push(q.deviation_reason);
      }
      questionMap.set(key, cur);
    }
  }

  const poorQuestions = Array.from(questionMap.values())
    .filter((d) => d.maxMarks > 0 && d.totalMarks / d.maxMarks < 0.5)
    .map((d) => ({
      examId: d.examId,
      examName: d.examName,
      subject: d.subject,
      questionNumber: d.questionNumber,
      avgPct: Math.round((d.totalMarks / d.maxMarks) * 100),
      studentsAffected: d.students.size,
      sampleDeviations: d.deviationReasons,
      flag: "Pending" as const,
      flagReason: "",
    }))
    .sort((a, b) => a.avgPct - b.avgPct)
    .slice(0, 6);

  return poorQuestions;
}

export interface EarlyWarningItem {
  admissionNumber: string;
  studentName: string;
  studentClass: string;
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  scoreTrend: number;
  hwMissRate: number;
  recentAvgPct: number;
  earlierAvgPct: number;
  hwSubmitted: number;
  hwTotal: number;
}

export async function computeEarlyWarnings(teacherId: number): Promise<EarlyWarningItem[]> {
  const allEvals = await db
    .select({
      admissionNumber: evaluations.admissionNumber,
      studentName: evaluations.studentName,
      totalMarks: evaluations.totalMarks,
      maxMarks: exams.totalMarks,
      className: exams.className,
      evalId: evaluations.id,
    })
    .from(evaluations)
    .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
    .innerJoin(exams, eq(answerSheets.examId, exams.id))
    .where(eq(exams.teacherId, teacherId))
    .orderBy(evaluations.id);

  const allHw = await db
    .select()
    .from(homework)
    .where(eq(homework.teacherId, teacherId));

  const hwSubs = await db
    .select({
      admissionNumber: homeworkSubmissions.admissionNumber,
      homeworkId: homeworkSubmissions.homeworkId,
      status: homeworkSubmissions.status,
    })
    .from(homeworkSubmissions)
    .innerJoin(homework, eq(homeworkSubmissions.homeworkId, homework.id))
    .where(eq(homework.teacherId, teacherId));

  const hwSubsMap = new Map<string, Set<number>>();
  for (const sub of hwSubs) {
    const s = hwSubsMap.get(sub.admissionNumber) ?? new Set();
    s.add(sub.homeworkId);
    hwSubsMap.set(sub.admissionNumber, s);
  }

  const studentMap = new Map<string, {
    name: string;
    className: string;
    evals: Array<{ pct: number; evalId: number }>;
  }>();

  for (const row of allEvals) {
    const pct = row.maxMarks > 0 ? (row.totalMarks / row.maxMarks) * 100 : 0;
    const cur = studentMap.get(row.admissionNumber) ?? {
      name: row.studentName,
      className: row.className,
      evals: [],
    };
    cur.evals.push({ pct, evalId: row.evalId });
    studentMap.set(row.admissionNumber, cur);
  }

  const totalHw = allHw.length;
  const warnings: EarlyWarningItem[] = [];

  for (const [admNum, info] of studentMap.entries()) {
    const { evals } = info;
    if (evals.length === 0) continue;

    let earlierAvgPct = 0;
    let recentAvgPct = 0;

    if (evals.length === 1) {
      recentAvgPct = evals[0].pct;
      earlierAvgPct = evals[0].pct;
    } else {
      const mid = Math.ceil(evals.length / 2);
      const earlier = evals.slice(0, mid);
      const recent = evals.slice(mid);
      earlierAvgPct = earlier.reduce((s, e) => s + e.pct, 0) / earlier.length;
      recentAvgPct = recent.reduce((s, e) => s + e.pct, 0) / recent.length;
    }

    const scoreTrend = earlierAvgPct - recentAvgPct;

    const submitted = hwSubsMap.get(admNum)?.size ?? 0;
    const hwMissRate = totalHw > 0 ? (totalHw - submitted) / totalHw : 0;

    const trendNorm = Math.max(0, Math.min(100, scoreTrend)) / 100;
    const riskScore = Math.round(trendNorm * 60 + hwMissRate * 40);

    const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
      riskScore >= 50 ? "HIGH" : riskScore >= 25 ? "MEDIUM" : "LOW";

    warnings.push({
      admissionNumber: admNum,
      studentName: info.name,
      studentClass: info.className,
      riskScore,
      riskLevel,
      scoreTrend: Math.round(scoreTrend * 10) / 10,
      hwMissRate: Math.round(hwMissRate * 100),
      recentAvgPct: Math.round(recentAvgPct),
      earlierAvgPct: Math.round(earlierAvgPct),
      hwSubmitted: submitted,
      hwTotal: totalHw,
    });
  }

  return warnings.sort((a, b) => b.riskScore - a.riskScore);
}

export async function buildSubjectAIContext(teacherId: number): Promise<string> {
  const [evalRows, hwSubs] = await Promise.all([
    db
      .select({
        studentName: evaluations.studentName,
        admissionNumber: evaluations.admissionNumber,
        totalMarks: evaluations.totalMarks,
        subject: exams.subject,
        examName: exams.examName,
        overallFeedback: evaluations.overallFeedback,
      })
      .from(evaluations)
      .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
      .innerJoin(exams, eq(answerSheets.examId, exams.id))
      .where(eq(exams.teacherId, teacherId))
      .orderBy(desc(evaluations.id))
      .limit(60),
    db
      .select({
        admissionNumber: homeworkSubmissions.admissionNumber,
        subject: homework.subject,
        status: homeworkSubmissions.status,
        correctnessScore: homeworkSubmissions.correctnessScore,
        isOnTime: homeworkSubmissions.isOnTime,
      })
      .from(homeworkSubmissions)
      .innerJoin(homework, eq(homeworkSubmissions.homeworkId, homework.id))
      .where(eq(homework.teacherId, teacherId))
      .limit(80),
  ]);

  return `SCOPE: Subject Teacher View (own subjects only)
EXAM EVALUATIONS: ${JSON.stringify(evalRows)}
HOMEWORK DATA: ${hwSubs.length > 0 ? JSON.stringify(hwSubs) : "No submissions yet."}`;
}

export async function buildClassAIContext(classTeacherOf: string, teacherId: number): Promise<string> {
  const { className, section } = parseClassTeacherOf(classTeacherOf);
  if (!className) return "No class assigned.";

  const classStudents = await db
    .select()
    .from(students)
    .where(
      section
        ? and(eq(students.studentClass, className), eq(students.section, section))
        : eq(students.studentClass, className)
    );

  if (classStudents.length === 0) return `No students found in class ${classTeacherOf}.`;
  const admNums = classStudents.map((s) => s.admissionNumber);

  const [evalRows, hwData] = await Promise.all([
    db
      .select({
        studentName: evaluations.studentName,
        admissionNumber: evaluations.admissionNumber,
        totalMarks: evaluations.totalMarks,
        subject: exams.subject,
        examName: exams.examName,
        overallFeedback: evaluations.overallFeedback,
      })
      .from(evaluations)
      .innerJoin(answerSheets, eq(evaluations.answerSheetId, answerSheets.id))
      .innerJoin(exams, eq(answerSheets.examId, exams.id))
      .where(inArray(evaluations.admissionNumber, admNums))
      .orderBy(desc(evaluations.id))
      .limit(100),
    db
      .select({
        admissionNumber: homeworkSubmissions.admissionNumber,
        subject: homework.subject,
        status: homeworkSubmissions.status,
        correctnessScore: homeworkSubmissions.correctnessScore,
        isOnTime: homeworkSubmissions.isOnTime,
      })
      .from(homeworkSubmissions)
      .innerJoin(homework, eq(homeworkSubmissions.homeworkId, homework.id))
      .where(inArray(homeworkSubmissions.admissionNumber, admNums))
      .limit(150),
  ]);

  return `SCOPE: Class Teacher View — Class ${classTeacherOf} (all subjects)
CLASS SIZE: ${classStudents.length} students
CROSS-SUBJECT EVALUATIONS: ${JSON.stringify(evalRows)}
CLASS HOMEWORK DATA: ${hwData.length > 0 ? JSON.stringify(hwData) : "No submissions yet."}`;
}
