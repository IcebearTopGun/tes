import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import fs from "fs";
import path from "path";
import { sql as drizzleSql } from "drizzle-orm";
import { api } from "@shared/routes";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import OpenAI from "openai";
// import { sendOtpSms } from "./services/sms";
import {
  assertConversationAccess,
  buildStudentScopedChatContext,
  buildTeacherScopedChatContext,
  ScopedAccessError,
} from "./services/aiContextSegregation";

const JWT_SECRET = process.env.SESSION_SECRET || "super-secret-key";
const isIntegrationTestMode = process.env.INTEGRATION_TEST_MODE === "1" || process.env.NODE_ENV === "test";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

function similarityScore(a: string, b: string): number {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap++;
  return overlap / Math.max(aTokens.size, 1);
}

function parseModelAnswers(modelAnswerText: string, fallbackTotalMarks: number): Array<{ qNum: number; answer: string; maxMarks: number }> {
  const lines = modelAnswerText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const parsed: Array<{ qNum: number; answer: string; maxMarks: number }> = [];
  const re = /^Q\s*([0-9]+)\s*(?:\(\s*([0-9]+)\s*marks?\s*\))?\s*:\s*(.*)$/i;

  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    parsed.push({
      qNum: Number(m[1]),
      maxMarks: Number(m[2] || 0),
      answer: m[3] || "",
    });
  }
  if (parsed.length === 0) return [];

  const explicitMarks = parsed.reduce((s, p) => s + (p.maxMarks || 0), 0);
  if (explicitMarks === 0) {
    const per = Math.max(1, Math.round(fallbackTotalMarks / parsed.length));
    for (const p of parsed) p.maxMarks = per;
  }
  return parsed;
}

function buildLocalExamEvaluation(params: {
  studentName: string;
  admissionNumber: string;
  examTotalMarks: number;
  modelAnswerText: string;
  studentAnswers: Array<{ question_number: number; answer_text: string }>;
}) {
  const modelByQ = new Map<number, { answer: string; maxMarks: number }>();
  const parsedModel = parseModelAnswers(params.modelAnswerText || "", params.examTotalMarks);
  for (const item of parsedModel) modelByQ.set(item.qNum, { answer: item.answer, maxMarks: item.maxMarks });

  const allQuestionNos = new Set<number>([
    ...params.studentAnswers.map((a) => Number(a.question_number || 0)).filter((n) => n > 0),
    ...Array.from(modelByQ.keys()),
  ]);

  const qNos = Array.from(allQuestionNos).sort((a, b) => a - b);
  const questions = qNos.map((qNum) => {
    const student = params.studentAnswers.find((a) => Number(a.question_number) === qNum)?.answer_text || "";
    const model = modelByQ.get(qNum)?.answer || "";
    const maxMarks = modelByQ.get(qNum)?.maxMarks || Math.max(1, Math.round(params.examTotalMarks / Math.max(qNos.length, 1)));
    const sim = model ? similarityScore(student, model) : Math.min(1, tokenize(student).length / 18);
    const marksAwarded = Math.max(0, Math.min(maxMarks, Math.round(sim * maxMarks)));
    return {
      question_number: qNum,
      chapter: "General",
      marks_awarded: marksAwarded,
      max_marks: maxMarks,
      deviation_reason: sim >= 0.8 ? "Answer closely matches expected concepts." : sim >= 0.5 ? "Answer is partially correct but missing key concepts." : "Answer misses most expected concepts.",
      improvement_suggestion: sim >= 0.8 ? "Maintain this level of detail and structure." : "Include more key terms and complete explanation as in model answer.",
    };
  });

  const total_marks = Math.min(params.examTotalMarks, questions.reduce((s, q) => s + q.marks_awarded, 0));
  const pct = params.examTotalMarks > 0 ? Math.round((total_marks / params.examTotalMarks) * 100) : 0;

  return {
    student_name: params.studentName,
    admission_number: params.admissionNumber,
    total_marks,
    questions,
    overall_feedback: pct >= 75
      ? "Strong performance with clear concept coverage."
      : pct >= 50
        ? "Moderate performance; revise missing concepts for better scores."
        : "Needs significant revision and more complete answers.",
  };
}

function getOpenAIClient() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Please add it to your environment secrets.");
  }
  return new OpenAI({ apiKey, baseURL });
}

async function extractDocumentText(dataUrl: string, label: string): Promise<string> {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!mimeMatch) return "";
  const mimeType = mimeMatch[1];
  const base64Data = mimeMatch[2];

  if (mimeType === "text/plain" || mimeType === "application/json") {
    try {
      const text = Buffer.from(base64Data, "base64").toString("utf8").trim();
      return text;
    } catch {
      return "";
    }
  }

  if (mimeType === "application/pdf") {
    console.log(`[EXTRACT] Extracting text from PDF (${label})...`);
    const buffer = Buffer.from(base64Data, "base64");
    const content = buffer.toString("latin1");
    const textParts: string[] = [];
    const btEtRegex = /BT([\s\S]*?)ET/g;
    let m;
    while ((m = btEtRegex.exec(content)) !== null) {
      const block = m[1];
      const strMatches = block.match(/\(([^)]*)\)\s*T[jJ]/g) || [];
      for (const s of strMatches) {
        const t = s.replace(/\(([^)]*)\)\s*T[jJ]/, "$1").trim();
        if (t) textParts.push(t);
      }
    }
    const text = textParts.join(" ").replace(/\s+/g, " ").trim();
    console.log(`[EXTRACT] PDF text extracted: ${text.length} chars`);
    return text || "(PDF content could not be extracted as text)";
  }

  if (mimeType.startsWith("image/")) {
    console.log(`[EXTRACT] Extracting text from image (${label}) via GPT-4o vision...`);
    const response = await getOpenAIClient().chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Extract ALL text content from this document image exactly as written. Return only the extracted text, no commentary." },
          { type: "image_url", image_url: { url: dataUrl } }
        ]
      }]
    });
    const text = response.choices[0].message.content?.trim() || "";
    console.log(`[EXTRACT] Image text extracted: ${text.length} chars`);
    return text;
  }

  console.log(`[EXTRACT] Unsupported format for ${label}: ${mimeType}`);
  return "";
}

// Deterministic pseudo-random 0-1 from integer seed
function drand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}


async function initAdminUsers() {
  try {
    // Create table if not exists (raw SQL, safe to run multiple times)
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        employee_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        phone_number TEXT,
        profile_photo_url TEXT,
        role TEXT NOT NULL DEFAULT 'ADMIN',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    try {
      await db.execute(drizzleSql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
    } catch {}
    try {
      await db.execute(drizzleSql`DROP TABLE IF EXISTS admins CASCADE`);
    } catch {}

    // Also create other new tables if they don't exist
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS class_sections (
        id SERIAL PRIMARY KEY,
        class_name INTEGER NOT NULL,
        section TEXT NOT NULL,
        subjects TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    try {
      await db.execute(drizzleSql`ALTER TABLE managed_students ADD COLUMN IF NOT EXISTS password TEXT`);
      await db.execute(drizzleSql`ALTER TABLE managed_students ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
    } catch {}
    try {
      await db.execute(drizzleSql`ALTER TABLE managed_teachers ADD COLUMN IF NOT EXISTS password TEXT`);
      await db.execute(drizzleSql`ALTER TABLE managed_teachers ADD COLUMN IF NOT EXISTS subjects_assigned TEXT NOT NULL DEFAULT '[]'`);
      await db.execute(drizzleSql`ALTER TABLE managed_teachers ADD COLUMN IF NOT EXISTS classes_assigned TEXT NOT NULL DEFAULT '[]'`);
      await db.execute(drizzleSql`ALTER TABLE managed_teachers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
    } catch {}

    // Only bootstrap default admin/principal accounts; no dataset seeding.
    const hp = await bcrypt.hash("123", 10);

    const existingAdminUser = await storage.getAdminUserByEmployeeId("ADMIN001");
    if (!existingAdminUser) {
      await storage.createAdminUser({
        employeeId: "ADMIN001",
        name: "School Admin",
        email: "schooladmin@school.edu",
        passwordHash: hp,
        phoneNumber: "9000000001",
        role: "ADMIN",
      });
      console.log("[init] Default admin user created: ADMIN001");
    }

    const existingPrincipalUser = await storage.getAdminUserByEmployeeId("PRIN001");
    if (!existingPrincipalUser) {
      await storage.createAdminUser({
        employeeId: "PRIN001",
        name: "School Principal",
        email: "principal@school.edu",
        passwordHash: hp,
        phoneNumber: "9000000002",
        role: "PRINCIPAL",
      });
      console.log("[init] Default principal user created: PRIN001");
    }

  } catch (err) {
    console.error("[initAdminUsers] Error:", err);
  }
}


async function seedDatabase() {
  // No-op by policy: dataset seeding is disabled.
  return;
}

// Middleware to extract token from Header
interface AuthRequest extends Request {
  user?: { id: number; role: "teacher" | "student" | "admin" | "principal" };
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; role: "teacher" | "student" | "admin" | "principal" };
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9]{10,15}$/;
const ADMISSION_RE = /^[A-Za-z0-9._/-]{2,32}$/;
const EMPLOYEE_RE = /^[A-Za-z0-9._/-]{2,32}$/;
const CLASS_RE = /^[0-9]{1,2}$/;
const SECTION_RE = /^[A-Z]$/;

function normalizeClass(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeSection(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export function validateStudentPayload(payload: any, opts: { partial?: boolean; requireContact?: boolean } = {}) {
  const partial = !!opts.partial;
  const requireContact = opts.requireContact !== false;
  const errs: string[] = [];
  const name = String(payload?.name ?? payload?.studentName ?? "").trim();
  const admissionNumber = String(payload?.admissionNumber ?? "").trim();
  const phone = String(payload?.phone ?? payload?.phoneNumber ?? "").trim();
  const email = String(payload?.email ?? "").trim();
  const studentClass = normalizeClass(payload?.studentClass ?? payload?.class);
  const section = normalizeSection(payload?.section);

  if (!partial || "name" in payload || "studentName" in payload) {
    if (!name || name.length < 2) errs.push("Valid student name is required");
  }
  if (!partial || "admissionNumber" in payload) {
    if (!ADMISSION_RE.test(admissionNumber)) errs.push("Admission number must be 2-32 characters and alphanumeric");
  }
  if (!partial || "phone" in payload || "phoneNumber" in payload) {
    if (requireContact && !phone) errs.push("Phone number is required");
    else if (phone && !PHONE_RE.test(phone)) errs.push("Phone number must be 10-15 digits");
  }
  if (!partial || "email" in payload) {
    if (requireContact && !email) errs.push("Email is required");
    else if (email && !EMAIL_RE.test(email)) errs.push("Email format is invalid");
  }
  if (!partial || "studentClass" in payload || "class" in payload) {
    if (!CLASS_RE.test(studentClass)) errs.push("Class must be numeric");
  }
  if (!partial || "section" in payload) {
    if (!SECTION_RE.test(section)) errs.push("Section must be a single capital letter");
  }

  return { errs, normalized: { name, admissionNumber, phone, email, studentClass, section } };
}

export function isStudentBulkDuplicate(admissionNumber: string, admissionSet: Set<string>): boolean {
  return admissionSet.has(admissionNumber);
}

function normalizeAssignments(input: any): Array<{ class: string; section: string; subjects: string[] }> {
  if (!Array.isArray(input)) return [];
  return input
    .map((a: any) => ({
      class: normalizeClass(a?.class),
      section: normalizeSection(a?.section),
      subjects: Array.from(new Set((Array.isArray(a?.subjects) ? a.subjects : [])
        .map((s: any) => String(s).trim())
        .filter(Boolean))),
    }))
    .filter((a) => CLASS_RE.test(a.class) && SECTION_RE.test(a.section) && a.subjects.length > 0);
}

export function validateTeacherPayload(payload: any, opts: { partial?: boolean; requireContact?: boolean } = {}) {
  const partial = !!opts.partial;
  const requireContact = opts.requireContact !== false;
  const errs: string[] = [];
  const teacherName = String(payload?.teacherName ?? payload?.name ?? "").trim();
  const employeeId = String(payload?.employeeId ?? "").trim();
  const phone = String(payload?.phone ?? payload?.phoneNumber ?? "").trim();
  const email = String(payload?.email ?? "").trim();
  const assignments = normalizeAssignments(payload?.assignments ?? []);
  const isClassTeacherRaw = String(payload?.isClassTeacher ?? "").trim().toLowerCase();
  const isClassTeacher = payload?.isClassTeacher === true || payload?.isClassTeacher === 1 || ["true", "1", "yes", "y"].includes(isClassTeacherRaw);
  const classTeacherOf = payload?.classTeacherOf
    ? String(payload.classTeacherOf).trim().replace(/\s*-\s*/g, "-")
    : (payload?.class && payload?.section ? `${normalizeClass(payload.class)}-${normalizeSection(payload.section)}` : "");

  if (!partial || "teacherName" in payload || "name" in payload) {
    if (!teacherName || teacherName.length < 2) errs.push("Valid teacher name is required");
  }
  if (!partial || "employeeId" in payload) {
    if (!EMPLOYEE_RE.test(employeeId)) errs.push("Employee ID must be 2-32 characters and alphanumeric");
  }
  if (!partial || "phoneNumber" in payload || "phone" in payload) {
    if (requireContact && !phone) errs.push("Phone number is required");
    else if (phone && !PHONE_RE.test(phone)) errs.push("Phone number must be 10-15 digits");
  }
  if (!partial || "email" in payload) {
    if (requireContact && !email) errs.push("Email is required");
    else if (email && !EMAIL_RE.test(email)) errs.push("Valid email is required");
  }
  if (!partial || "assignments" in payload) {
    if (!assignments.length) errs.push("At least one class-section-subject assignment is required");
  }
  if (isClassTeacher) {
    if (!/^[0-9]{1,2}-[A-Z]$/.test(classTeacherOf)) errs.push("Class teacher assignment must be in format like 10-A");
  }

  return { errs, normalized: { teacherName, employeeId, phone, email, assignments, isClassTeacher, classTeacherOf } };
}

export function isTeacherBulkDuplicate(employeeId: string, employeeSet: Set<string>): boolean {
  return employeeSet.has(employeeId);
}

function deriveTeacherLists(assignments: Array<{ class: string; section: string; subjects: string[] }>) {
  const classesAssigned = Array.from(new Set(assignments.map((a) => a.class)));
  const subjectsAssigned = Array.from(new Set(assignments.flatMap((a) => a.subjects)));
  return { classesAssigned, subjectsAssigned };
}

async function validateTeacherAssignments(assignments: Array<{ class: string; section: string; subjects: string[] }>): Promise<string | null> {
  for (const assignment of assignments) {
    const classSection = await storage.getClassSectionByClassAndSection(parseInt(assignment.class, 10), assignment.section);
    if (!classSection) return `Class ${assignment.class}-${assignment.section} does not exist`;
    let allowedSubjects: string[] = [];
    try { allowedSubjects = JSON.parse(classSection.subjects || "[]"); } catch {}
    const invalidSubject = assignment.subjects.find((s) => !allowedSubjects.includes(s));
    if (invalidSubject) return `Subject "${invalidSubject}" is not available in class ${assignment.class}-${assignment.section}`;
  }
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await initAdminUsers(); // schema/table initialization only; no data seeding
  console.log("[seed] Startup data seeding disabled.");

  // TEACHER LOGIN
  app.post(api.auth.teacherLogin.path, async (req, res) => {
    return res.status(403).json({ message: "Teacher password login is disabled. Use OTP login." });
  });

  // STUDENT LOGIN
  app.post(api.auth.studentLogin.path, async (req, res) => {
    return res.status(403).json({ message: "Student password login is disabled. Use OTP login." });
  });

  // TEACHER SIGNUP
  app.post(api.auth.teacherSignup.path, async (req, res) => {
    return res.status(403).json({ message: "Teacher signup is disabled. Admin must create teacher records." });
  });

  // STUDENT SIGNUP
  app.post(api.auth.studentSignup.path, async (req, res) => {
    return res.status(403).json({ message: "Student signup is disabled. Admin must create student records." });
  });

  // ─── ADMIN LOGIN ──────────────────────────────────────────────────────────
  app.post("/api/auth/admin/login", async (req, res) => {
    try {
      const { employeeId, password } = req.body;
      if (!employeeId || !password) return res.status(400).json({ message: "Employee ID and password required" });
      const adminUser = await storage.getAdminUserByEmployeeId(employeeId);
      if (!adminUser || !(await bcrypt.compare(password, adminUser.passwordHash))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const jwtRole = adminUser.role === "PRINCIPAL" ? "principal" : "admin";
      const token = jwt.sign({ id: adminUser.id, role: jwtRole }, JWT_SECRET, { expiresIn: "1d" });
      const { passwordHash: _, ...userWithoutPassword } = adminUser;
      res.json({ token, role: jwtRole, user: userWithoutPassword });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });


  // ─── Helper: verify admin password for delete operations ───────────────────
  async function verifyAdminPassword(adminId: number, password: string): Promise<boolean> {
    const adminUser = await storage.getAdminUserById(adminId);
    if (!adminUser) return false;
    return bcrypt.compare(password, adminUser.passwordHash);
  }

  async function ensureUniqueClassTeacher(classTeacherOf: string, excludeTeacherId?: number): Promise<boolean> {
    const allTeachers = await storage.getAllTeachers();
    return !allTeachers.some((t) =>
      t.isClassTeacher === 1 &&
      t.classTeacherOf === classTeacherOf &&
      (excludeTeacherId ? t.id !== excludeTeacherId : true)
    );
  }


  // ─── ADMIN: SCHOOL STATS ───────────────────────────────────────────────────
  app.get("/api/admin/stats", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const stats = await storage.getSchoolStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: "Failed to load school stats" });
    }
  });

  // ─── ADMIN: SCHOOL ANALYTICS ────────────────────────────────────────────────
  app.get("/api/admin/analytics", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const analytics = await storage.getSchoolAnalytics();
      res.json(analytics);
    } catch (err) {
      res.status(500).json({ message: "Failed to load school analytics" });
    }
  });

  // ─── ADMIN: ALL STUDENTS ────────────────────────────────────────────────────
  app.get("/api/admin/students", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const allStudents = await storage.getAllStudents();
      res.json(allStudents.map(({ password, ...s }) => s));
    } catch (err) {
      res.status(500).json({ message: "Failed to load students" });
    }
  });

  // ─── ADMIN: ALL TEACHERS ────────────────────────────────────────────────────
  app.get("/api/admin/teachers", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const allTeachers = await storage.getAllTeachers();
      res.json(allTeachers.map(({ password, ...t }) => t));
    } catch (err) {
      res.status(500).json({ message: "Failed to load teachers" });
    }
  });

  // GET ME
  app.get(api.auth.me.path, authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id, role } = req.user!;
      if (role === "teacher") {
        const teacher = await storage.getTeacher(id);
        if (!teacher) return res.status(401).json({ message: "User not found" });
        const { password, ...user } = teacher;
        return res.json({ role, user });
      }
      if (role === "student") {
        const student = await storage.getStudent(id);
        if (!student) return res.status(401).json({ message: "User not found" });
        const { password, ...user } = student;
        return res.json({ role, user });
      }
      const adminUser = await storage.getAdminUserById(id);
      if (adminUser) {
        const { passwordHash: _, ...user } = adminUser;
        const authRole = adminUser.role === "PRINCIPAL" ? "principal" : "admin";
        return res.json({ role: authRole, user });
      }
      return res.status(401).json({ message: "User not found" });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // DASHBOARDS
  app.get(api.dashboard.teacherStats.path, authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const stats = await storage.getTeacherStats(req.user.id);
      res.json(stats);
    } catch (err) {
      console.error("Teacher stats error:", err);
      res.status(500).json({ message: "Failed to load stats" });
    }
  });

  app.get(api.dashboard.studentStats.path, authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const student = await storage.getStudent(req.user.id);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const evals = await storage.getEvaluationsByStudent(student.admissionNumber);

    // Build marks overview per subject (latest eval per subject wins)
    const subjectMap = new Map<string, { score: number; total: number; exam: string }>();
    for (const e of evals) {
      subjectMap.set(e.subject, { score: e.totalMarks, total: e.maxMarks, exam: e.examName });
    }
    const marksOverview = Array.from(subjectMap.entries()).map(([subject, d]) => ({
      subject,
      score: d.score,
      total: d.total,
    }));

    // Improvement areas from questions JSON across all evals
    const improvementAreas: string[] = [];
    for (const e of evals) {
      try {
        const qs = JSON.parse(e.questions);
        for (const q of qs) {
          if (q.improvement_suggestion && improvementAreas.length < 4) {
            improvementAreas.push(q.improvement_suggestion);
          }
        }
      } catch {}
    }

    // Feedback from overall feedback per exam
    const feedback = evals.map(e => ({
      from: e.examName,
      comment: e.overallFeedback,
      date: new Date().toISOString().split("T")[0],
    }));

    // Overall summary
    const avgPct = evals.length
      ? Math.round(evals.reduce((acc, e) => acc + (e.totalMarks / e.maxMarks) * 100, 0) / evals.length)
      : 0;
    const performanceSummary = evals.length
      ? `You have completed ${evals.length} evaluated exam(s) with an average score of ${avgPct}%.`
      : "No evaluated exams found yet. Submit your answer sheets to see your performance here.";

    // Class ranking and class average (real data from classmates' evaluated records)
    const classmates = (await storage.getAllStudents()).filter(
      (s) => String(s.studentClass) === String(student.studentClass) && String(s.section) === String(student.section),
    );

    const peerStats: Array<{ admissionNumber: string; name: string; avgPct: number }> = [];
    for (const peer of classmates) {
      const peerEvals = await storage.getEvaluationsByStudent(peer.admissionNumber);
      if (!peerEvals.length) continue;
      const peerAvg = Math.round(
        peerEvals.reduce((acc, e) => acc + (e.totalMarks / e.maxMarks) * 100, 0) / peerEvals.length,
      );
      peerStats.push({ admissionNumber: peer.admissionNumber, name: peer.name, avgPct: peerAvg });
    }
    peerStats.sort((a, b) => b.avgPct - a.avgPct);

    const classTotal = classmates.length;
    const classAvg = peerStats.length
      ? Math.round(peerStats.reduce((sum, p) => sum + p.avgPct, 0) / peerStats.length)
      : 0;
    const classRankIdx = peerStats.findIndex((p) => p.admissionNumber === student.admissionNumber);
    const classRank = classRankIdx >= 0 ? classRankIdx + 1 : null;
    const initialsOf = (name: string) => name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

    const leaderboard = peerStats.slice(0, 5).map((p, idx) => ({
      rank: idx + 1,
      initials: initialsOf(p.name || p.admissionNumber),
      name: p.admissionNumber === student.admissionNumber ? `${(student.name || "You").split(" ")[0]} (you)` : p.name,
      score: p.avgPct,
      me: p.admissionNumber === student.admissionNumber,
    }));
    if (classRank && classRank > leaderboard.length) {
      const me = peerStats[classRank - 1];
      leaderboard.push({
        rank: classRank,
        initials: initialsOf(student.name || student.admissionNumber),
        name: `${(student.name || "You").split(" ")[0]} (you)`,
        score: me.avgPct,
        me: true,
      });
    }

    res.json({
      assignments: evals.length,
      attendance: 95,
      performanceSummary,
      marksOverview,
      improvementAreas: improvementAreas.length ? improvementAreas : ["No improvement areas recorded yet."],
      feedback: feedback.length ? feedback : [{ from: "System", comment: "No evaluated exams yet.", date: new Date().toISOString().split("T")[0] }],
      classRank,
      classTotal,
      classAvg,
      leaderboard,
    });
  });

  // EXAMS
  const examUpdateSchema = z.object({
    examName: z.string().min(1).optional(),
    subject: z.string().min(1).optional(),
    className: z.string().min(1).optional(),
    section: z.string().min(1).optional().nullable(),
    totalMarks: z.coerce.number().int().min(1).optional(),
    questionText: z.string().optional().nullable(),
    modelAnswerText: z.string().optional().nullable(),
    markingSchemeText: z.string().optional().nullable(),
    category: z.string().min(1).optional(),
    questionImages: z.string().optional().nullable(),
    modelAnswerImages: z.string().optional().nullable(),
    subjectCode: z.string().optional().nullable(),
    useNcert: z.coerce.number().int().min(0).max(1).optional(),
    description: z.string().optional().nullable(),
    examDate: z.string().optional().nullable(),
  });

  app.post(api.exams.create.path, authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.exams.create.input.parse({
        ...req.body,
        teacherId: req.user.id
      });
      const exam = await storage.createExam(input);
      res.status(201).json(exam);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.exams.list.path, authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const exams = await storage.getExamsByTeacher(req.user.id);
    res.json(exams);
  });

  app.put("/api/exams/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const examId = parseInt(req.params.id, 10);
      if (!Number.isFinite(examId)) return res.status(400).json({ message: "Invalid exam id" });

      const existing = await storage.getExam(examId);
      if (!existing || existing.teacherId !== req.user.id) return res.status(403).json({ message: "Access denied" });

      const today = new Date().toISOString().split("T")[0];
      if (existing.examDate && existing.examDate <= today) {
        return res.status(400).json({ message: "Cannot edit exam on or after exam date" });
      }

      const parsed = examUpdateSchema.parse(req.body || {});
      if (Object.keys(parsed).length === 0) {
        return res.status(400).json({ message: "No fields provided to update" });
      }

      if (parsed.examDate && parsed.examDate < today) {
        return res.status(400).json({ message: "Exam date cannot be in the past" });
      }

      const next = await storage.updateExam(examId, parsed as any);
      res.json(next);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update exam" });
    }
  });

  app.delete("/api/exams/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const examId = parseInt(req.params.id, 10);
      if (!Number.isFinite(examId)) return res.status(400).json({ message: "Invalid exam id" });

      const existing = await storage.getExam(examId);
      if (!existing || existing.teacherId !== req.user.id) return res.status(403).json({ message: "Access denied" });

      const today = new Date().toISOString().split("T")[0];
      if (existing.examDate && existing.examDate <= today) {
        return res.status(400).json({ message: "Cannot delete exam on or after exam date" });
      }

      await storage.deleteExam(examId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete exam", detail: err?.message });
    }
  });

  app.get("/api/exams/:id/answer-sheets", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const examId = parseInt(req.params.id);
      const exam = await storage.getExam(examId);
      if (!exam || exam.teacherId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const sheets = await storage.getAnswerSheetsByExam(examId);
      // Attach evaluation for each sheet
      const sheetsWithEval = await Promise.all(sheets.map(async (s) => {
        const evaluation = await storage.getEvaluationByAnswerSheetId(s.id);
        return { ...s, evaluation: evaluation || null };
      }));
      res.json(sheetsWithEval);
    } catch (err) {
      res.status(500).json({ message: "Failed to load answer sheets" });
    }
  });

  // ── EXAM RESULTS: per-exam student results with question-level breakdown ──
  app.get("/api/exams/:id/results", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const examId = parseInt(req.params.id);
      const exam = await storage.getExam(examId);
      if (!exam || exam.teacherId !== req.user.id) return res.status(403).json({ message: "Access denied" });

      const sheets = await storage.getAnswerSheetsByExam(examId);
      const results = await Promise.all(sheets.map(async (sheet) => {
        const evaluation = await storage.getEvaluationByAnswerSheetId(sheet.id);
        if (!evaluation) return null;
        let questions: any[] = [];
        try { questions = JSON.parse(evaluation.questions); } catch {}
        const pct = exam.totalMarks > 0 ? Math.round((evaluation.totalMarks / exam.totalMarks) * 100) : 0;
        
        // Identify strengths and areas of improvement
        const strengths = questions.filter(q => q.marks_awarded >= (q.max_marks * 0.7));
        const improvements = questions.filter(q => q.marks_awarded < (q.max_marks * 0.7));
        
        return {
          studentName: evaluation.studentName,
          admissionNumber: evaluation.admissionNumber,
          totalMarks: evaluation.totalMarks,
          maxMarks: exam.totalMarks,
          percentage: pct,
          overallFeedback: evaluation.overallFeedback,
          questions: questions.map(q => ({
            questionNumber: q.question_number,
            chapter: q.chapter || "General",
            marksAwarded: q.marks_awarded,
            maxMarks: q.max_marks,
            deviationReason: q.deviation_reason,
            improvementSuggestion: q.improvement_suggestion,
          })),
          strengths: strengths.map(q => q.chapter || `Q${q.question_number}`),
          areasOfImprovement: improvements.map(q => ({
            topic: q.chapter || `Q${q.question_number}`,
            detail: q.improvement_suggestion || q.deviation_reason || "",
          })),
        };
      }));

      const validResults = results.filter(Boolean);

      // Class-level stats
      const totalStudents = validResults.length;
      const avgScore = totalStudents > 0 ? Math.round(validResults.reduce((s, r) => s + r!.percentage, 0) / totalStudents) : 0;
      
      // Score distribution
      const distribution = {
        "90-100": validResults.filter(r => r!.percentage >= 90).length,
        "75-89": validResults.filter(r => r!.percentage >= 75 && r!.percentage < 90).length,
        "60-74": validResults.filter(r => r!.percentage >= 60 && r!.percentage < 75).length,
        "40-59": validResults.filter(r => r!.percentage >= 40 && r!.percentage < 60).length,
        "0-39": validResults.filter(r => r!.percentage < 40).length,
      };

      // Chapter-wise class performance
      const chapterMap = new Map<string, { total: number; max: number; count: number }>();
      for (const r of validResults) {
        for (const q of r!.questions) {
          const ch = q.chapter;
          const existing = chapterMap.get(ch) || { total: 0, max: 0, count: 0 };
          chapterMap.set(ch, { total: existing.total + q.marksAwarded, max: existing.max + q.maxMarks, count: existing.count + 1 });
        }
      }
      const chapterAnalysis = Array.from(chapterMap.entries()).map(([chapter, data]) => ({
        chapter,
        avgPct: data.max > 0 ? Math.round((data.total / data.max) * 100) : 0,
        questionCount: data.count,
        status: data.max > 0 && (data.total / data.max) >= 0.7 ? "strong" : "weak",
      })).sort((a, b) => a.avgPct - b.avgPct);

      res.json({
        exam: { id: exam.id, name: exam.examName, subject: exam.subject, className: exam.className, section: (exam as any).section, totalMarks: exam.totalMarks },
        students: validResults,
        classSummary: { totalStudents, avgScore, distribution, chapterAnalysis },
      });
    } catch (err: any) {
      console.error("[RESULTS]", err);
      res.status(500).json({ message: "Failed to load results" });
    }
  });

  app.post(api.exams.processAnswerSheet.path, authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const examId = parseInt(req.params.id as string);
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      console.error("[OCR] Missing imageBase64 in request body");
      return res.status(400).json({ message: "Missing imageBase64 in request body" });
    }

    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch?.[1] ?? "";
    const isMockOcrPayload = isIntegrationTestMode && mimeType === "application/json";
    if (!mimeType.startsWith("image/") && !isMockOcrPayload) {
      console.error(`[OCR] Unsupported file type: ${mimeType}`);
      return res.status(400).json({
        message: `Unsupported file type: ${mimeType || "unknown"}. Answer sheets must be image files (JPG, PNG, WEBP). PDFs cannot be processed — please photograph or scan the sheet as an image.`
      });
    }

    console.log(`[OCR] Starting OCR for exam ${examId}, image size: ${imageBase64.length} chars, type: ${mimeType}`);

    try {
      let ocrData: any;
      if (isMockOcrPayload) {
        const payload = imageBase64.split(",")[1] || "";
        const raw = Buffer.from(payload, "base64").toString("utf8");
        ocrData = JSON.parse(raw);
      } else {
        console.log("[OCR] Calling OpenAI GPT-4o vision...");
        const response = await getOpenAIClient().chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract student information and answers from this handwritten answer sheet. Return ONLY valid JSON with fields: admission_number (string), student_name (string), and answers (array of {question_number: number, answer_text: string}). If you cannot read the admission number or name, use 'UNKNOWN'."
                },
                {
                  type: "image_url",
                  image_url: { url: imageBase64 },
                },
              ],
            },
          ],
          response_format: { type: "json_object" }
        });

        const rawContent = response.choices[0].message.content || "{}";
        console.log("[OCR] Raw OpenAI response:", rawContent.substring(0, 300));
        ocrData = JSON.parse(rawContent);
      }
      console.log(`[OCR] Parsed data — student: ${ocrData.student_name}, admission: ${ocrData.admission_number}, answers: ${ocrData.answers?.length ?? 0}`);

      const student = await storage.getStudentByAdmissionNumber(ocrData.admission_number);
      console.log(`[OCR] Student lookup for "${ocrData.admission_number}": ${student ? `found id=${student.id}` : "not found, will save without link"}`);

      const sheet = await storage.createAnswerSheet({
        examId,
        studentId: student?.id || null,
        admissionNumber: ocrData.admission_number || "UNKNOWN",
        studentName: ocrData.student_name || "UNKNOWN",
        ocrOutput: JSON.stringify(ocrData),
        status: "processed"
      });

      console.log(`[OCR] Answer sheet saved with id=${sheet.id}`);
      res.json({ id: sheet.id, ...ocrData });
    } catch (err: any) {
      console.error("[OCR] Error:", err?.message || err);
      if (err?.status) console.error("[OCR] OpenAI status:", err.status, err?.error);
      res.status(500).json({ message: "Failed to process answer sheet", detail: err?.message });
    }
  });

  app.post(api.exams.evaluate.path, authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const answerSheetId = parseInt(req.params.id as string);
    console.log(`[EVAL] Starting evaluation for answer sheet id=${answerSheetId}`);
    try {
      const sheet = await storage.getAnswerSheet(answerSheetId);
      if (!sheet) {
        console.error(`[EVAL] Answer sheet ${answerSheetId} not found`);
        return res.status(404).json({ message: "Answer sheet not found" });
      }
      console.log(`[EVAL] Sheet found: student=${sheet.studentName}, examId=${sheet.examId}`);

      const exam = await storage.getExam(sheet.examId);
      if (!exam) {
        console.error(`[EVAL] Exam ${sheet.examId} not found`);
        return res.status(404).json({ message: "Exam not found" });
      }
      console.log(`[EVAL] Exam found: ${exam.examName} (${exam.subject}), totalMarks=${exam.totalMarks}`);
      console.log(`[EVAL] Has model answer: ${!!exam.modelAnswerUrl}, has marking scheme: ${!!exam.markingSchemeUrl}`);

      let modelAnswerText = exam.modelAnswerText?.trim() || "";
      if (!modelAnswerText && exam.modelAnswerUrl) {
        console.log("[EVAL] No modelAnswerText stored, extracting from uploaded file...");
        modelAnswerText = await extractDocumentText(exam.modelAnswerUrl, "model answer");
      } else if (modelAnswerText) {
        console.log("[EVAL] Using stored modelAnswerText.");
      }

      // Extract model answer from images if stored (and text is still empty)
      const examAny = exam as any;
      if (!modelAnswerText && examAny.modelAnswerImages) {
        try {
          const imgArr: string[] = JSON.parse(examAny.modelAnswerImages);
          if (imgArr.length > 0) {
            console.log(`[EVAL] Extracting model answer from ${imgArr.length} image(s) via GPT-4o vision...`);
            const imgContent: any[] = [
              { type: "text", text: "Extract and transcribe the full model answer key from these images. Format as: Q1: <answer text>\nQ2: <answer text>\n..." },
              ...imgArr.map(img => ({ type: "image_url", image_url: { url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}` } })),
            ];
            const extractRes = await getOpenAIClient().chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: imgContent }],
              max_tokens: 2000,
            });
            modelAnswerText = extractRes.choices[0]?.message?.content || "";
            console.log("[EVAL] Extracted model answer from images.");
          }
        } catch (imgErr) { console.warn("[EVAL] Could not extract model answer from images:", imgErr); }
      }

      // Extract question text from images if available
      let questionText = (exam as any).questionText?.trim() || "";
      if (!questionText && examAny.questionImages) {
        try {
          const qImgArr: string[] = JSON.parse(examAny.questionImages);
          if (qImgArr.length > 0) {
            console.log(`[EVAL] Extracting questions from ${qImgArr.length} image(s)...`);
            const qImgContent: any[] = [
              { type: "text", text: "Extract and transcribe all exam questions from these images. Format as: Q1 (<marks> marks): <question text>\nQ2 (<marks> marks): <question text>\n..." },
              ...qImgArr.map(img => ({ type: "image_url", image_url: { url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}` } })),
            ];
            const qExtractRes = await getOpenAIClient().chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: qImgContent }],
              max_tokens: 2000,
            });
            questionText = qExtractRes.choices[0]?.message?.content || "";
          }
        } catch (qImgErr) { console.warn("[EVAL] Could not extract questions from images:", qImgErr); }
      }

      let markingSchemeText = exam.markingSchemeText?.trim() || "";
      if (!markingSchemeText && exam.markingSchemeUrl) {
        console.log("[EVAL] No markingSchemeText stored, extracting from uploaded file...");
        markingSchemeText = await extractDocumentText(exam.markingSchemeUrl, "marking scheme");
      }

      const ocrData = (() => {
        try { return JSON.parse(sheet.ocrOutput); } catch { return { answers: [] }; }
      })();
      const studentAnswers = (ocrData.answers ?? [])
        .map((a: any) => `Q${a.question_number}: ${a.answer_text}`)
        .join("\n");

      // Fetch NCERT context only if exam has useNcert=1
      const shouldUseNcert = (exam as any).useNcert === 1;
      let ncertContext = "";
      if (shouldUseNcert) {
        const ncertChaptersData = await storage.getNcertChaptersByClassAndSubject(exam.className, exam.subject);
        ncertContext = ncertChaptersData.length > 0
          ? ncertChaptersData.map(ch => `Chapter: ${ch.chapterName}\n${ch.chapterContent}`).join("\n\n---\n\n")
          : "";
      }

      const evalPrompt = `You are an experienced teacher evaluating a student's exam answer sheet.

=== EXAM DETAILS ===
Exam: ${exam.examName}
Subject: ${exam.subject}
Class: ${exam.className}
Total Marks Available: ${exam.totalMarks}

=== MODEL ANSWER ===
${modelAnswerText || "(No model answer provided — evaluate based on subject knowledge)"}

${markingSchemeText ? `=== MARKING SCHEME ===\n${markingSchemeText}` : ""}

${ncertContext ? `=== NCERT REFERENCE CHAPTERS ===\n${ncertContext}\n\nMap each question to the most relevant NCERT chapter above and reference the chapter content in your evaluation.` : ""}${!shouldUseNcert ? "\n(NCERT reference is disabled for this exam — evaluate using model answer only.)" : ""}

=== STUDENT DETAILS ===
Name: ${sheet.studentName}
Admission Number: ${sheet.admissionNumber}

=== STUDENT'S ANSWERS (from OCR) ===
${studentAnswers || sheet.ocrOutput}

=== INSTRUCTIONS ===
- Compare each student answer against the model answer.
- Award marks fairly: full marks for correct, partial for partially correct, 0 for blank/wrong.
- Total marks awarded must not exceed ${exam.totalMarks}.
- For each question, identify the NCERT chapter it relates to (use chapter name from reference above, or "General" if not applicable).
- Provide a deviation reason explaining how the student's answer differs from the model answer.
- Provide specific improvement suggestions per question.

Return ONLY valid JSON with this exact structure:
{
  "student_name": "${sheet.studentName}",
  "admission_number": "${sheet.admissionNumber}",
  "total_marks": <number 0-${exam.totalMarks}>,
  "questions": [
    {
      "question_number": <number>,
      "chapter": "<NCERT chapter name or General>",
      "marks_awarded": <number>,
      "max_marks": <number>,
      "deviation_reason": "<why the student's answer differs from model answer>",
      "improvement_suggestion": "<specific, actionable feedback>"
    }
  ],
  "overall_feedback": "<2-3 sentence summary of overall performance>"
}`;

      const shouldUseLocalEval = isIntegrationTestMode || !(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
      let evalData: any;
      if (shouldUseLocalEval) {
        evalData = buildLocalExamEvaluation({
          studentName: sheet.studentName,
          admissionNumber: sheet.admissionNumber,
          examTotalMarks: exam.totalMarks,
          modelAnswerText,
          studentAnswers: ocrData.answers ?? [],
        });
      } else {
        console.log("[EVAL] Calling OpenAI GPT-4o for evaluation (text-only)...");
        const response = await getOpenAIClient().chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: evalPrompt }],
          response_format: { type: "json_object" }
        });

        const rawEval = response.choices[0].message.content || "{}";
        console.log("[EVAL] Raw OpenAI response:", rawEval.substring(0, 300));
        evalData = JSON.parse(rawEval);
      }
      console.log(`[EVAL] Parsed eval — student: ${evalData.student_name}, total_marks: ${evalData.total_marks}, questions: ${evalData.questions?.length ?? 0}`);

      const evaluation = await storage.createEvaluation({
        answerSheetId,
        studentName: evalData.student_name || sheet.studentName,
        admissionNumber: evalData.admission_number || sheet.admissionNumber,
        totalMarks: evalData.total_marks ?? 0,
        questions: JSON.stringify(evalData.questions ?? []),
        overallFeedback: evalData.overall_feedback || ""
      });

      // Save per-question deviation logs for analytics
      try {
        const admissionNumber = evalData.admission_number || sheet.admissionNumber;
        const devLogs = (evalData.questions ?? []).map((q: any) => ({
          evaluationId: evaluation.id,
          answerSheetId,
          admissionNumber,
          examId: exam.id,
          subject: exam.subject,
          questionNumber: q.question_number ?? 0,
          chapter: q.chapter ?? "General",
          expectedConcept: q.improvement_suggestion ?? null,
          studentGap: q.deviation_reason ?? null,
          deviationReason: q.deviation_reason ?? null,
          marksAwarded: q.marks_awarded ?? 0,
          maxMarks: q.max_marks ?? 0,
        }));
        await storage.createDeviationLogs(devLogs);
        console.log(`[EVAL] Saved ${devLogs.length} deviation logs`);
      } catch (devErr) {
        console.warn("[EVAL] Could not save deviation logs:", devErr);
      }

      res.json(evaluation);
    } catch (err: any) {
      console.error("[EVAL] Error:", err?.message || err);
      if (err?.status) console.error("[EVAL] OpenAI status:", err.status, err?.error);
      res.status(500).json({ message: "Failed to evaluate answer sheet", detail: err?.message });
    }
  });

  // ANALYTICS — supports ?class=X&subject=Y&viewMode=class|subject filters
  app.get("/api/analytics", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const classFilter = req.query.class as string | undefined;
      const subjectFilter = req.query.subject as string | undefined;
      const viewMode = req.query.viewMode as string | undefined;

      if (viewMode === "class") {
        const { getTeacherScope, getClassViewAnalytics } = await import("./services/teacherDataScope");
        const scope = await getTeacherScope(req.user.id);
        if (!scope.isClassTeacher || !scope.classTeacherOf) {
          return res.status(403).json({ message: "Not a class teacher" });
        }
        const data = await getClassViewAnalytics(scope.classTeacherOf);
        if (!data) return res.json({ classAverages: [], studentPerformance: [], marksDistribution: [], improvementTrends: [], chapterWeakness: [] });
        return res.json(data);
      }

      const data = await storage.getAnalytics(req.user.id, classFilter, subjectFilter);
      res.json(data);
    } catch (err) {
      console.error("Analytics Error:", err);
      res.status(500).json({ message: "Failed to load analytics" });
    }
  });

  // CLASS + SUBJECT OPTIONS (for filter dropdowns)
  app.get("/api/analytics/filter-options", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const teacherExams = await storage.getExamsByTeacher(req.user.id);
      const examClasses = [...new Set(teacherExams.map(e => e.className))].sort();
      const examSubjects = [...new Set(teacherExams.map(e => e.subject))].sort();
      // Also include subjects assigned to this teacher from the subjects table
      const allSubjects = await storage.getAllSubjects();
      const assignedSubjects = allSubjects.filter(s => s.teacherId === req.user!.id);
      const additionalSubjects = assignedSubjects.map(s => s.name).filter(n => !examSubjects.includes(n));
      const additionalClasses = [...new Set(assignedSubjects.map(s => s.className).filter(Boolean) as string[])].filter(c => !examClasses.includes(c));
      res.json({ classes: [...examClasses, ...additionalClasses].sort(), subjects: [...examSubjects, ...additionalSubjects].sort() });
    } catch (err) {
      res.status(500).json({ message: "Failed to load filter options" });
    }
  });

  // CHAT ANALYTICS
  app.get("/api/chat/conversations", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    const convs = await storage.getConversationsByTeacher(req.user.id);
    res.json(convs);
  });

  app.post("/api/chat/conversations", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    const conv = await storage.createConversation(req.body.title || "New Analysis", req.user.id, "teacher");
    res.status(201).json(conv);
  });

  app.get("/api/chat/conversations/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const conversationId = parseInt(req.params.id, 10);
      await assertConversationAccess({ conversationId, role: "teacher", userId: req.user.id });
      const msgs = await storage.getMessagesByConversation(conversationId);
      res.json(msgs);
    } catch (err) {
      if (err instanceof ScopedAccessError) return res.status(err.status).json({ message: err.message });
      res.status(500).json({ message: "Failed to load messages" });
    }
  });

  app.post("/api/chat/conversations/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    
    const conversationId = parseInt(req.params.id);
    const { content, viewMode } = req.body;

    try {
      await assertConversationAccess({ conversationId, role: "teacher", userId: req.user.id });
      const dataContext = await buildTeacherScopedChatContext(req.user.id, viewMode);

      // Save user message
      await storage.createMessage({ conversationId, role: "user", content });

      // Get AI response
      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `You are an educational data analyst helping a teacher understand student performance. Use the provided data to answer questions. ONLY use the provided data. Do NOT hallucinate. If data is missing, say so.\n\n${dataContext}`,
          },
          { role: "user", content }
        ]
      });

      const aiContent = response.choices[0].message.content || "I couldn't analyze that.";
      
      // Save AI message
      const msg = await storage.createMessage({ conversationId, role: "assistant", content: aiContent });
      
      res.json(msg);
    } catch (err) {
      if (err instanceof ScopedAccessError) return res.status(err.status).json({ message: err.message });
      console.error("Chat Error:", err);
      res.status(500).json({ message: "Analysis failed" });
    }
  });

  // BULK UPLOAD — OCR all pages, group by admission number, merge into scripts
  app.post("/api/exams/:id/bulk-upload", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    const examId = parseInt(req.params.id);
    const { images } = req.body; // Array of { imageBase64: string }

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: "No images provided" });
    }

    const exam = await storage.getExam(examId);
    if (!exam || exam.teacherId !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    console.log(`[BULK] Starting bulk OCR for exam ${examId}, ${images.length} pages`);

    try {
      // 1. Run OCR on all pages in parallel
      const pageResults = await Promise.all(images.map(async (img: any, idx: number) => {
        const imageBase64: string = img.imageBase64;
        const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch?.[1] ?? "";
        if (!mimeType.startsWith("image/")) {
          return { error: `Page ${idx + 1}: unsupported type ${mimeType}`, index: idx };
        }

        try {
          const response = await getOpenAIClient().chat.completions.create({
            model: "gpt-4o",
            messages: [{
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are reading a handwritten student exam answer sheet page. Extract the following and return ONLY valid JSON.

Look carefully for:
- Student NAME: usually written at the top, labeled "Name:" or "NAME:"
- ADMISSION NUMBER: usually labeled "Admission Number:", "Admission No:", "Roll No:" or similar — it is a number like 1234
- PAGE NUMBER: often a circled number (①②③) in the top-right corner, or written as "Page 1", "Sheet 2" etc. Default to 1 if not found.
- ANSWERS: labeled as "Ans 1", "Ans1", "Q1", "Answer 1" etc. Each answer may span multiple lines.

Return this exact JSON structure:
{
  "student_name": "<full name as written>",
  "admission_number": "<the numeric admission/roll number as a string>",
  "sheet_number": <page number as integer>,
  "answers": [
    {"question_number": 1, "answer_text": "<full answer text for Q1>"},
    {"question_number": 2, "answer_text": "<full answer text for Q2>"}
  ]
}

If you genuinely cannot read the name, use "UNKNOWN". If you cannot read the admission number, use "UNKNOWN". Be thorough — read every line of text on the page.`
                },
                { type: "image_url", image_url: { url: imageBase64 } },
              ],
            }],
            response_format: { type: "json_object" },
          });

          const ocrData = JSON.parse(response.choices[0].message.content || "{}");
          console.log(`[BULK] Page ${idx + 1} OCR done — student: "${ocrData.student_name}", admission: "${ocrData.admission_number}", sheet: ${ocrData.sheet_number}, answers: ${ocrData.answers?.length ?? 0}`);

          // Build an in-memory page object — DB storage is best-effort
          const pageObj: any = {
            id: -(idx + 1), // negative = no DB id yet
            examId,
            admissionNumber: (ocrData.admission_number || "UNKNOWN").toString().trim(),
            studentName: (ocrData.student_name || "UNKNOWN").toString().trim(),
            sheetNumber: ocrData.sheet_number || (idx + 1),
            imageBase64,
            ocrOutput: JSON.stringify(ocrData),
            status: "processed",
          };

          // Try saving to DB (non-fatal if table doesn't exist yet)
          try {
            const saved = await storage.createAnswerSheetPage({
              examId,
              admissionNumber: pageObj.admissionNumber,
              studentName: pageObj.studentName,
              sheetNumber: pageObj.sheetNumber,
              imageBase64,
              ocrOutput: pageObj.ocrOutput,
              status: "processed",
            });
            pageObj.id = saved.id; // use real DB id
          } catch (dbErr: any) {
            console.warn(`[BULK] DB save skipped for page ${idx + 1} (table may not exist yet): ${dbErr?.message}`);
          }

          return { page: pageObj, ocrData };
        } catch (err: any) {
          console.error(`[BULK] OCR failed for page ${idx + 1}:`, err?.message);
          return { error: `Page ${idx + 1} OCR failed: ${err?.message}`, index: idx };
        }
      }));

      // 2. Group successful pages by admission_number
      // Resolve UNKNOWN admission numbers by trying to match student name to a known group
      const successResults = pageResults.filter((r: any) => !r.error) as { page: any; ocrData: any }[];

      // First pass: collect all known admission numbers
      const knownAdmMap = new Map<string, string>(); // studentName (lowercase) -> admissionNumber
      for (const { page } of successResults) {
        if (page.admissionNumber !== "UNKNOWN" && page.studentName !== "UNKNOWN") {
          knownAdmMap.set(page.studentName.toLowerCase().trim(), page.admissionNumber);
        }
      }

      // Second pass: resolve UNKNOWN admission numbers by name match
      for (const result of successResults) {
        const { page } = result;
        if (page.admissionNumber === "UNKNOWN" && page.studentName !== "UNKNOWN") {
          const matched = knownAdmMap.get(page.studentName.toLowerCase().trim());
          if (matched) {
            page.admissionNumber = matched;
            console.log(`[BULK] Resolved UNKNOWN admission number for ${page.studentName} -> ${matched}`);
          }
        }
        // Also normalise: trim whitespace and lowercase for grouping key
        page._groupKey = page.admissionNumber.trim().toUpperCase();
      }

      const groups = new Map<string, { studentName: string; admissionNumber: string; pages: { page: any; ocrData: any }[] }>();
      for (const result of successResults) {
        const { page, ocrData } = result;
        const key = page._groupKey || page.admissionNumber;
        if (!groups.has(key)) {
          groups.set(key, { studentName: page.studentName, admissionNumber: page.admissionNumber, pages: [] });
        }
        // Use best (non-UNKNOWN) name for the group
        if (page.studentName !== "UNKNOWN" && groups.get(key)!.studentName === "UNKNOWN") {
          groups.get(key)!.studentName = page.studentName;
        }
        groups.get(key)!.pages.push({ page, ocrData });
      }

      // 3. Sort each group by sheet_number and merge answers
      const mergedScripts: any[] = [];
      for (const [admNo, group] of groups.entries()) {
        const sortedPages = group.pages.sort((a, b) => (a.page.sheetNumber || 1) - (b.page.sheetNumber || 1));
        const mergedAnswers: any[] = [];
        const pageIds: number[] = sortedPages.map(p => p.page.id);

        for (const { ocrData } of sortedPages) {
          const answers = ocrData.answers ?? [];
          for (const ans of answers) {
            const existing = mergedAnswers.find(m => m.question_number === ans.question_number);
            if (existing) {
              existing.answer_text += " " + ans.answer_text;
            } else {
              mergedAnswers.push({ ...ans });
            }
          }
        }

        // Build in-memory script object first
        const scriptObj: any = {
          id: Date.now() + Math.floor(Math.random() * 10000), // temp id
          examId,
          admissionNumber: group.admissionNumber || admNo,
          studentName: group.studentName,
          mergedAnswers: JSON.stringify(mergedAnswers),
          pageIds: JSON.stringify(pageIds),
          status: "pending",
          createdAt: new Date().toISOString(),
        };

        // Try saving to DB (non-fatal)
        try {
          const saved = await storage.createMergedAnswerScript({
            examId,
            admissionNumber: scriptObj.admissionNumber,
            studentName: scriptObj.studentName,
            mergedAnswers: scriptObj.mergedAnswers,
            pageIds: scriptObj.pageIds,
            status: "pending",
          });
          scriptObj.id = saved.id; // use real DB id for evaluation
        } catch (dbErr: any) {
          console.warn(`[BULK] DB save for merged script failed (${admNo}): ${dbErr?.message}`);
        }

        mergedScripts.push(scriptObj);
        console.log(`[BULK] Script ready for ${admNo} (${pageIds.length} pages, ${mergedAnswers.length} answers, dbId=${scriptObj.id})`);
      }

      const errors = pageResults.filter((r: any) => r.error).map((r: any) => r.error);
      console.log(`[BULK] Done: ${mergedScripts.length} merged scripts, ${errors.length} errors`);
      // Log what OCR extracted for debugging
      for (const r of successResults) {
        console.log(`[BULK-OCR] Page ${r.page.id}: name="${r.page.studentName}" adm="${r.page.admissionNumber}" sheet=${r.page.sheetNumber} answers=${r.ocrData.answers?.length ?? 0}`);
      }
      res.json({
        pagesProcessed: successResults.length,
        errors,
        mergedScripts,
        ocrDetails: successResults.map(r => ({
          studentName: r.page.studentName,
          admissionNumber: r.page.admissionNumber,
          sheetNumber: r.page.sheetNumber,
          answersFound: r.ocrData.answers?.length ?? 0,
        })),
      });
    } catch (err: any) {
      console.error("[BULK] Error:", err?.message);
      res.status(500).json({ message: "Bulk upload failed", detail: err?.message });
    }
  });

  // GET merged scripts for an exam
  app.get("/api/exams/:id/merged-scripts", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    const examId = parseInt(req.params.id);
    const exam = await storage.getExam(examId);
    if (!exam || exam.teacherId !== req.user.id) return res.status(403).json({ message: "Access denied" });

    const scripts = await storage.getMergedAnswerScriptsByExam(examId);
    // Attach evaluation if exists
    const withEval = await Promise.all(scripts.map(async (s) => {
      if (s.answerSheetId) {
        const evaluation = await storage.getEvaluationByAnswerSheetId(s.answerSheetId);
        return { ...s, evaluation: evaluation || null };
      }
      return { ...s, evaluation: null };
    }));
    res.json(withEval);
  });

  // Evaluate a merged answer script
  app.post("/api/merged-scripts/:id/evaluate", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    const scriptId = parseInt(req.params.id);
    console.log(`[BULK-EVAL] Starting evaluation for merged script id=${scriptId}`);

    try {
      const script = await storage.getMergedAnswerScript(scriptId);
      if (!script) return res.status(404).json({ message: "Merged script not found" });

      const exam = await storage.getExam(script.examId);
      if (!exam || exam.teacherId !== req.user.id) return res.status(403).json({ message: "Access denied" });

      let modelAnswerText = exam.modelAnswerText?.trim() || "";
      if (!modelAnswerText && exam.modelAnswerUrl) {
        modelAnswerText = await extractDocumentText(exam.modelAnswerUrl, "model answer");
      }
      let markingSchemeText = exam.markingSchemeText?.trim() || "";
      if (!markingSchemeText && exam.markingSchemeUrl) {
        markingSchemeText = await extractDocumentText(exam.markingSchemeUrl, "marking scheme");
      }

      const ncertChaptersData = await storage.getNcertChaptersByClassAndSubject(exam.className, exam.subject);
      const ncertContext = ncertChaptersData.length > 0
        ? ncertChaptersData.map(ch => `Chapter: ${ch.chapterName}\n${ch.chapterContent}`).join("\n\n---\n\n")
        : "";

      const mergedAnswers = (() => { try { return JSON.parse(script.mergedAnswers); } catch { return []; } })();
      const studentAnswers = (mergedAnswers as any[])
        .map((a: any) => `Q${a.question_number}: ${a.answer_text}`)
        .join("\n");

      const evalPrompt = `You are an experienced teacher evaluating a student's exam answer script.

=== EXAM DETAILS ===
Exam: ${exam.examName}
Subject: ${exam.subject}
Class: ${exam.className}
Total Marks Available: ${exam.totalMarks}

=== MODEL ANSWER ===
${modelAnswerText || "(No model answer provided — evaluate based on subject knowledge)"}

${markingSchemeText ? `=== MARKING SCHEME ===\n${markingSchemeText}` : ""}

${ncertContext ? `=== NCERT REFERENCE CHAPTERS ===\n${ncertContext}\n\nMap each question to the most relevant NCERT chapter above and reference the chapter content in your evaluation.` : ""}${!shouldUseNcert ? "\n(NCERT reference is disabled for this exam — evaluate using model answer only.)" : ""}

=== STUDENT DETAILS ===
Name: ${script.studentName}
Admission Number: ${script.admissionNumber}

=== STUDENT'S ANSWERS (merged from all pages) ===
${studentAnswers}

=== INSTRUCTIONS ===
- Compare each student answer against the model answer.
- Award marks fairly: full marks for correct, partial for partially correct, 0 for blank/wrong.
- Total marks awarded must not exceed ${exam.totalMarks}.
- For each question, identify the NCERT chapter it relates to.
- Provide a deviation reason explaining how the student's answer differs.
- Provide specific improvement suggestions per question.

Return ONLY valid JSON:
{
  "student_name": "${script.studentName}",
  "admission_number": "${script.admissionNumber}",
  "total_marks": <number 0-${exam.totalMarks}>,
  "questions": [
    {
      "question_number": <number>,
      "chapter": "<NCERT chapter name or General>",
      "marks_awarded": <number>,
      "max_marks": <number>,
      "deviation_reason": "<deviation from model answer>",
      "improvement_suggestion": "<actionable feedback>"
    }
  ],
  "overall_feedback": "<2-3 sentence summary>"
}`;

      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: evalPrompt }],
        response_format: { type: "json_object" },
      });

      const evalData = JSON.parse(response.choices[0].message.content || "{}");
      console.log(`[BULK-EVAL] Eval done — student: ${evalData.student_name}, marks: ${evalData.total_marks}`);

      // Find or create answer sheet record for this student
      const student = await storage.getStudentByAdmissionNumber(script.admissionNumber);
      const sheet = await storage.createAnswerSheet({
        examId: exam.id,
        studentId: student?.id || null,
        admissionNumber: script.admissionNumber,
        studentName: script.studentName,
        ocrOutput: script.mergedAnswers,
        status: "evaluated",
      });

      const evaluation = await storage.createEvaluation({
        answerSheetId: sheet.id,
        studentName: evalData.student_name || script.studentName,
        admissionNumber: evalData.admission_number || script.admissionNumber,
        totalMarks: evalData.total_marks ?? 0,
        questions: JSON.stringify(evalData.questions ?? []),
        overallFeedback: evalData.overall_feedback || "",
      });

      // Save deviation logs for bulk-eval
      try {
        const devLogs = (evalData.questions ?? []).map((q: any) => ({
          evaluationId: evaluation.id,
          answerSheetId: sheet.id,
          admissionNumber: evalData.admission_number || script.admissionNumber,
          examId: exam.id,
          subject: exam.subject,
          questionNumber: q.question_number ?? 0,
          chapter: q.chapter ?? "General",
          expectedConcept: q.improvement_suggestion ?? null,
          studentGap: q.deviation_reason ?? null,
          deviationReason: q.deviation_reason ?? null,
          marksAwarded: q.marks_awarded ?? 0,
          maxMarks: q.max_marks ?? 0,
        }));
        await storage.createDeviationLogs(devLogs);
      } catch (devErr) {
        console.warn("[BULK-EVAL] Could not save deviation logs:", devErr);
      }

      // Mark merged script as evaluated
      await storage.updateMergedAnswerScript(scriptId, { status: "evaluated", answerSheetId: sheet.id });

      res.json(evaluation);
    } catch (err: any) {
      console.error("[BULK-EVAL] Error:", err?.message);
      res.status(500).json({ message: "Evaluation failed", detail: err?.message });
    }
  });

  // ─── HOMEWORK ─────────────────────────────────────────────────────────────

  // Teacher: create homework
  app.post("/api/homework", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const hw = await storage.createHomework({ ...req.body, teacherId: req.user.id });
      res.status(201).json(hw);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to create homework", detail: err?.message });
    }
  });

  // Teacher: list homework
  app.get("/api/homework", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const hws = await storage.getHomeworkByTeacher(req.user.id);
      res.json(hws);
    } catch (err) {
      res.status(500).json({ message: "Failed to load homework" });
    }
  });

  // Student: list homework assigned to their class/section
  app.get("/api/student/homework", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });
    try {
      const student = await storage.getStudent(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found" });
      const hws = await storage.getHomeworkForStudent(student.studentClass, student.section);
      // Attach submission status for each homework
      const withStatus = await Promise.all(hws.map(async (hw) => {
        const sub = await storage.getHomeworkSubmission(hw.id, req.user!.id);
        const now = new Date();
        const due = new Date(hw.dueDate);
        return { ...hw, submission: sub || null, editable: now <= due };
      }));
      withStatus.sort((a, b) => {
        const subjectCmp = String(a.subject || "").localeCompare(String(b.subject || ""));
        if (subjectCmp !== 0) return subjectCmp;
        return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
      });
      res.json(withStatus);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load homework", detail: err?.message });
    }
  });

  // Student: submit homework (upload single or bulk image/pdf, run OCR, AI evaluate)
  app.post("/api/student/homework/:id/submit", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });
    const homeworkId = parseInt(req.params.id);
    const fileBase64List = Array.isArray(req.body?.filesBase64)
      ? req.body.filesBase64.filter((f: any) => typeof f === "string" && f.trim().length > 0)
      : (typeof req.body?.fileBase64 === "string" ? [req.body.fileBase64] : []);
    if (fileBase64List.length === 0) return res.status(400).json({ message: "fileBase64 or filesBase64 is required" });

    try {
      const student = await storage.getStudent(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found" });

      // Get the homework
      const hws = await storage.getHomeworkByTeacher(0); // placeholder — we need a getHomework(id) method
      // Actually fetch directly via DB approach — get all for student's class/section and find matching
      const allHw = await storage.getHomeworkForStudent(student.studentClass, student.section);
      const hw = allHw.find(h => h.id === homeworkId);
      if (!hw) return res.status(404).json({ message: "Homework not found" });

      // Check if already submitted
      const existing = await storage.getHomeworkSubmission(homeworkId, req.user.id);

      // Determine on-time
      const now = new Date();
      const due = new Date(hw.dueDate);
      const isOnTime = now <= due ? 1 : 0;

      // Allow late first submission, but lock edits after due date
      if (existing && now > due) {
        return res.status(400).json({ message: "Homework cannot be edited after due date." });
      }

      // OCR extraction from all uploaded pages/files
      let ocrText = "";
      for (let i = 0; i < fileBase64List.length; i++) {
        try {
          const text = await extractDocumentText(fileBase64List[i], `homework submission ${i + 1}`);
          if (text) ocrText += `${ocrText ? "\n\n" : ""}${text}`;
        } catch (ocrErr) {
          console.warn("[HW SUBMIT] OCR failed:", ocrErr);
        }
      }

      // AI evaluation of correctness
      let correctnessScore = 0;
      let aiFeedback = "";
      let status = "completed";

      if (ocrText && hw.modelSolutionText) {
        try {
          const evalResp = await getOpenAIClient().chat.completions.create({
            model: "gpt-4o",
            messages: [{
              role: "user",
              content: `You are evaluating a student's handwritten homework submission.

Homework description: ${hw.description}
Subject: ${hw.subject}

Model solution:
${hw.modelSolutionText}

Student's submitted answer (extracted via OCR):
${ocrText}

Rate the student's answer on a scale of 0–100 for correctness and completeness. Also give brief feedback.

Return JSON:
{
  "correctness_score": <0-100>,
  "status": "completed" | "needs_improvement",
  "feedback": "<2-3 sentence feedback>"
}`
            }],
            response_format: { type: "json_object" },
          });
          const evalData = JSON.parse(evalResp.choices[0].message.content || "{}");
          correctnessScore = evalData.correctness_score ?? 0;
          status = evalData.status === "needs_improvement" ? "needs_improvement" : "completed";
          aiFeedback = evalData.feedback || "";
        } catch (evalErr) {
          console.warn("[HW SUBMIT] AI eval failed:", evalErr);
          const sim = similarityScore(ocrText, hw.modelSolutionText || "");
          correctnessScore = Math.max(0, Math.min(100, Math.round(sim * 100)));
          status = correctnessScore >= 60 ? "completed" : "needs_improvement";
          aiFeedback = status === "completed"
            ? "Submission evaluated successfully. Good concept overlap with model solution."
            : "Submission evaluated. Please improve concept coverage as per model solution.";
        }
      } else if (ocrText) {
        status = "completed";
        correctnessScore = 70;
        aiFeedback = "Submission received. No model solution available for detailed evaluation.";
      }

      let submission;
      if (existing) {
        submission = await storage.updateHomeworkSubmission(existing.id, {
          fileBase64: fileBase64List.length === 1 ? fileBase64List[0] : JSON.stringify(fileBase64List),
          ocrText,
          correctnessScore,
          status,
          aiFeedback,
          isOnTime,
          submittedAt: new Date().toISOString(),
        } as any);
      } else {
        submission = await storage.createHomeworkSubmission({
          homeworkId,
          studentId: req.user.id,
          admissionNumber: student.admissionNumber,
          fileBase64: fileBase64List.length === 1 ? fileBase64List[0] : JSON.stringify(fileBase64List),
          ocrText,
          correctnessScore,
          status,
          aiFeedback,
          isOnTime,
        });
      }

      res.json(submission);
    } catch (err: any) {
      console.error("[HW SUBMIT] Error:", err?.message);
      res.status(500).json({ message: "Submission failed", detail: err?.message });
    }
  });

  // Student: homework regularity analytics
  app.get("/api/student/homework/analytics", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });
    try {
      const student = await storage.getStudent(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found" });

      const submissions = await storage.getHomeworkSubmissionsByStudent(req.user.id);
      const totalAssigned = (await storage.getHomeworkForStudent(student.studentClass, student.section)).length;
      const totalSubmitted = submissions.length;
      const onTimeCount = submissions.filter(s => s.isOnTime === 1).length;
      const completedCount = submissions.filter(s => s.status === "completed").length;
      const needsImprovementCount = submissions.filter(s => s.status === "needs_improvement").length;
      const avgCorrectness = submissions.length > 0
        ? Math.round(submissions.reduce((sum, s) => sum + (s.correctnessScore || 0), 0) / submissions.length)
        : 0;

      const onTimePct = totalSubmitted > 0 ? Math.round((onTimeCount / totalSubmitted) * 100) : 0;
      const completionPct = totalAssigned > 0 ? Math.round((totalSubmitted / totalAssigned) * 100) : 0;
      const lateSubmissions = submissions.filter(s => s.isOnTime !== 1).length;
      const pendingCount = Math.max(0, totalAssigned - totalSubmitted);

      let regularityClass = "Irregular";
      if (completionPct >= 80 && onTimePct >= 75) regularityClass = "Regular";
      else if (completionPct >= 60 && onTimePct >= 50) regularityClass = "Mostly Regular";

      // Submission streak: count consecutive recent on-time submissions
      let streak = 0;
      for (const s of submissions) {
        if (s.isOnTime === 1) streak++;
        else break;
      }

      res.json({
        totalAssigned,
        totalSubmitted,
        completionPct,
        onTimePct,
        avgCorrectness,
        regularityClass,
        streak,
        completedCount,
        needsImprovementCount,
        lateSubmissions,
        pendingCount,
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load homework analytics" });
    }
  });

  // Student: ask questions about one homework evaluation only (own record only)
  app.post("/api/student/homework/:id/chat", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });
    try {
      const homeworkId = parseInt(req.params.id);
      const { question } = req.body;
      if (!question || typeof question !== "string") return res.status(400).json({ message: "question is required" });

      const student = await storage.getStudent(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found" });

      const allHw = await storage.getHomeworkForStudent(student.studentClass, student.section);
      const hw = allHw.find(h => h.id === homeworkId);
      if (!hw) return res.status(404).json({ message: "Homework not found" });

      const submission = await storage.getHomeworkSubmission(homeworkId, req.user.id);
      if (!submission) return res.status(404).json({ message: "No submission found for this homework" });

      const prompt = `You are a study tutor helping a student with ONLY one homework submission.
Do not discuss any other student or other homework.

Homework:
- Subject: ${hw.subject}
- Description: ${hw.description}
- Due date: ${hw.dueDate}

Student's submission result:
- Status: ${submission.status}
- Correctness score: ${submission.correctnessScore ?? "N/A"}
- On time: ${submission.isOnTime === 1 ? "Yes" : "No"}
- AI feedback: ${submission.aiFeedback || "N/A"}

Answer the student's question briefly and specifically.`;

      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: question },
        ],
        max_tokens: 450,
      });

      res.json({ answer: response.choices[0].message.content || "I couldn't analyze that right now." });
    } catch (err: any) {
      console.error("[STUDENT HW CHAT] Error:", err?.message);
      res.status(500).json({ message: "Chat failed" });
    }
  });

  // Student: list exam evaluations (own data only)
  app.get("/api/student/evaluations", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });
    try {
      const student = await storage.getStudent(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found" });

      const evals = await storage.getEvaluationsByStudent(student.admissionNumber);
      const formatted = evals.map((e: any) => {
        let questions: any[] = [];
        try { questions = JSON.parse(e.questions || "[]"); } catch {}
        const areasOfImprovement = questions
          .filter((q: any) => (q.max_marks ?? 0) > 0 && (q.marks_awarded ?? 0) < (q.max_marks ?? 0) * 0.7)
          .map((q: any) => q.improvement_suggestion || q.chapter || `Question ${q.question_number}`)
          .filter(Boolean)
          .slice(0, 5);

        const pct = e.maxMarks > 0 ? Math.round((e.totalMarks / e.maxMarks) * 100) : 0;
        return {
          id: e.evaluationId,
          examName: e.examName,
          subject: e.subject,
          category: e.category,
          totalMarks: e.totalMarks,
          maxMarks: e.maxMarks,
          pct,
          overallFeedback: e.overallFeedback || "",
          areasOfImprovement,
          evaluatedAt: new Date().toISOString(),
        };
      });

      res.json(formatted);
    } catch (err: any) {
      console.error("[STUDENT EVAL LIST] Error:", err?.message);
      res.status(500).json({ message: "Failed to load evaluations" });
    }
  });

  // Student: ask questions about one exam evaluation only (own data only)
  app.post("/api/student/evaluations/:id/chat", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });
    try {
      const evalId = parseInt(req.params.id);
      const { question } = req.body;
      if (!question || typeof question !== "string") return res.status(400).json({ message: "question is required" });

      const student = await storage.getStudent(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found" });

      const evals = await storage.getEvaluationsByStudent(student.admissionNumber);
      const evaluation = evals.find((e: any) => e.evaluationId === evalId);
      if (!evaluation) return res.status(404).json({ message: "Evaluation not found" });

      const prompt = `You are a study tutor helping a student understand ONLY one exam evaluation.
Do not discuss any other student's data.

Evaluation context:
- Exam: ${evaluation.examName}
- Subject: ${evaluation.subject}
- Category: ${evaluation.category}
- Score: ${evaluation.totalMarks}/${evaluation.maxMarks}
- Overall feedback: ${evaluation.overallFeedback || "N/A"}
- Questions JSON: ${evaluation.questions || "[]"}

Answer the question with actionable study guidance.`;

      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: question },
        ],
        max_tokens: 450,
      });

      res.json({ answer: response.choices[0].message.content || "I couldn't analyze that right now." });
    } catch (err: any) {
      console.error("[STUDENT EVAL CHAT] Error:", err?.message);
      res.status(500).json({ message: "Chat failed" });
    }
  });

  // NCERT CHAPTERS
  app.get("/api/ncert-chapters", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    const chapters = await storage.getNcertChaptersByTeacher(req.user.id);
    res.json(chapters);
  });

  app.post("/api/ncert-chapters", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const chapter = await storage.createNcertChapter({ ...req.body, teacherId: req.user.id });
      res.status(201).json(chapter);
    } catch (err) {
      res.status(500).json({ message: "Failed to create chapter" });
    }
  });

  app.put("/api/ncert-chapters/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const chapter = await storage.updateNcertChapter(parseInt(req.params.id), req.body);
      res.json(chapter);
    } catch (err) {
      res.status(500).json({ message: "Failed to update chapter" });
    }
  });

  app.delete("/api/ncert-chapters/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      await storage.deleteNcertChapter(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete chapter" });
    }
  });

  // STUDENT CHAT
  app.get("/api/student/chat/conversations", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });
    const convs = await storage.getConversationsByStudent(req.user.id);
    res.json(convs);
  });

  app.post("/api/student/chat/conversations", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });
    const conv = await storage.createConversation(req.body.title || "New Chat", req.user.id, "student");
    res.status(201).json(conv);
  });

  app.get("/api/student/chat/conversations/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });
    try {
      const conversationId = parseInt(req.params.id, 10);
      await assertConversationAccess({ conversationId, role: "student", userId: req.user.id });
      const msgs = await storage.getMessagesByConversation(conversationId);
      res.json(msgs);
    } catch (err) {
      if (err instanceof ScopedAccessError) return res.status(err.status).json({ message: err.message });
      res.status(500).json({ message: "Failed to load messages" });
    }
  });

  app.post("/api/student/chat/conversations/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });

    const conversationId = parseInt(req.params.id);
    const { content } = req.body;

    try {
      await assertConversationAccess({ conversationId, role: "student", userId: req.user.id });
      const dataContext = await buildStudentScopedChatContext(req.user.id);

      await storage.createMessage({ conversationId, role: "user", content });

      const history = await storage.getMessagesByConversation(conversationId);
      const chatHistory = history.slice(-10).map((m: any) => ({ role: m.role, content: m.content }));

      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a personal academic coach for a student. Use only the scoped student data provided below.
Be concise, supportive, and specific. Reference their actual scores, subjects, and homework patterns when relevant.
If data is unavailable, say so clearly.

${dataContext}`,
          },
          ...chatHistory,
        ],
      });

      const aiContent = response.choices[0].message.content || "I couldn't process that. Please try again.";
      const msg = await storage.createMessage({ conversationId, role: "assistant", content: aiContent });
      res.json(msg);
    } catch (err) {
      if (err instanceof ScopedAccessError) return res.status(err.status).json({ message: err.message });
      console.error("Student Chat Error:", err);
      res.status(500).json({ message: "Chat failed" });
    }
  });

  // STUDENT PERFORMANCE PROFILE — AI-generated deep analysis
  app.get("/api/student/performance-profile", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });

    try {
      const student = await storage.getStudent(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found" });

      const evals = await storage.getEvaluationsByStudent(student.admissionNumber);
      if (evals.length === 0) {
        return res.json({
          strengths: [],
          weak_chapters: [],
          recurring_mistakes: [],
          attendance_impact: "No attendance data available.",
          performance_trend: "No exams evaluated yet.",
          recommended_focus_areas: [],
        });
      }

      // Aggregate question-level data
      const chapterScores = new Map<string, { awarded: number; max: number; count: number; deviations: string[] }>();
      const allDeviations: string[] = [];
      for (const e of evals) {
        let qs: any[] = [];
        try { qs = JSON.parse(e.questions); } catch {}
        for (const q of qs) {
          const ch = q.chapter || "General";
          const cur = chapterScores.get(ch) ?? { awarded: 0, max: 0, count: 0, deviations: [] };
          cur.awarded += q.marks_awarded ?? 0;
          cur.max += q.max_marks ?? 1;
          cur.count++;
          if (q.deviation_reason) { cur.deviations.push(q.deviation_reason); allDeviations.push(q.deviation_reason); }
          chapterScores.set(ch, cur);
        }
      }

      // Build prompt context
      const chapterSummary = Array.from(chapterScores.entries()).map(([ch, d]) => ({
        chapter: ch,
        pct: d.max > 0 ? Math.round((d.awarded / d.max) * 100) : 0,
        questions: d.count,
        sample_deviations: d.deviations.slice(0, 2),
      }));
      const examSummary = evals.map(e => ({
        exam: e.examName,
        category: e.category,
        subject: e.subject,
        score: e.totalMarks,
        max: e.maxMarks,
        pct: e.maxMarks > 0 ? Math.round((e.totalMarks / e.maxMarks) * 100) : 0,
      }));

      const prompt = `You are an educational data analyst. Based on this student's evaluation history, generate a detailed performance profile.

Student's exam history (ordered newest first):
${JSON.stringify(examSummary, null, 2)}

Chapter-level performance:
${JSON.stringify(chapterSummary, null, 2)}

Generate a JSON object with exactly these fields:
{
  "strengths": ["<strength 1>", "<strength 2>"],
  "weak_chapters": [{"chapter": "<name>", "reason": "<why weak>", "score_pct": <number>}],
  "recurring_mistakes": ["<mistake pattern 1>", "<mistake pattern 2>"],
  "attendance_impact": "<brief comment if pattern detected, else 'Consistent attendance noted'>",
  "performance_trend": "<improving/declining/stable with explanation>",
  "recommended_focus_areas": ["<area 1>", "<area 2>", "<area 3>"]
}

Be specific, reference actual subjects/chapters, and keep each item concise.`;

      const aiResp = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const profile = JSON.parse(aiResp.choices[0].message.content || "{}");

      // Cache profile
      await storage.savePerformanceProfile(req.user.id, student.admissionNumber, profile);

      res.json(profile);
    } catch (err: any) {
      console.error("Performance profile error:", err?.message);
      res.status(500).json({ message: "Failed to generate performance profile" });
    }
  });

  // STUDENT ADAPTIVE REVISION — generate practice questions for a specific chapter
  app.get("/api/student/revision", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });

    const chapter = req.query.chapter as string;
    const subject = req.query.subject as string;

    if (!chapter || !subject) {
      return res.status(400).json({ message: "chapter and subject query params are required" });
    }

    try {
      const student = await storage.getStudent(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found" });

      // Get NCERT chapter content (search across all teachers' chapters for this class+subject)
      const chapters = await storage.getNcertChaptersByClassAndSubject(student.studentClass, subject);
      const targetChapter = chapters.find(c => c.chapterName.toLowerCase().includes(chapter.toLowerCase()));
      const ncertContent = targetChapter
        ? `Chapter: ${targetChapter.chapterName}\n${targetChapter.chapterContent}`
        : `Subject: ${subject}, Chapter: ${chapter} (No NCERT content stored — use general knowledge)`;

      // Get student's past performance on this chapter
      const devLogs = await storage.getDeviationLogsByStudent(student.admissionNumber);
      const chapterLogs = devLogs.filter(d => d.chapter?.toLowerCase().includes(chapter.toLowerCase()));
      const pastGaps = chapterLogs.map(d => d.deviationReason).filter(Boolean).slice(0, 5);

      const prompt = `You are a study tutor generating personalized revision material.

NCERT Chapter Content:
${ncertContent}

${pastGaps.length > 0 ? `Student's known gaps in this chapter from past exams:\n${pastGaps.join("\n")}` : ""}

Generate a JSON response with:
{
  "revision_focus": "<2-3 sentences on what to focus on>",
  "key_concepts": ["<concept 1>", "<concept 2>", "<concept 3>", "<concept 4>"],
  "practice_questions": [
    {
      "question_number": 1,
      "question": "<question text>",
      "hint": "<brief hint>",
      "marks": <1-5>
    }
  ]
}

Generate 5 practice questions that target the student's specific gaps. Vary question types (short answer, explain, give example). Base questions ONLY on the NCERT content provided.`;

      const aiResp = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const revision = JSON.parse(aiResp.choices[0].message.content || "{}");
      res.json({ chapter, subject, ...revision });
    } catch (err: any) {
      console.error("Revision error:", err?.message);
      res.status(500).json({ message: "Failed to generate revision material" });
    }
  });

  // TEACHER DEVIATION ANALYSIS — class-wide per chapter
  app.get("/api/analytics/deviations", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const logs = await storage.getDeviationLogsByTeacher(req.user.id);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: "Failed to load deviation logs" });
    }
  });

  // ─── TEACHER HOMEWORK ALIASES ─────────────────────────────────────────────
  // Frontend calls /api/teacher/homework — map to existing /api/homework logic

  app.get("/api/teacher/homework", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const hws = await storage.getHomeworkByTeacher(req.user.id);
      res.json(hws);
    } catch (err) {
      res.status(500).json({ message: "Failed to load homework" });
    }
  });

  app.post("/api/teacher/homework", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const { subject, studentClass, section, description, questionsText, questionImages, modelSolution, modelAnswerImages, useNcertReference, dueDate } = req.body;
      // Validate due date is today or future
      const todayStr = new Date().toISOString().split("T")[0];
      if (dueDate && dueDate < todayStr) {
        return res.status(400).json({ message: "Due date cannot be in the past." });
      }
      const hw = await storage.createHomework({
        teacherId: req.user.id,
        subject,
        className: studentClass || req.body.className || "",
        section: section || "",
        description,
        questionsText: questionsText || null,
        questionImages: questionImages ? JSON.stringify(questionImages) : null,
        modelSolutionText: modelSolution || req.body.modelSolutionText || null,
        modelAnswerImages: modelAnswerImages ? JSON.stringify(modelAnswerImages) : null,
        useNcertReference: useNcertReference ? 1 : 0,
        dueDate,
      });
      res.status(201).json(hw);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to create homework", detail: err?.message });
    }
  });

  // Teacher: update homework (only before due date)
  app.put("/api/teacher/homework/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const hwId = parseInt(req.params.id);
      const hw = await storage.getHomeworkById(hwId);
      if (!hw) return res.status(404).json({ message: "Homework not found" });
      if (hw.teacherId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      // Check if past due date
      const today = new Date().toISOString().split("T")[0];
      if (hw.dueDate < today) return res.status(400).json({ message: "Cannot edit homework after due date" });
      const { subject, studentClass, section, description, questionsText, questionImages, modelSolution, modelAnswerImages, useNcertReference, dueDate } = req.body;
      const updated = await storage.updateHomework(hwId, {
        subject: subject ?? hw.subject,
        className: studentClass ?? hw.className,
        section: section ?? hw.section,
        description: description ?? hw.description,
        questionsText: questionsText ?? hw.questionsText,
        questionImages: questionImages ?? hw.questionImages,
        modelSolutionText: modelSolution ?? hw.modelSolutionText,
        modelAnswerImages: modelAnswerImages ?? hw.modelAnswerImages,
        useNcertReference: useNcertReference !== undefined ? (useNcertReference ? 1 : 0) : hw.useNcertReference,
        dueDate: dueDate ?? hw.dueDate,
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update homework", detail: err?.message });
    }
  });

  // Teacher: delete homework (only allowed if not past due)
  app.delete("/api/teacher/homework/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const hwId = parseInt(req.params.id);
      const hw = await storage.getHomeworkById(hwId);
      if (!hw) return res.status(404).json({ message: "Homework not found" });
      if (hw.teacherId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      const todayStr = new Date().toISOString().split("T")[0];
      if (hw.dueDate < todayStr) {
        return res.status(400).json({ message: "Cannot delete homework after its due date has passed. Past records are locked for academic integrity." });
      }
      await storage.deleteHomework(hwId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete homework", detail: err?.message });
    }
  });

  // Teacher: get evaluations for a homework
  app.get("/api/teacher/homework/:id/evaluations", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const hwId = parseInt(req.params.id);
      const hw = await storage.getHomeworkById(hwId);
      if (!hw) return res.status(404).json({ message: "Homework not found" });
      if (hw.teacherId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      const evaluations = await storage.getHomeworkEvaluations(hwId);
      res.json(evaluations);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load evaluations", detail: err?.message });
    }
  });

  // ─── HOMEWORK AI CHAT ──────────────────────────────────────────────────────
  // Stateless per-homework AI endpoint (no conversation history needed)
  app.post("/api/teacher/homework/:id/chat", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const hwId = parseInt(req.params.id);
      const hw = await storage.getHomeworkById(hwId);
      if (!hw) return res.status(404).json({ message: "Homework not found" });
      if (hw.teacherId !== req.user.id) return res.status(403).json({ message: "Forbidden" });

      const { question, history = [] } = req.body;

      // Fetch evaluations/submissions for context
      const evals = await storage.getHomeworkEvaluations(hwId);
      const submissionCount = evals.length;
      const scoredEvals = evals.filter((e: any) => e.correctnessScore != null);
      const avgScore = scoredEvals.length > 0
        ? Math.round(scoredEvals.reduce((a: number, e: any) => a + e.correctnessScore, 0) / scoredEvals.length)
        : null;
      const onTimeCount = evals.filter((e: any) => e.isOnTime).length;

      const hwContext = `
HOMEWORK DETAILS:
- Subject: ${hw.subject}
- Class: ${hw.className}, Section: ${hw.section}
- Due Date: ${hw.dueDate}
- Description: ${hw.description || "N/A"}
- Questions: ${hw.questionsText || "N/A"}
- Model Answer: ${hw.modelSolutionText || "N/A"}
- NCERT Reference: ${hw.useNcertReference ? "Yes" : "No"}

SUBMISSION STATS:
- Total submissions: ${submissionCount}
- Average score: ${avgScore !== null ? avgScore + "/100" : "Not yet evaluated"}
- Submitted on time: ${onTimeCount} / ${submissionCount}
- Score breakdown: ${scoredEvals.map((e: any) => `${e.studentName || e.admissionNumber}: ${e.correctnessScore}/100`).join(", ") || "None yet"}

INDIVIDUAL RESULTS:
${evals.map((e: any) => `- ${e.studentName || e.admissionNumber} (${e.admissionNumber}): Score=${e.correctnessScore ?? "Pending"}, OnTime=${e.isOnTime ? "Yes" : "No"}, Feedback="${(e.aiFeedback || "").slice(0, 100)}"`).join("\n") || "No submissions yet"}
`.trim();

      const systemPrompt = `You are an AI assistant helping a teacher understand a specific homework assignment and its student results.
Only answer questions about this homework. Be concise and helpful.

${hwContext}`;

      const messages: any[] = [
        { role: "system", content: systemPrompt },
        ...history.slice(-8).map((m: any) => ({ role: m.role, content: m.content })),
        { role: "user", content: question }
      ];

      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages,
        max_tokens: 500,
      });

      const answer = response.choices[0].message.content || "I couldn't analyze that.";
      res.json({ answer });
    } catch (err: any) {
      console.error("Homework chat error:", err);
      res.status(500).json({ message: "Chat failed", detail: err?.message });
    }
  });

  // ─── TEACHER OPTIONS (subjects, classes, sections for dropdowns) ───────────

  app.get("/api/teacher/options", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const teacherRecord = await storage.getTeacherById(req.user.id);
      const parsedAssignments = (() => {
        try {
          const raw = typeof teacherRecord?.assignments === "string"
            ? JSON.parse(teacherRecord.assignments || "[]")
            : (teacherRecord as any)?.assignments;
          return normalizeAssignments(raw);
        } catch {
          return [] as Array<{ class: string; section: string; subjects: string[] }>;
        }
      })();

      // Load assigned subjects from subjects table (admin-assigned)
      const assignedSubjectRows = await storage.getAllSubjects().then(
        rows => rows.filter(s => s.teacherId === req.user!.id)
      );

      // Build structured subject options: { name, code, className, section }
      const structuredSubjectsFromSubjects = assignedSubjectRows.map(s => ({
        name: s.name,
        code: s.code || "",
        className: String(s.className || "").trim(),
        section: String(s.section || "").trim().toUpperCase(),
      }));
      const structuredSubjectsFromAssignments = parsedAssignments.flatMap((a) =>
        a.subjects.map((subject) => ({
          name: subject,
          code: "",
          className: a.class,
          section: a.section,
        }))
      );
      const structuredSubjects = [...structuredSubjectsFromSubjects, ...structuredSubjectsFromAssignments]
        .filter((s) => s.name && s.className && s.section)
        .filter((s, i, arr) => arr.findIndex((x) =>
          x.name === s.name && x.className === s.className && x.section === s.section
        ) === i);

      // Also pull from exams/homework for fallback
      const teacherExams = await storage.getExamsByTeacher(req.user.id);
      const teacherHw = await storage.getHomeworkByTeacher(req.user.id);

      const subjectsFromExams = teacherExams.map(e => e.subject);
      const subjectsFromHw = teacherHw.map(h => h.subject);
      const allSubjectNames = [...new Set([
        ...assignedSubjectRows.map(s => s.name),
        ...parsedAssignments.flatMap((a) => a.subjects),
        ...subjectsFromExams,
        ...subjectsFromHw
      ])].sort();

      // Assigned class-section pairs
      const assignedClassSectionsFromSubjects = assignedSubjectRows
        .filter(s => s.className && s.section)
        .map(s => ({ className: String(s.className!).trim(), section: String(s.section!).trim().toUpperCase() }));
      const assignedClassSectionsFromAssignments = parsedAssignments.map((a) => ({
        className: a.class,
        section: a.section,
      }));
      
      // Also from classes table (if teacher is class teacher)
      const allClasses = await storage.getAllClasses();
      const classTeacherClasses = allClasses.filter(c => c.classTeacherId === req.user!.id)
        .map(c => ({ className: String(c.name).trim(), section: String(c.section).trim().toUpperCase() }));
      const classTeacherFromTeacherRecord = (() => {
        const value = String((teacherRecord as any)?.classTeacherOf || "").trim().toUpperCase();
        const match = value.match(/^([0-9]{1,2})-([A-Z])$/);
        if (!match) return [];
        return [{ className: match[1], section: match[2] }];
      })();

      const allClassSections = [
        ...assignedClassSectionsFromSubjects,
        ...assignedClassSectionsFromAssignments,
        ...classTeacherClasses,
        ...classTeacherFromTeacherRecord,
      ]
        .filter((v, i, a) => a.findIndex(x => x.className === v.className && x.section === v.section) === i);

      const uniqueClasses = [...new Set(allClassSections.map(c => c.className))].sort();
      const DEFAULT_SUBJECTS = ["Mathematics", "Science", "English", "Social Studies", "Hindi", "Physics", "Chemistry", "Biology", "History", "Geography"];

      res.json({
        subjects: allSubjectNames.length > 0 ? allSubjectNames : DEFAULT_SUBJECTS,
        structuredSubjects: structuredSubjects.length > 0 ? structuredSubjects : [],
        classes: uniqueClasses,
        classSections: allClassSections.length > 0 ? allClassSections : [],
        sections: ["A", "B", "C", "D"],
      });
    } catch (err) {
      console.error("teacher options error:", err);
      res.status(500).json({ message: "Failed to load options" });
    }
  });

  // ─── DASHBOARD STATS (real DB counts) ────────────────────────────────────

  app.get("/api/dashboard/stats", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const stats = await storage.getTeacherStats(req.user.id);
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: "Failed to load stats" });
    }
  });

  // ─── ADMIN: INTELLIGENCE KPIs ───────────────────────────────────────────────
  app.get("/api/admin/kpis", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const kpis = await storage.getAdminKPIs();
      res.json(kpis);
    } catch (err: any) {
      console.error("Admin KPIs error:", err?.message);
      res.status(500).json({ message: "Failed to compute KPIs" });
    }
  });

  // ─── PROFILE: GET current user's profile ────────────────────────────────────
  app.get("/api/profile", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id, role } = req.user!;
      if (role === "teacher") {
        const t = await storage.getTeacher(id);
        if (!t) return res.status(404).json({ message: "Not found" });
        const { password, ...u } = t;
        return res.json({ role, ...u });
      }
      if (role === "student") {
        const s = await storage.getStudent(id);
        if (!s) return res.status(404).json({ message: "Not found" });
        const { password, ...u } = s;
        return res.json({ role, ...u });
      }
      const adminUser = await storage.getAdminUserById(id);
      if (adminUser) {
        const { passwordHash: _, role: adminRole, ...u } = adminUser;
        return res.json({ ...u, role: adminRole === "PRINCIPAL" ? "principal" : "admin", phone: adminUser.phoneNumber });
      }
      return res.status(404).json({ message: "Not found" });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── PROFILE: PATCH update name / phone ─────────────────────────────────────
  app.patch("/api/profile", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id, role } = req.user!;
      const { name, phone } = req.body;
      const updateData: any = {};
      if (name) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      await storage.updateProfile(role as any, id, updateData);
      res.json({ message: "Profile updated" });
    } catch (err) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/profile/change-password", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id, role } = req.user!;
      if (role !== "admin" && role !== "principal") {
        return res.status(403).json({ message: "Only admin/principal can change password here" });
      }

      const { currentPassword, newPassword, confirmPassword } = req.body || {};
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }
      if (String(newPassword).length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }
      if (confirmPassword !== undefined && newPassword !== confirmPassword) {
        return res.status(400).json({ message: "New password and confirm password do not match" });
      }

      const adminUser = await storage.getAdminUserById(id);
      if (adminUser) {
        const valid = await bcrypt.compare(currentPassword, adminUser.passwordHash);
        if (!valid) return res.status(400).json({ message: "Current password is incorrect" });
        const hash = await bcrypt.hash(newPassword, 10);
        await storage.updateAdminUserPassword(id, hash);
        return res.json({ message: "Password changed successfully" });
      }

      return res.status(404).json({ message: "Account not found" });
    } catch (err) {
      console.error("[profile-change-password]", err);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // ─── PROFILE: POST upload photo ──────────────────────────────────────────────
  app.post("/api/profile/upload-photo", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id, role } = req.user!;
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ message: "imageBase64 required" });

      // Parse base64
      const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) return res.status(400).json({ message: "Invalid image format. Must be data:image/... base64" });
      const ext = match[1].replace("image/", "");
      if (!["jpeg", "jpg", "png", "webp"].includes(ext)) return res.status(400).json({ message: "Only JPG, PNG, WEBP allowed" });

      const base64Data = match[2];
      const sizeBytes = Buffer.byteLength(base64Data, "base64");
      if (sizeBytes > 5 * 1024 * 1024) return res.status(400).json({ message: "Image must be under 5MB" });

      const uploadsDir = path.join(process.cwd(), "uploads", "profile-images");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const filename = `profile-${role}-${id}-${Date.now()}.${ext}`;
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, Buffer.from(base64Data, "base64"));

      const photoUrl = `/uploads/profile-images/${filename}`;
      await storage.updateProfile(role as any, id, { profilePhotoUrl: photoUrl });

      res.json({ photoUrl });
    } catch (err: any) {
      console.error("Photo upload error:", err?.message);
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  // Serve uploaded profile photos
  app.use("/uploads", (req: Request, res: Response, next: NextFunction) => {
    const filePath = path.join(process.cwd(), "uploads", req.path);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ message: "Not found" });
    }
  });

  // ─── TEACHER SCOPE (role detection for frontend) ────────────────────────────
  app.get("/api/teacher/scope", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const { getTeacherScope } = await import("./services/teacherDataScope");
      const scope = await getTeacherScope(req.user.id);
      res.json(scope);
    } catch (err) {
      res.status(500).json({ message: "Failed to load teacher scope" });
    }
  });

  // ─── QUESTION QUALITY ANALYSIS ─────────────────────────────────────────────
  app.get("/api/teacher/question-quality", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const { computeQuestionQuality } = await import("./services/teacherDataScope");
      const poorQuestions = await computeQuestionQuality(req.user.id);

      if (poorQuestions.length === 0) {
        return res.json([]);
      }

      // AI classification — classify each poor question as Teaching Gap or Question Clarity Issue
      try {
        const prompt = `You are an educational data analyst. For each exam question below, classify the root cause of poor performance as either:
- "Teaching Gap": students lacked conceptual understanding (the topic was not mastered)
- "Question Clarity": the question itself was ambiguous or poorly worded

Questions data (JSON): ${JSON.stringify(poorQuestions.map(q => ({
  questionNumber: q.questionNumber,
  examName: q.examName,
  subject: q.subject,
  avgPct: q.avgPct,
  studentsAffected: q.studentsAffected,
  sampleDeviations: q.sampleDeviations,
})))}

Return ONLY a valid JSON array. Each element: {"questionNumber": <number>, "examName": "<string>", "flag": "Teaching Gap" | "Question Clarity", "reason": "<one sentence explanation>"}`;

        const aiResponse = await getOpenAIClient().chat.completions.create({
          model: "gpt-4o",
          temperature: 0.2,
          max_tokens: 800,
          messages: [
            { role: "system", content: "You classify exam questions by root cause of poor student performance. Return only valid JSON." },
            { role: "user", content: prompt },
          ],
        });

        const raw = aiResponse.choices[0]?.message?.content || "[]";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        const classifications: any[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        const classified = poorQuestions.map((q) => {
          const match = classifications.find(
            (c: any) => c.questionNumber == q.questionNumber && c.examName === q.examName
          );
          return {
            ...q,
            flag: match?.flag || "Teaching Gap",
            flagReason: match?.reason || "Insufficient data for classification.",
          };
        });

        return res.json(classified);
      } catch (aiErr) {
        console.warn("[question-quality] AI classification failed, returning raw data:", aiErr);
        return res.json(poorQuestions.map(q => ({
          ...q,
          flag: q.avgPct < 30 ? "Teaching Gap" : "Question Clarity",
          flagReason: "AI classification unavailable.",
        })));
      }
    } catch (err) {
      console.error("[question-quality] Error:", err);
      res.status(500).json({ message: "Failed to compute question quality" });
    }
  });


  // ─── QUALITY OF EDUCATION ─────────────────────────────────────────────────
  // Compares exam questions against NCERT depth for the class/subject
  app.get("/api/teacher/education-quality", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const exams = await storage.getExamsByTeacher(req.user.id);
      if (exams.length === 0) return res.json([]);

      const results: any[] = [];

      for (const exam of exams) {
        if (!exam.questionText) continue;

        const ncertChaps = await storage.getNcertChaptersByClassAndSubject(exam.className, exam.subject);
        const ncertContext = ncertChaps.length > 0
          ? ncertChaps.map((c: any) => `Chapter: ${c.chapterName}\nContent: ${c.chapterContent}`).join("\n\n")
          : `Standard NCERT Class ${exam.className} ${exam.subject} curriculum`;

        // Map category to readable label
        const categoryLabel: Record<string, string> = {
          unit_test: "Unit Test",
          class_test: "Class Test",
          homework: "Homework",
          half_yearly: "Half Yearly Exam",
          annual: "Annual Exam",
          quiz: "Quiz",
          assignment: "Assignment",
        };

        try {
          const prompt = `You are an expert educational quality assessor for Indian CBSE/NCERT curriculum.

Exam details:
- Name: ${exam.examName}
- Type: ${categoryLabel[exam.category] || exam.category}
- Subject: ${exam.subject}
- Class: ${exam.className}
- Total Marks: ${exam.totalMarks}

Questions asked in this exam:
${exam.questionText}

NCERT curriculum reference for Class ${exam.className} ${exam.subject}:
${ncertContext}

Analyse the question paper against the NCERT curriculum depth and return ONLY valid JSON (no markdown, no explanation):
{
  "examId": ${exam.id},
  "examName": "${exam.examName.replace(/"/g, "'")}",
  "category": "${categoryLabel[exam.category] || exam.category}",
  "subject": "${exam.subject}",
  "className": "${exam.className}",
  "totalMarks": ${exam.totalMarks},
  "overallDepthRating": "Below NCERT Level" | "At NCERT Level" | "Above NCERT Level" | "Mixed",
  "depthScore": <0-100 integer, 50 = exactly at NCERT level, <50 = below, >50 = above>,
  "summary": "<2-3 sentence overall assessment>",
  "questionAnalysis": [
    {
      "questionSnippet": "<first 60 chars of question>",
      "ncertChapter": "<matching NCERT chapter or topic>",
      "depthLevel": "Below" | "At Level" | "Above" | "Beyond Syllabus",
      "bloomsLevel": "Remember" | "Understand" | "Apply" | "Analyse" | "Evaluate" | "Create",
      "concern": "<specific concern if any, empty string if good>"
    }
  ],
  "strengths": ["strength 1", "strength 2"],
  "concerns": ["concern 1", "concern 2"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

          const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.ANTHROPIC_API_KEY || "",
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 2000,
              messages: [{ role: "user", content: prompt }],
            }),
          });

          const aiData: any = await aiRes.json();
          const raw = aiData.content?.[0]?.text || "{}";
          const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
          const parsed = JSON.parse(cleaned);
          results.push(parsed);
        } catch (aiErr) {
          // Fallback without AI
          results.push({
            examId: exam.id,
            examName: exam.examName,
            category: categoryLabel[exam.category] || exam.category,
            subject: exam.subject,
            className: exam.className,
            totalMarks: exam.totalMarks,
            overallDepthRating: "At NCERT Level",
            depthScore: 50,
            summary: "AI analysis unavailable. Questions appear to be at standard level.",
            questionAnalysis: [],
            strengths: [],
            concerns: ["AI classification temporarily unavailable"],
            recommendations: ["Add NCERT chapters in the settings to enable deep analysis"],
          });
        }
      }

      res.json(results);
    } catch (err) {
      console.error("[education-quality]", err);
      res.status(500).json({ message: "Failed to compute education quality" });
    }
  });

  // ─── EXAM STATS (mean/median/mode) ────────────────────────────────────────
  app.get("/api/exams/:id/stats", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const examId = parseInt(req.params.id);
      const exam = await storage.getExam(examId);
      if (!exam || exam.teacherId !== req.user.id) return res.status(403).json({ message: "Access denied" });

      const sheets = await storage.getAnswerSheetsByExam(examId);
      const scores: number[] = [];

      for (const sheet of sheets) {
        const evaluation = await storage.getEvaluationByAnswerSheetId(sheet.id);
        if (evaluation && exam.totalMarks > 0) {
          scores.push(Math.round((evaluation.totalMarks / exam.totalMarks) * 100));
        }
      }

      if (scores.length === 0) return res.json({ count: 0 });

      scores.sort((a, b) => a - b);
      const mean = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
      const mid = Math.floor(scores.length / 2);
      const median = scores.length % 2 === 0
        ? Math.round((scores[mid - 1] + scores[mid]) / 2)
        : scores[mid];

      // Mode
      const freq: Record<number, number> = {};
      scores.forEach(s => { freq[s] = (freq[s] || 0) + 1; });
      const maxFreq = Math.max(...Object.values(freq));
      const modes = Object.entries(freq).filter(([, f]) => f === maxFreq).map(([v]) => parseInt(v));

      // Standard deviation
      const variance = scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length;
      const stdDev = Math.round(Math.sqrt(variance));

      const categoryLabel: Record<string, string> = {
        unit_test: "Unit Test", class_test: "Class Test", homework: "Homework",
        half_yearly: "Half Yearly Exam", annual: "Annual Exam", quiz: "Quiz", assignment: "Assignment",
      };

      res.json({
        examId,
        examName: exam.examName,
        category: categoryLabel[exam.category] || exam.category,
        subject: exam.subject,
        className: exam.className,
        totalMarks: exam.totalMarks,
        questionText: exam.questionText || null,
        count: scores.length,
        mean,
        median,
        mode: modes,
        stdDev,
        min: scores[0],
        max: scores[scores.length - 1],
        scores,
        distribution: {
          "90-100": scores.filter(s => s >= 90).length,
          "75-89": scores.filter(s => s >= 75 && s < 90).length,
          "60-74": scores.filter(s => s >= 60 && s < 75).length,
          "40-59": scores.filter(s => s >= 40 && s < 60).length,
          "0-39": scores.filter(s => s < 40).length,
        },
      });
    } catch (err) {
      console.error("[exam-stats]", err);
      res.status(500).json({ message: "Failed to compute exam stats" });
    }
  });

  // ─── EARLY WARNING SYSTEM ───────────────────────────────────────────────────
  app.get("/api/teacher/early-warning", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const { computeEarlyWarnings } = await import("./services/teacherDataScope");
      const warnings = await computeEarlyWarnings(req.user.id);
      res.json(warnings);
    } catch (err) {
      console.error("[early-warning] Error:", err);
      res.status(500).json({ message: "Failed to compute early warnings" });
    }
  });

  // ─── ADMIN EARLY WARNING ────────────────────────────────────────────────────
  app.get("/api/admin/early-warning", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { computeEarlyWarnings } = await import("./services/teacherDataScope");
      const teachers = await storage.getAllTeachers();
      const warningsMap = new Map<string, any>();
      for (const teacher of teachers) {
        const warnings = await computeEarlyWarnings(teacher.id);
        for (const w of warnings) {
          if (!warningsMap.has(w.admissionNumber) || w.riskScore > warningsMap.get(w.admissionNumber).riskScore) {
            warningsMap.set(w.admissionNumber, w);
          }
        }
      }
      const allWarnings = Array.from(warningsMap.values());
      const byClass: Record<string, any[]> = {};
      for (const w of allWarnings) {
        const key = w.studentClass;
        if (!byClass[key]) byClass[key] = [];
        byClass[key].push(w);
      }
      const result = Object.entries(byClass).sort(([a], [b]) => a.localeCompare(b)).map(([cls, students]) => ({
        class: cls,
        students: students.sort((a, b) => b.riskScore - a.riskScore).slice(0, 2),
      }));
      res.json(result);
    } catch (err) {
      console.error("[admin-early-warning] Error:", err);
      res.status(500).json({ message: "Failed to compute admin early warnings" });
    }
  });

  // ─── ADMIN QUESTION QUALITY ──────────────────────────────────────────────────
  app.get("/api/admin/question-quality", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { computeQuestionQuality } = await import("./services/teacherDataScope");
      const teachers = await storage.getAllTeachers();
      const result: any[] = [];
      for (const teacher of teachers) {
        const qq = await computeQuestionQuality(teacher.id);
        for (const q of qq) {
          result.push({
            ...q,
            teacherName: teacher.name,
            teacherId: teacher.id,
            flag: q.avgPct < 30 ? "Teaching Gap" : "Question Clarity",
            flagReason: "Identified from student performance patterns.",
          });
        }
      }
      res.json(result);
    } catch (err) {
      console.error("[admin-question-quality] Error:", err);
      res.status(500).json({ message: "Failed to compute admin question quality" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADMIN CRUD: Teachers
  // ═══════════════════════════════════════════════════════════════════════════════

  app.post("/api/admin/teachers", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { errs, normalized } = validateTeacherPayload(req.body, { partial: false });
      if (errs.length) return res.status(400).json({ message: errs[0] });
      const existing = await storage.getTeacherByEmployeeId(normalized.employeeId);
      if (existing) return res.status(400).json({ message: "Employee ID already exists" });
      const allTeachers = await storage.getAllTeachers();
      if (allTeachers.some((t) => t.email?.toLowerCase() === normalized.email.toLowerCase())) {
        return res.status(400).json({ message: "Email already exists" });
      }
      if (normalized.isClassTeacher && normalized.classTeacherOf) {
        const isUnique = await ensureUniqueClassTeacher(normalized.classTeacherOf);
        if (!isUnique) return res.status(409).json({ message: `Class teacher already assigned for ${normalized.classTeacherOf}` });
      }
      const { classesAssigned, subjectsAssigned } = deriveTeacherLists(normalized.assignments);
      const defaultPwd = await bcrypt.hash("changeme123", 10);
      const teacher = await storage.createTeacher({
        employeeId: normalized.employeeId,
        name: normalized.teacherName,
        phone: normalized.phone,
        email: normalized.email,
        password: defaultPwd,
        assignments: JSON.stringify(normalized.assignments),
        subjectsAssigned: JSON.stringify(subjectsAssigned),
        classesAssigned: JSON.stringify(classesAssigned),
        isClassTeacher: normalized.isClassTeacher ? 1 : 0,
        classTeacherOf: normalized.isClassTeacher ? normalized.classTeacherOf : "",
      });
      const { password: _, ...t } = teacher;
      res.status(201).json(t);
    } catch (err) {
      console.error("[admin-create-teacher]", err);
      res.status(500).json({ message: "Failed to create teacher" });
    }
  });

  app.put("/api/admin/teachers/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const id = parseInt(req.params.id, 10);
      const existingTeacher = await storage.getTeacherById(id);
      if (!existingTeacher) return res.status(404).json({ message: "Teacher not found" });
      const { errs, normalized } = validateTeacherPayload(req.body, { partial: true });
      if (errs.length) return res.status(400).json({ message: errs[0] });
      const { name, phone, employeeId, email, subjectsAssigned, classesAssigned, assignments, isClassTeacher, classTeacherOf } = req.body;
      const updateData: any = {};
      if (name !== undefined || req.body.teacherName !== undefined) updateData.name = normalized.teacherName;
      if (phone !== undefined || req.body.phoneNumber !== undefined) updateData.phone = normalized.phone;
      if (employeeId !== undefined) updateData.employeeId = normalized.employeeId;
      if (email !== undefined) updateData.email = normalized.email;
      if (subjectsAssigned !== undefined) updateData.subjectsAssigned = subjectsAssigned;
      if (classesAssigned !== undefined) updateData.classesAssigned = classesAssigned;
      if (assignments !== undefined) {
        const nextAssignments = normalized.assignments;
        const { classesAssigned: cls, subjectsAssigned: sub } = deriveTeacherLists(nextAssignments);
        updateData.assignments = JSON.stringify(nextAssignments);
        updateData.classesAssigned = JSON.stringify(cls);
        updateData.subjectsAssigned = JSON.stringify(sub);
      }
      if (isClassTeacher !== undefined) updateData.isClassTeacher = normalized.isClassTeacher ? 1 : 0;
      if (classTeacherOf !== undefined) updateData.classTeacherOf = normalized.classTeacherOf;

      const allTeachers = await storage.getAllTeachers();
      if (updateData.employeeId && allTeachers.some((t) => t.employeeId === updateData.employeeId && t.id !== id)) {
        return res.status(409).json({ message: "Employee ID already exists" });
      }
      if (updateData.email && allTeachers.some((t) => t.email?.toLowerCase() === String(updateData.email).toLowerCase() && t.id !== id)) {
        return res.status(409).json({ message: "Email already exists" });
      }
      const nextIsClassTeacher = updateData.isClassTeacher !== undefined ? updateData.isClassTeacher === 1 : existingTeacher.isClassTeacher === 1;
      const nextClassTeacherOf = updateData.classTeacherOf !== undefined ? updateData.classTeacherOf : (existingTeacher.classTeacherOf || "");
      if (nextIsClassTeacher && nextClassTeacherOf) {
        const isUnique = await ensureUniqueClassTeacher(nextClassTeacherOf, id);
        if (!isUnique) return res.status(409).json({ message: `Class teacher already assigned for ${nextClassTeacherOf}` });
      }
      const teacher = await storage.updateTeacher(id, updateData);
      const { password: _, ...t } = teacher;
      res.json(t);
    } catch (err) {
      console.error("[admin-update-teacher]", err);
      res.status(500).json({ message: "Failed to update teacher" });
    }
  });

  app.delete("/api/admin/teachers/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { password } = req.body;
      if (password) {
        const valid = await verifyAdminPassword(req.user.id, password);
        if (!valid) return res.status(403).json({ message: "Incorrect admin password" });
      }
      const id = parseInt(req.params.id, 10);
      await storage.deleteTeacher(id);
      res.json({ message: "Teacher deleted" });
    } catch (err) {
      console.error("[admin-delete-teacher]", err);
      res.status(500).json({ message: "Failed to delete teacher" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADMIN CRUD: Students
  // ═══════════════════════════════════════════════════════════════════════════════

  app.post("/api/admin/students", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { errs, normalized } = validateStudentPayload(req.body, { partial: false });
      if (errs.length) return res.status(400).json({ message: errs[0] });
      const existingClassSection = await storage.getClassSectionByClassAndSection(parseInt(normalized.studentClass, 10), normalized.section);
      if (!existingClassSection) return res.status(400).json({ message: `Class ${normalized.studentClass}-${normalized.section} does not exist` });
      const existing = await storage.getStudentByAdmissionNumber(normalized.admissionNumber);
      if (existing) return res.status(400).json({ message: "Admission number already exists" });
      if (normalized.email) {
        const allStudents = await storage.getAllStudents();
        if (allStudents.some((s) => (s as any).email?.toLowerCase() === normalized.email.toLowerCase())) {
          return res.status(409).json({ message: "Email already exists" });
        }
      }
      const defaultPwd = await bcrypt.hash("changeme123", 10);
      const student = await storage.createStudent({
        admissionNumber: normalized.admissionNumber,
        name: normalized.name,
        phone: normalized.phone,
        email: normalized.email || null,
        studentClass: normalized.studentClass,
        section: normalized.section,
        password: defaultPwd,
      });
      const { password: _, ...s } = student;
      res.status(201).json(s);
    } catch (err) {
      console.error("[admin-create-student]", err);
      res.status(500).json({ message: "Failed to create student" });
    }
  });

  app.put("/api/admin/students/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const id = parseInt(req.params.id, 10);
      const existingStudent = await storage.getStudent(id);
      if (!existingStudent) return res.status(404).json({ message: "Student not found" });
      const { errs, normalized } = validateStudentPayload(req.body, { partial: true });
      if (errs.length) return res.status(400).json({ message: errs[0] });
      const { name, phone, admissionNumber, studentClass, section, email } = req.body;
      const updateData: any = {};
      if (name !== undefined || req.body.studentName !== undefined) updateData.name = normalized.name;
      if (phone !== undefined || req.body.phoneNumber !== undefined) updateData.phone = normalized.phone;
      if (admissionNumber !== undefined) updateData.admissionNumber = normalized.admissionNumber;
      if (email !== undefined) updateData.email = normalized.email || null;
      if (studentClass !== undefined || req.body.class !== undefined) updateData.studentClass = normalized.studentClass;
      if (section !== undefined) updateData.section = normalized.section;

      const allStudents = await storage.getAllStudents();
      if (updateData.admissionNumber && allStudents.some((s) => s.admissionNumber === updateData.admissionNumber && s.id !== id)) {
        return res.status(409).json({ message: "Admission number already exists" });
      }
      if (updateData.email && allStudents.some((s: any) => s.email?.toLowerCase() === String(updateData.email).toLowerCase() && s.id !== id)) {
        return res.status(409).json({ message: "Email already exists" });
      }
      const nextClass = updateData.studentClass || existingStudent.studentClass;
      const nextSection = updateData.section || existingStudent.section;
      const existingClassSection = await storage.getClassSectionByClassAndSection(parseInt(String(nextClass), 10), String(nextSection).toUpperCase());
      if (!existingClassSection) {
        return res.status(400).json({ message: `Class ${nextClass}-${String(nextSection).toUpperCase()} does not exist` });
      }
      const student = await storage.updateStudent(id, updateData);
      const { password: _, ...s } = student;
      res.json(s);
    } catch (err) {
      console.error("[admin-update-student]", err);
      res.status(500).json({ message: "Failed to update student" });
    }
  });

  app.delete("/api/admin/students/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { password } = req.body;
      if (password) {
        const valid = await verifyAdminPassword(req.user.id, password);
        if (!valid) return res.status(403).json({ message: "Incorrect admin password" });
      }
      const id = parseInt(req.params.id, 10);
      await storage.deleteStudent(id);
      res.json({ message: "Student deleted" });
    } catch (err) {
      console.error("[admin-delete-student]", err);
      res.status(500).json({ message: "Failed to delete student" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADMIN CRUD: Classes
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/classes", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const allClasses = await storage.getAllClasses();
      const allTeachers = await storage.getAllTeachers();
      const enriched = allClasses.map(c => {
        const teacher = c.classTeacherId ? allTeachers.find(t => t.id === c.classTeacherId) : null;
        return { ...c, classTeacherName: teacher?.name || null };
      });
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to load classes" });
    }
  });

  app.post("/api/admin/classes", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { name, section, description, classTeacherId } = req.body;
      if (!name || !section) return res.status(400).json({ message: "Class name and section are required" });
      const existingClasses = await storage.getAllClasses();
      const dupClass = existingClasses.find(c => c.name === name && c.section === section);
      if (dupClass) return res.status(400).json({ message: `Class ${name}-${section} already exists` });
      if (classTeacherId) {
        const isUnique = await ensureUniqueClassTeacher(`${name}-${section}`);
        if (!isUnique) return res.status(409).json({ message: `Class teacher already assigned for ${name}-${section}` });
      }
      const cls = await storage.createClass({ name, section, description: description || null, classTeacherId: classTeacherId || null });
      // Update teacher's isClassTeacher and classTeacherOf
      if (classTeacherId) {
        await storage.updateTeacher(classTeacherId, {
          isClassTeacher: 1,
          classTeacherOf: `${name}-${section}`,
        });
      }
      const teacherInfo = classTeacherId ? await storage.getTeacherById(classTeacherId) : null;
      res.status(201).json({ ...cls, classTeacherName: teacherInfo?.name || null });
    } catch (err) {
      console.error("[admin-create-class]", err);
      res.status(500).json({ message: "Failed to create class" });
    }
  });

  app.put("/api/admin/classes/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const id = parseInt(req.params.id, 10);
      const { name, section, description, classTeacherId } = req.body;
      const existingClass = (await storage.getAllClasses()).find((c) => c.id === id);
      if (!existingClass) return res.status(404).json({ message: "Class not found" });
      const nextName = name || existingClass.name;
      const nextSection = section || existingClass.section;
      if (classTeacherId) {
        const isUnique = await ensureUniqueClassTeacher(`${nextName}-${nextSection}`, classTeacherId);
        if (!isUnique) return res.status(409).json({ message: `Class teacher already assigned for ${nextName}-${nextSection}` });
      }
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (section !== undefined) updateData.section = section;
      if (description !== undefined) updateData.description = description;
      if (classTeacherId !== undefined) updateData.classTeacherId = classTeacherId || null;
      const cls = await storage.updateClass(id, updateData);
      // Update teacher record
      if (classTeacherId) {
        await storage.updateTeacher(classTeacherId, { isClassTeacher: 1, classTeacherOf: `${nextName}-${nextSection}` });
      }
      const teacherInfo = (updateData.classTeacherId || cls.classTeacherId) ? await storage.getTeacherById(updateData.classTeacherId || cls.classTeacherId) : null;
      res.json({ ...cls, classTeacherName: teacherInfo?.name || null });
    } catch (err) {
      console.error("[admin-update-class]", err);
      res.status(500).json({ message: "Failed to update class" });
    }
  });

  app.delete("/api/admin/classes/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const id = parseInt(req.params.id, 10);
      await storage.deleteClass(id);
      res.json({ message: "Class deleted" });
    } catch (err) {
      console.error("[admin-delete-class]", err);
      res.status(500).json({ message: "Failed to delete class" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADMIN CRUD: Subjects
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/subjects", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const allSubjects = await storage.getAllSubjects();
      const allTeachers = await storage.getAllTeachers();
      const enriched = allSubjects.map(s => {
        const teacher = s.teacherId ? allTeachers.find(t => t.id === s.teacherId) : null;
        return { ...s, teacherName: teacher?.name || null };
      });
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to load subjects" });
    }
  });

  app.post("/api/admin/subjects", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { name, code, description, className, section, teacherId } = req.body;
      if (!name) return res.status(400).json({ message: "Subject name is required" });
      if (!className || !section) return res.status(400).json({ message: "Class name and section are required for a subject" });
      const existingSubjects = await storage.getAllSubjects();
      if (code) {
        const dupCode = existingSubjects.find(s => s.code && s.code.toLowerCase() === code.toLowerCase() && s.className === className && s.section === section);
        if (dupCode) return res.status(400).json({ message: `Subject with code "${code}" for class ${className}-${section} already exists` });
      } else {
        const dupName = existingSubjects.find(s => s.name.toLowerCase() === name.toLowerCase() && s.className === className && s.section === section);
        if (dupName) return res.status(400).json({ message: `Subject "${name}" for class ${className}-${section} already exists` });
      }
      const subj = await storage.createSubject({ name, code: code || null, description: description || null, className: className || null, section: section || null, teacherId: teacherId || null });
      // Update teacher's subjects/classes assigned
      if (teacherId && className) {
        const teacher = await storage.getTeacherById(teacherId);
        if (teacher) {
          let subjects: string[] = [];
          let classes: string[] = [];
          try { subjects = JSON.parse(teacher.subjectsAssigned || "[]"); } catch {}
          try { classes = JSON.parse(teacher.classesAssigned || "[]"); } catch {}
          if (!subjects.includes(name)) subjects.push(name);
          if (!classes.includes(className)) classes.push(className);
          await storage.updateTeacher(teacherId, { subjectsAssigned: JSON.stringify(subjects), classesAssigned: JSON.stringify(classes) });
        }
      }
      const teacherInfo = teacherId ? await storage.getTeacherById(teacherId) : null;
      res.status(201).json({ ...subj, teacherName: teacherInfo?.name || null });
    } catch (err) {
      console.error("[admin-create-subject]", err);
      res.status(500).json({ message: "Failed to create subject" });
    }
  });

  app.put("/api/admin/subjects/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const id = parseInt(req.params.id, 10);
      const { name, code, description, className, section, teacherId } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (code !== undefined) updateData.code = code;
      if (description !== undefined) updateData.description = description;
      if (className !== undefined) updateData.className = className;
      if (section !== undefined) updateData.section = section;
      if (teacherId !== undefined) updateData.teacherId = teacherId || null;
      const subj = await storage.updateSubject(id, updateData);
      // Update teacher assignments
      if (teacherId && name) {
        const teacher = await storage.getTeacherById(teacherId);
        if (teacher) {
          let subjects: string[] = [];
          let classes: string[] = [];
          try { subjects = JSON.parse(teacher.subjectsAssigned || "[]"); } catch {}
          try { classes = JSON.parse(teacher.classesAssigned || "[]"); } catch {}
          if (!subjects.includes(name)) subjects.push(name);
          const cn = className || "";
          if (cn && !classes.includes(cn)) classes.push(cn);
          await storage.updateTeacher(teacherId, { subjectsAssigned: JSON.stringify(subjects), classesAssigned: JSON.stringify(classes) });
        }
      }
      const teacherInfo = (updateData.teacherId || subj.teacherId) ? await storage.getTeacherById(updateData.teacherId || subj.teacherId) : null;
      res.json({ ...subj, teacherName: teacherInfo?.name || null });
    } catch (err) {
      console.error("[admin-update-subject]", err);
      res.status(500).json({ message: "Failed to update subject" });
    }
  });

  app.delete("/api/admin/subjects/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const id = parseInt(req.params.id, 10);
      await storage.deleteSubject(id);
      res.json({ message: "Subject deleted" });
    } catch (err) {
      console.error("[admin-delete-subject]", err);
      res.status(500).json({ message: "Failed to delete subject" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // OTP Auth: Send OTP and Verify OTP
  // ═══════════════════════════════════════════════════════════════════════════════

  app.post("/api/auth/otp/send", async (req, res) => {
    try {
      const { phone, role, identifier } = req.body;
      if (!phone || !role || !identifier) return res.status(400).json({ message: "Phone, role and identifier are required" });

      // Verify the user exists and phone matches
      if (role === "teacher") {
        const teacher = await storage.getTeacherByEmployeeId(String(identifier).trim());
        if (!teacher) return res.status(404).json({ message: "Teacher not found with this Employee ID" });
        if (!teacher.phone || teacher.phone !== String(phone).trim()) return res.status(400).json({ message: "Phone number does not match records" });
      } else if (role === "student") {
        const student = await storage.getStudentByAdmissionNumber(String(identifier).trim());
        if (!student) return res.status(404).json({ message: "Student not found with this Admission Number" });
        if (!student.phone || student.phone !== String(phone).trim()) return res.status(400).json({ message: "Phone number does not match records" });
      } else {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Generate 6-digit OTP
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

      // Temporarily keep SMS logic disabled for local testing.
      // if (!isIntegrationTestMode) {
      //   await sendOtpSms(String(phone).trim(), code, 300);
      // }

      await storage.createOtp(phone, code, role, identifier, expiresAt);
      console.log(`[OTP][LOCAL] Code ${code} generated for ${phone} (${role}:${identifier})`);

      if (isIntegrationTestMode) {
        return res.json({ message: "OTP sent successfully", expiresIn: 300, code });
      }
      res.json({ message: "OTP sent successfully", expiresIn: 300 });
    } catch (err) {
      console.error("[otp-send]", err);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  app.post("/api/auth/otp/verify", async (req, res) => {
    try {
      const { phone, code, role, identifier } = req.body;
      if (!phone || !code || !role || !identifier) return res.status(400).json({ message: "Phone, code, role and identifier are required" });

      const otp = await storage.getLatestOtp(phone, identifier);
      if (!otp) return res.status(400).json({ message: "No OTP found. Please request a new one." });

      // Check expiry
      if (new Date(otp.expiresAt) < new Date()) {
        return res.status(400).json({ message: "OTP has expired. Please request a new one." });
      }

      // Check code
      if (otp.code !== code) {
        return res.status(400).json({ message: "Invalid OTP code" });
      }

      // Mark as verified
      await storage.markOtpVerified(otp.id);

      // Login the user
      if (role === "teacher") {
        const teacher = await storage.getTeacherByEmployeeId(String(identifier).trim());
        if (!teacher) return res.status(404).json({ message: "Teacher not found" });
        if (!teacher.phone || teacher.phone !== String(phone).trim()) return res.status(400).json({ message: "Phone number does not match records" });
        const token = jwt.sign({ id: teacher.id, role: "teacher" }, JWT_SECRET, { expiresIn: "1d" });
        const { password, ...teacherWithoutPassword } = teacher;
        res.json({ token, role: "teacher", user: teacherWithoutPassword });
      } else if (role === "student") {
        const student = await storage.getStudentByAdmissionNumber(String(identifier).trim());
        if (!student) return res.status(404).json({ message: "Student not found" });
        if (!student.phone || student.phone !== String(phone).trim()) return res.status(400).json({ message: "Phone number does not match records" });
        const token = jwt.sign({ id: student.id, role: "student" }, JWT_SECRET, { expiresIn: "1d" });
        const { password, ...studentWithoutPassword } = student;
        res.json({ token, role: "student", user: studentWithoutPassword });
      } else {
        return res.status(400).json({ message: "Invalid role" });
      }
    } catch (err) {
      console.error("[otp-verify]", err);
      res.status(500).json({ message: "Failed to verify OTP" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN USER AUTH (ADMIN + PRINCIPAL)
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/api/auth/adminuser/login", async (req, res) => {
    try {
      const { employeeId, password } = req.body;
      if (!employeeId || !password) return res.status(400).json({ message: "Employee ID and password required" });

      const adminUser = await storage.getAdminUserByEmployeeId(employeeId);
      if (adminUser && (await bcrypt.compare(password, adminUser.passwordHash))) {
        const jwtRole = adminUser.role === "PRINCIPAL" ? "principal" : "admin";
        const token = jwt.sign({ id: adminUser.id, role: jwtRole }, JWT_SECRET, { expiresIn: "1d" });
        const { passwordHash: _, ...userWithoutPwd } = adminUser;
        return res.json({ token, role: jwtRole, user: userWithoutPwd });
      }

      return res.status(401).json({ message: "Invalid credentials" });
    } catch (err) {
      console.error("[adminuser-login]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/adminuser/signup", async (req, res) => {
    try {
      const parsed = z.object({
        employeeId: z.string().min(1),
        name: z.string().min(1),
        email: z.string().email(),
        phoneNumber: z.string().optional(),
        password: z.string().min(6),
        role: z.enum(["ADMIN", "PRINCIPAL"]),
      }).safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid signup payload" });
      }

      const employeeId = parsed.data.employeeId.trim();
      const name = parsed.data.name.trim();
      const email = parsed.data.email.trim().toLowerCase();
      const phoneNumber = parsed.data.phoneNumber ? parsed.data.phoneNumber.trim() : null;
      const role = parsed.data.role;
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);

      const byEmployeeId = await storage.getAdminUserByEmployeeId(employeeId);
      if (byEmployeeId) return res.status(409).json({ message: "Employee ID already exists" });

      const byEmail = await storage.getAdminUserByEmail(email);
      if (byEmail) return res.status(409).json({ message: "Email already exists" });

      const created = await storage.createAdminUser({
        employeeId,
        name,
        email,
        passwordHash,
        phoneNumber,
        role,
      });

      const jwtRole = created.role === "PRINCIPAL" ? "principal" : "admin";
      const token = jwt.sign({ id: created.id, role: jwtRole }, JWT_SECRET, { expiresIn: "1d" });
      const { passwordHash: _, ...userWithoutPwd } = created;
      return res.status(201).json({ token, role: jwtRole, user: userWithoutPwd });
    } catch (err) {
      console.error("[adminuser-signup]", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Principal seed endpoint disabled per no-seeding policy
  app.post("/api/auth/adminuser/seed-principal", async (req, res) => {
    return res.status(403).json({ message: "Seeding is disabled." });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASS-SECTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/class-sections", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "principal") return res.status(403).json({ message: "Forbidden" });
    try {
      const list = await storage.getAllClassSections();
      res.json(list);
    } catch (err) { res.status(500).json({ message: "Failed to fetch class sections" }); }
  });

  app.post("/api/admin/class-sections", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { className, section, subjects } = req.body;
      if (!className || !section || !subjects) return res.status(400).json({ message: "Class, section and subjects required" });
      // Validate: class must be integer
      const classNum = parseInt(className, 10);
      if (isNaN(classNum) || String(classNum) !== String(className)) return res.status(400).json({ message: "Class must be an integer" });
      // Validate: section must be capital alphabet
      if (!/^[A-Z]$/.test(section)) return res.status(400).json({ message: "Section must be a single capital letter (A-Z)" });
      // Check duplicate
      const existing = await storage.getClassSectionByClassAndSection(classNum, section);
      if (existing) return res.status(409).json({ message: `Class ${classNum}-${section} already exists`, duplicate: true });
      const subjectsJson = JSON.stringify(Array.isArray(subjects) ? subjects : subjects.split(",").map((s: string) => s.trim()));
      const created = await storage.createClassSection({ className: classNum, section, subjects: subjectsJson });
      res.status(201).json(created);
    } catch (err) {
      console.error("[create-class-section]", err);
      res.status(500).json({ message: "Failed to create class section" });
    }
  });

  app.put("/api/admin/class-sections/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const id = parseInt(req.params.id, 10);
      const { subjects } = req.body;
      const updateData: any = {};
      if (subjects !== undefined) {
        updateData.subjects = JSON.stringify(Array.isArray(subjects) ? subjects : subjects.split(",").map((s: string) => s.trim()));
      }
      if (subjects === undefined) {
        return res.status(400).json({ message: "Only subjects can be edited for class sections" });
      }
      const updated = await storage.updateClassSection(id, updateData);
      res.json(updated);
    } catch (err) { res.status(500).json({ message: "Failed to update" }); }
  });

  app.delete("/api/admin/class-sections/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { password, deleteSubject } = req.body;
      if (!password) return res.status(400).json({ message: "Admin password required" });
      const validPwd = await verifyAdminPassword(req.user.id, password);
      if (!validPwd) return res.status(403).json({ message: "Incorrect admin password" });
      const id = parseInt(req.params.id, 10);
      if (deleteSubject) {
        // Delete only specific subject from the class section
        const existing = await storage.getAllClassSections().then(list => list.find(c => c.id === id));
        if (!existing) return res.status(404).json({ message: "Not found" });
        const subs: string[] = JSON.parse(existing.subjects);
        const filtered = subs.filter(s => s !== deleteSubject);
        await storage.updateClassSection(id, { subjects: JSON.stringify(filtered) });
        return res.json({ message: "Subject removed" });
      }
      await storage.deleteClassSection(id);
      res.json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ message: "Failed to delete" }); }
  });

  app.post("/api/admin/class-sections/bulk-upload", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ message: "Records array required" });
      const parsed = records.map((r: any) => ({
        className: parseInt(r.class || r.className, 10),
        section: String(r.section).toUpperCase().trim(),
        subjects: JSON.stringify(String(r.subjects || "").split(",").map((s: string) => s.trim()).filter(Boolean)),
      }));
      const result = await storage.bulkCreateClassSections(parsed);
      res.json(result);
    } catch (err) { res.status(500).json({ message: "Bulk upload failed" }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGED STUDENTS MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/managed-students", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "principal") return res.status(403).json({ message: "Forbidden" });
    try {
      const list = await storage.getAllStudents();
      res.json(list.map((s: any) => ({
        id: s.id,
        studentName: s.name,
        phoneNumber: s.phone || "",
        email: s.email || "",
        admissionNumber: s.admissionNumber,
        class: s.studentClass,
        section: s.section,
      })));
    } catch (err) { res.status(500).json({ message: "Failed to fetch" }); }
  });

  app.post("/api/admin/managed-students", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { errs, normalized } = validateStudentPayload(req.body, { partial: false });
      if (errs.length) return res.status(400).json({ message: errs[0] });

      const existingClassSection = await storage.getClassSectionByClassAndSection(parseInt(normalized.studentClass, 10), normalized.section);
      if (!existingClassSection) return res.status(400).json({ message: `Class ${normalized.studentClass}-${normalized.section} does not exist` });

      const existing = await storage.getStudentByAdmissionNumber(normalized.admissionNumber);
      if (existing) return res.status(409).json({ message: "Admission number already exists", duplicate: true });

      const allStudents = await storage.getAllStudents();
      if (normalized.email && allStudents.some((s: any) => s.email?.toLowerCase() === normalized.email.toLowerCase())) {
        return res.status(409).json({ message: "Email already exists", duplicate: true });
      }

      const password = await bcrypt.hash("changeme123", 10);
      const created = await storage.createStudent({
        admissionNumber: normalized.admissionNumber,
        name: normalized.name,
        phone: normalized.phone,
        email: normalized.email || null,
        studentClass: normalized.studentClass,
        section: normalized.section,
        password,
      } as any);
      const { password: _, ...studentWithoutPassword } = created;
      res.status(201).json({
        id: studentWithoutPassword.id,
        studentName: studentWithoutPassword.name,
        phoneNumber: studentWithoutPassword.phone || "",
        email: (studentWithoutPassword as any).email || "",
        admissionNumber: studentWithoutPassword.admissionNumber,
        class: studentWithoutPassword.studentClass,
        section: studentWithoutPassword.section,
      });
    } catch (err) { res.status(500).json({ message: "Failed to create" }); }
  });

  app.put("/api/admin/managed-students/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const id = parseInt(req.params.id, 10);
      const existingStudent = await storage.getStudent(id);
      if (!existingStudent) return res.status(404).json({ message: "Student not found" });
      const { errs, normalized } = validateStudentPayload(req.body, { partial: true });
      if (errs.length) return res.status(400).json({ message: errs[0] });

      const { studentName, phoneNumber, email, admissionNumber, class: cls, section } = req.body;
      const updateData: any = {};
      if (studentName !== undefined || req.body.name !== undefined) updateData.name = normalized.name;
      if (phoneNumber !== undefined || req.body.phone !== undefined) updateData.phone = normalized.phone;
      if (email !== undefined) updateData.email = normalized.email || null;
      if (admissionNumber !== undefined) updateData.admissionNumber = normalized.admissionNumber;
      if (cls !== undefined || req.body.studentClass !== undefined) updateData.studentClass = normalized.studentClass;
      if (section !== undefined) updateData.section = normalized.section;

      const allStudents = await storage.getAllStudents();
      if (updateData.admissionNumber && allStudents.some((s) => s.admissionNumber === updateData.admissionNumber && s.id !== id)) {
        return res.status(409).json({ message: "Admission number already exists", duplicate: true });
      }
      if (updateData.email && allStudents.some((s: any) => s.email?.toLowerCase() === String(updateData.email).toLowerCase() && s.id !== id)) {
        return res.status(409).json({ message: "Email already exists", duplicate: true });
      }

      const nextClass = updateData.studentClass || existingStudent.studentClass;
      const nextSection = updateData.section || existingStudent.section;
      const existingClassSection = await storage.getClassSectionByClassAndSection(parseInt(String(nextClass), 10), String(nextSection).toUpperCase());
      if (!existingClassSection) return res.status(400).json({ message: `Class ${nextClass}-${String(nextSection).toUpperCase()} does not exist` });

      const updated = await storage.updateStudent(id, updateData);
      const { password: _, ...studentWithoutPassword } = updated as any;
      res.json({
        id: studentWithoutPassword.id,
        studentName: studentWithoutPassword.name,
        phoneNumber: studentWithoutPassword.phone || "",
        email: studentWithoutPassword.email || "",
        admissionNumber: studentWithoutPassword.admissionNumber,
        class: studentWithoutPassword.studentClass,
        section: studentWithoutPassword.section,
      });
    } catch (err) { res.status(500).json({ message: "Failed to update" }); }
  });

  app.delete("/api/admin/managed-students/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { password } = req.body;
      if (!password) return res.status(400).json({ message: "Admin password required" });
      const validPwd = await verifyAdminPassword(req.user.id, password);
      if (!validPwd) return res.status(403).json({ message: "Incorrect admin password" });
      const id = parseInt(req.params.id, 10);
      await storage.deleteStudent(id);
      res.json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ message: "Failed to delete" }); }
  });

  app.post("/api/admin/managed-students/bulk-upload", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ message: "Records array required" });
      const allStudents = await storage.getAllStudents();
      const byAdmission = new Set(allStudents.map((s) => s.admissionNumber));
      let created = 0;
      const duplicates: string[] = [];
      const errors: string[] = [];
      for (const r of records) {
        const candidate = {
          studentName: r.studentName || r.name || "",
          phoneNumber: r.phoneNumber || r.phone || "",
          email: r.email || "",
          admissionNumber: String(r.admissionNumber || "").trim(),
          class: String(r.class || r.studentClass || "").trim(),
          section: String(r.section || "").trim().toUpperCase(),
        };
        const { errs, normalized } = validateStudentPayload(candidate, { partial: false, requireContact: false });
        if (errs.length) { errors.push(`${normalized.admissionNumber || candidate.admissionNumber || "row"}: ${errs[0]}`); continue; }
        const existingClassSection = await storage.getClassSectionByClassAndSection(parseInt(normalized.studentClass, 10), normalized.section);
        if (!existingClassSection) {
          await storage.createClassSection({
            className: parseInt(normalized.studentClass, 10),
            section: normalized.section,
            subjects: JSON.stringify([]),
          });
        }
        if (byAdmission.has(normalized.admissionNumber)) {
          duplicates.push(normalized.admissionNumber);
          continue;
        }
        const password = await bcrypt.hash("changeme123", 10);
        await storage.createStudent({
          admissionNumber: normalized.admissionNumber,
          name: normalized.name,
          phone: normalized.phone,
          email: normalized.email || null,
          studentClass: normalized.studentClass,
          section: normalized.section,
          password,
        } as any);
        byAdmission.add(normalized.admissionNumber);
        created++;
      }
      res.json({ created, duplicates, errors });
    } catch (err) { res.status(500).json({ message: "Bulk upload failed" }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGED TEACHERS MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/managed-teachers", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "principal") return res.status(403).json({ message: "Forbidden" });
    try {
      const list = await storage.getAllTeachers();
      res.json(list.map((t: any) => ({
        id: t.id,
        teacherName: t.name,
        employeeId: t.employeeId,
        email: t.email || "",
        phoneNumber: t.phone || "",
        assignments: t.assignments || "[]",
        isClassTeacher: t.isClassTeacher || 0,
        classTeacherOf: t.classTeacherOf || null,
      })));
    } catch (err) { res.status(500).json({ message: "Failed to fetch" }); }
  });

  app.post("/api/admin/managed-teachers", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { errs, normalized } = validateTeacherPayload(req.body, { partial: false });
      if (errs.length) return res.status(400).json({ message: errs[0] });
      const assignmentError = await validateTeacherAssignments(normalized.assignments);
      if (assignmentError) return res.status(400).json({ message: assignmentError });
      const existing = await storage.getTeacherByEmployeeId(normalized.employeeId);
      if (existing) return res.status(409).json({ message: "Employee ID already exists", duplicate: true });
      const allTeachers = await storage.getAllTeachers();
      if (allTeachers.some((t) => t.email?.toLowerCase() === normalized.email.toLowerCase())) {
        return res.status(409).json({ message: "Email already exists", duplicate: true });
      }
      if (normalized.isClassTeacher && normalized.classTeacherOf) {
        const isUnique = await ensureUniqueClassTeacher(normalized.classTeacherOf);
        if (!isUnique) return res.status(409).json({ message: `Class teacher already assigned for ${normalized.classTeacherOf}`, duplicate: true });
      }
      const { classesAssigned, subjectsAssigned } = deriveTeacherLists(normalized.assignments);
      const password = await bcrypt.hash("changeme123", 10);
      const created = await storage.createTeacher({
        employeeId: normalized.employeeId,
        name: normalized.teacherName,
        email: normalized.email,
        phone: normalized.phone,
        password,
        assignments: JSON.stringify(normalized.assignments),
        classesAssigned: JSON.stringify(classesAssigned),
        subjectsAssigned: JSON.stringify(subjectsAssigned),
        isClassTeacher: normalized.isClassTeacher ? 1 : 0,
        classTeacherOf: normalized.isClassTeacher ? normalized.classTeacherOf : "",
      } as any);
      const { password: _, ...teacherWithoutPassword } = created as any;
      res.status(201).json({
        id: teacherWithoutPassword.id,
        teacherName: teacherWithoutPassword.name,
        employeeId: teacherWithoutPassword.employeeId,
        email: teacherWithoutPassword.email || "",
        phoneNumber: teacherWithoutPassword.phone || "",
        assignments: teacherWithoutPassword.assignments || "[]",
        isClassTeacher: teacherWithoutPassword.isClassTeacher || 0,
        classTeacherOf: teacherWithoutPassword.classTeacherOf || null,
      });
    } catch (err) { res.status(500).json({ message: "Failed to create" }); }
  });

  app.put("/api/admin/managed-teachers/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const id = parseInt(req.params.id, 10);
      const existingTeacher = await storage.getTeacherById(id);
      if (!existingTeacher) return res.status(404).json({ message: "Teacher not found" });
      const { errs, normalized } = validateTeacherPayload(req.body, { partial: true });
      if (errs.length) return res.status(400).json({ message: errs[0] });
      const { teacherName, employeeId, email, phoneNumber, assignments, isClassTeacher, classTeacherOf } = req.body;
      const updateData: any = {};
      if (teacherName !== undefined || req.body.name !== undefined) updateData.name = normalized.teacherName;
      if (employeeId !== undefined) updateData.employeeId = normalized.employeeId;
      if (email !== undefined) updateData.email = normalized.email;
      if (phoneNumber !== undefined || req.body.phone !== undefined) updateData.phone = normalized.phone;
      if (assignments !== undefined) {
        const assignmentError = await validateTeacherAssignments(normalized.assignments);
        if (assignmentError) return res.status(400).json({ message: assignmentError });
        const { classesAssigned, subjectsAssigned } = deriveTeacherLists(normalized.assignments);
        updateData.assignments = JSON.stringify(normalized.assignments);
        updateData.classesAssigned = JSON.stringify(classesAssigned);
        updateData.subjectsAssigned = JSON.stringify(subjectsAssigned);
      }
      if (isClassTeacher !== undefined) updateData.isClassTeacher = normalized.isClassTeacher ? 1 : 0;
      if (classTeacherOf !== undefined) updateData.classTeacherOf = normalized.classTeacherOf;

      const allTeachers = await storage.getAllTeachers();
      if (updateData.employeeId && allTeachers.some((t) => t.employeeId === updateData.employeeId && t.id !== id)) {
        return res.status(409).json({ message: "Employee ID already exists", duplicate: true });
      }
      if (updateData.email && allTeachers.some((t) => t.email?.toLowerCase() === String(updateData.email).toLowerCase() && t.id !== id)) {
        return res.status(409).json({ message: "Email already exists", duplicate: true });
      }

      const nextIsClassTeacher = updateData.isClassTeacher !== undefined ? updateData.isClassTeacher === 1 : existingTeacher.isClassTeacher === 1;
      const nextClassTeacherOf = updateData.classTeacherOf !== undefined ? updateData.classTeacherOf : (existingTeacher.classTeacherOf || "");
      if (nextIsClassTeacher && nextClassTeacherOf) {
        const isUnique = await ensureUniqueClassTeacher(nextClassTeacherOf, id);
        if (!isUnique) return res.status(409).json({ message: `Class teacher already assigned for ${nextClassTeacherOf}`, duplicate: true });
      }

      const updated = await storage.updateTeacher(id, updateData);
      const { password: _, ...teacherWithoutPassword } = updated as any;
      res.json({
        id: teacherWithoutPassword.id,
        teacherName: teacherWithoutPassword.name,
        employeeId: teacherWithoutPassword.employeeId,
        email: teacherWithoutPassword.email || "",
        phoneNumber: teacherWithoutPassword.phone || "",
        assignments: teacherWithoutPassword.assignments || "[]",
        isClassTeacher: teacherWithoutPassword.isClassTeacher || 0,
        classTeacherOf: teacherWithoutPassword.classTeacherOf || null,
      });
    } catch (err) { res.status(500).json({ message: "Failed to update" }); }
  });

  app.delete("/api/admin/managed-teachers/:id", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { password, deleteSubjectOnly, className, section, subject } = req.body;
      if (!password) return res.status(400).json({ message: "Admin password required" });
      const validPwd = await verifyAdminPassword(req.user.id, password);
      if (!validPwd) return res.status(403).json({ message: "Incorrect admin password" });
      const id = parseInt(req.params.id, 10);
      if (deleteSubjectOnly && className && section && subject) {
        const t = await storage.getTeacherById(id) as any;
        if (!t) return res.status(404).json({ message: "Not found" });
        const assignments: any[] = JSON.parse((t.assignments as string) || "[]");
        const updated = assignments.map((a: any) => {
          if (a.class === className && a.section === section) {
            return { ...a, subjects: (a.subjects || []).filter((s: string) => s !== subject) };
          }
          return a;
        }).filter((a: any) => a.subjects && a.subjects.length > 0);
        const { classesAssigned, subjectsAssigned } = deriveTeacherLists(updated);
        await storage.updateTeacher(id, {
          assignments: JSON.stringify(updated),
          classesAssigned: JSON.stringify(classesAssigned),
          subjectsAssigned: JSON.stringify(subjectsAssigned),
        } as any);
        return res.json({ message: "Subject assignment removed" });
      }
      await storage.deleteTeacher(id);
      res.json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ message: "Failed to delete" }); }
  });

  app.post("/api/admin/managed-teachers/bulk-upload", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ message: "Records array required" });
      const parseAssignmentsCell = (raw: unknown): Array<{ class: string; section: string; subjects: string[] }> => {
        const text = String(raw ?? "").trim();
        if (!text) return [];
        const slots = text.split(";").map((s) => s.trim()).filter(Boolean);
        const merged = new Map<string, Set<string>>();
        for (const slot of slots) {
          const [classSectionRaw, subjectsRaw = ""] = slot.split(":");
          const match = String(classSectionRaw).trim().replace(/\s+/g, "").match(/^([0-9]{1,2})-([A-Za-z])$/);
          if (!match) continue;
          const className = match[1];
          const section = match[2].toUpperCase();
          const key = `${className}-${section}`;
          const current = merged.get(key) ?? new Set<string>();
          String(subjectsRaw)
            .split(/[\|,]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((subj) => current.add(subj));
          if (current.size > 0) merged.set(key, current);
        }
        return Array.from(merged.entries()).map(([key, subjectsSet]) => {
          const [className, section] = key.split("-");
          return { class: className, section, subjects: Array.from(subjectsSet) };
        });
      };
      const allTeachers = await storage.getAllTeachers();
      const byEmployeeId = new Set(allTeachers.map((t) => t.employeeId));
      let created = 0;
      const duplicates: string[] = [];
      const errors: string[] = [];

      for (const r of records) {
        const assignments = parseAssignmentsCell(r.assignments);
        if (!assignments.length && r.class && r.section && r.subjects) {
          assignments.push({
            class: String(r.class).trim(),
            section: String(r.section).trim().toUpperCase(),
            subjects: String(r.subjects).split(",").map((s: string) => s.trim()).filter(Boolean),
          });
        }
        const candidate = {
          teacherName: r.teacherName || r.name || "",
          employeeId: String(r.employeeId || ""),
          email: r.email || "",
          phoneNumber: r.phoneNumber || r.phone || "",
          assignments,
          isClassTeacher: (() => {
            const raw = String(r.isClassTeacher ?? "").trim().toLowerCase();
            return r.isClassTeacher === true || r.isClassTeacher === 1 || ["true", "1", "yes", "y"].includes(raw);
          })(),
          classTeacherOf: r.classTeacherOf || (
            (r.classTeacherOfClass || r.classTeacherClass) && (r.classTeacherOfSection || r.classTeacherSection)
              ? `${String(r.classTeacherOfClass || r.classTeacherClass).trim()}-${String(r.classTeacherOfSection || r.classTeacherSection).trim().toUpperCase()}`
              : null
          ),
          class: r.class,
          section: r.section,
        };
        const { errs, normalized } = validateTeacherPayload(candidate, { partial: false, requireContact: false });
        if (errs.length || byEmployeeId.has(normalized.employeeId)) {
          if (errs.length) errors.push(`${normalized.employeeId || String(r.employeeId || "row")}: ${errs[0]}`);
          else duplicates.push(normalized.employeeId || String(r.employeeId || "invalid-row"));
          continue;
        }
        for (const assignment of normalized.assignments) {
          const classNum = parseInt(assignment.class, 10);
          const section = assignment.section;
          const existingClassSection = await storage.getClassSectionByClassAndSection(classNum, section);
          if (!existingClassSection) {
            await storage.createClassSection({
              className: classNum,
              section,
              subjects: JSON.stringify(assignment.subjects),
            });
            continue;
          }
          let currentSubjects: string[] = [];
          try { currentSubjects = JSON.parse(existingClassSection.subjects || "[]"); } catch {}
          const mergedSubjects = Array.from(new Set([...(currentSubjects || []), ...assignment.subjects]));
          if (mergedSubjects.length !== currentSubjects.length) {
            await storage.updateClassSection(existingClassSection.id, { subjects: JSON.stringify(mergedSubjects) });
          }
        }
        const assignmentError = await validateTeacherAssignments(normalized.assignments);
        if (assignmentError) { errors.push(`${normalized.employeeId}: ${assignmentError}`); continue; }
        if (normalized.isClassTeacher && normalized.classTeacherOf) {
          const isUnique = await ensureUniqueClassTeacher(normalized.classTeacherOf);
          if (!isUnique) { duplicates.push(normalized.employeeId); continue; }
        }
        const { classesAssigned, subjectsAssigned } = deriveTeacherLists(normalized.assignments);
        const password = await bcrypt.hash("changeme123", 10);
        await storage.createTeacher({
          employeeId: normalized.employeeId,
          name: normalized.teacherName,
          email: normalized.email,
          phone: normalized.phone,
          password,
          assignments: JSON.stringify(normalized.assignments),
          classesAssigned: JSON.stringify(classesAssigned),
          subjectsAssigned: JSON.stringify(subjectsAssigned),
          isClassTeacher: normalized.isClassTeacher ? 1 : 0,
          classTeacherOf: normalized.isClassTeacher ? normalized.classTeacherOf : "",
        } as any);
        byEmployeeId.add(normalized.employeeId);
        created++;
      }

      res.json({ created, duplicates, errors });
    } catch (err) { res.status(500).json({ message: "Bulk upload failed" }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRINCIPAL ANALYTICS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  // Dynamic stats for principal dashboard header
  app.get("/api/principal/stats", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "principal" && req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const stats = await storage.getSchoolStats();
      res.json(stats);
    } catch (err) {
      console.error("[principal/stats]", err);
      res.status(500).json({ message: "Failed" });
    }
  });

  // Class performance insights
  app.get("/api/principal/class-performance", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "principal" && req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const allEvals = await storage.getAllEvaluations?.() || [];
      const allSheets = await storage.getAllAnswerSheets?.() || [];
      const allExams = await storage.getAllExams?.() || [];
      const allStudents = await storage.getAllStudents();
      const allClassSections = await storage.getAllClassSections?.() || [];

      // Build exam map
      const examMap = new Map(allExams.map((e: any) => [e.id, e]));
      const sheetMap = new Map(allSheets.map((s: any) => [s.id, s]));

      // Per class-section performance
      const classData: Record<string, { scores: number[]; students: Set<string>; totalStudents: number }> = {};

      for (const ev of allEvals) {
        const sheet = sheetMap.get(ev.answerSheetId);
        if (!sheet) continue;
        const exam = examMap.get(sheet.examId);
        if (!exam) continue;
        const key = `${exam.className}-${exam.section || "?"}`;
        if (!classData[key]) classData[key] = { scores: [], students: new Set(), totalStudents: 0 };
        const qs = JSON.parse(ev.questions || "[]");
        const awarded = qs.reduce((a: number, q: any) => a + (q.marks_awarded || 0), 0);
        const max = qs.reduce((a: number, q: any) => a + (q.max_marks || 0), 0);
        if (max > 0) classData[key].scores.push((awarded / max) * 100);
        classData[key].students.add(ev.admissionNumber);
      }

      // Total students per class
      for (const s of allStudents) {
        const key = `${s.studentClass}-${s.section}`;
        if (!classData[key]) classData[key] = { scores: [], students: new Set(), totalStudents: 0 };
        classData[key].totalStudents++;
      }

      // Ensure all class-sections created by admin are present (even if no evaluations yet)
      for (const cs of allClassSections) {
        const key = `${cs.className}-${cs.section}`;
        if (!classData[key]) classData[key] = { scores: [], students: new Set(), totalStudents: 0 };
      }

      const result = Object.entries(classData).map(([key, data]) => {
        const [cls, sec] = key.split("-");
        const avg = data.scores.length > 0 ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : 0;
        const high = data.scores.filter(s => s >= 75).length;
        const middle = data.scores.filter(s => s >= 50 && s < 75).length;
        const atRisk = data.scores.filter(s => s < 50).length;
        const participation = data.totalStudents > 0 ? Math.round((data.students.size / data.totalStudents) * 100) : 0;
        return { class: cls, section: sec, avgScore: avg, highPerformers: high, average: middle, atRisk, participation, evaluatedCount: data.students.size, totalStudents: data.totalStudents };
      }).sort((a, b) => parseInt(a.class) - parseInt(b.class));

      res.json(result);
    } catch (err) {
      console.error("[principal/class-performance]", err);
      res.status(500).json({ message: "Failed" });
    }
  });

  // Teacher effectiveness
  app.get("/api/principal/teacher-effectiveness", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "principal" && req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const allEvals = await storage.getAllEvaluations?.() || [];
      const allSheets = await storage.getAllAnswerSheets?.() || [];
      const allExams = await storage.getAllExams?.() || [];
      const allTeachers = await storage.getAllTeachers();

      const examMap = new Map(allExams.map((e: any) => [e.id, e]));
      const sheetMap = new Map(allSheets.map((s: any) => [s.id, s]));
      const teacherMap = new Map(allTeachers.map((t: any) => [t.id, t]));

      const teacherData: Record<number, { name: string; scores: number[]; examCount: number; studentSet: Set<string>; examsOverTime: string[] }> = {};

      // Include all teachers created by admin, even with no evaluations yet
      for (const t of allTeachers) {
        teacherData[t.id] = { name: t?.name || "Unknown", scores: [], examCount: 0, studentSet: new Set(), examsOverTime: [] };
      }

      for (const ev of allEvals) {
        const sheet = sheetMap.get(ev.answerSheetId);
        if (!sheet) continue;
        const exam = examMap.get(sheet.examId);
        if (!exam) continue;
        const tid = exam.teacherId;
        if (!teacherData[tid]) {
          const t = teacherMap.get(tid);
          teacherData[tid] = { name: t?.name || "Unknown", scores: [], examCount: 0, studentSet: new Set(), examsOverTime: [] };
        }
        const qs = JSON.parse(ev.questions || "[]");
        const awarded = qs.reduce((a: number, q: any) => a + (q.marks_awarded || 0), 0);
        const max = qs.reduce((a: number, q: any) => a + (q.max_marks || 0), 0);
        if (max > 0) teacherData[tid].scores.push((awarded / max) * 100);
        teacherData[tid].studentSet.add(ev.admissionNumber);
        if (exam.createdAt) teacherData[tid].examsOverTime.push(exam.createdAt);
      }

      for (const exam of allExams) {
        const tid = exam.teacherId;
        if (teacherData[tid]) teacherData[tid].examCount++;
      }

      const result = Object.entries(teacherData).map(([id, data]) => {
        const avg = data.scores.length > 0 ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : 0;
        // Variance (consistency)
        const variance = data.scores.length > 1
          ? Math.round(data.scores.reduce((a, s) => a + Math.pow(s - avg, 2), 0) / data.scores.length)
          : 0;
        const consistencyIndex = Math.max(0, 100 - variance);
        return {
          teacherId: parseInt(id), name: data.name, avgScore: avg,
          consistencyIndex, examCount: data.examCount,
          studentsEvaluated: data.studentSet.size,
          examsOverTime: data.examsOverTime.sort(),
        };
      }).sort((a, b) => b.avgScore - a.avgScore);

      res.json(result);
    } catch (err) {
      console.error("[principal/teacher-effectiveness]", err);
      res.status(500).json({ message: "Failed" });
    }
  });

  // School level insights

  // ─── PRINCIPAL EDUCATION QUALITY (aggregated across all teachers) ────────────
  app.get("/api/principal/education-quality", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "principal" && req.user?.role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    try {
      const teachers = await storage.getAllTeachers();
      const results: any[] = [];

      for (const teacher of teachers) {
        const exams = await storage.getExamsByTeacher(teacher.id);
        for (const exam of exams) {
          if (!exam.questionText) continue;

          const ncertChaps = await storage.getNcertChaptersByClassAndSubject(exam.className, exam.subject);
          const ncertContext = ncertChaps.length > 0
            ? ncertChaps.map((c: any) => `Chapter: ${c.chapterName}\nContent: ${c.chapterContent}`).join("\n\n")
            : `Standard NCERT Class ${exam.className} ${exam.subject} curriculum`;

          const categoryLabel: Record<string, string> = {
            unit_test: "Unit Test", class_test: "Class Test", homework: "Homework",
            half_yearly: "Half Yearly Exam", annual: "Annual Exam", quiz: "Quiz", assignment: "Assignment",
          };

          try {
            const prompt = `You are an expert educational quality assessor for Indian CBSE/NCERT curriculum.

Exam details:
- Name: ${exam.examName}
- Type: ${categoryLabel[exam.category] || exam.category}
- Subject: ${exam.subject}
- Class: ${exam.className}
- Total Marks: ${exam.totalMarks}
- Teacher: ${teacher.name}

Questions asked in this exam:
${exam.questionText}

NCERT curriculum reference for Class ${exam.className} ${exam.subject}:
${ncertContext}

Analyse the question paper against the NCERT curriculum depth and return ONLY valid JSON (no markdown, no explanation):
{
  "examId": ${exam.id},
  "examName": "${exam.examName.replace(/"/g, "'")}",
  "category": "${categoryLabel[exam.category] || exam.category}",
  "subject": "${exam.subject}",
  "className": "${exam.className}",
  "teacherName": "${teacher.name}",
  "totalMarks": ${exam.totalMarks},
  "overallDepthRating": "Below NCERT Level" | "At NCERT Level" | "Above NCERT Level" | "Mixed",
  "depthScore": <0-100 integer>,
  "summary": "<2-3 sentence overall assessment>",
  "questionAnalysis": [
    {
      "questionSnippet": "<first 60 chars>",
      "ncertChapter": "<matching chapter>",
      "depthLevel": "Below" | "At Level" | "Above" | "Beyond Syllabus",
      "bloomsLevel": "Remember" | "Understand" | "Apply" | "Analyse" | "Evaluate" | "Create",
      "concern": "<specific concern if any, else empty string>"
    }
  ],
  "strengths": ["strength 1"],
  "concerns": ["concern 1"],
  "recommendations": ["recommendation 1"]
}`;

            const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.ANTHROPIC_API_KEY || "",
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 2000,
                messages: [{ role: "user", content: prompt }],
              }),
            });

            const aiData: any = await aiRes.json();
            const raw = aiData.content?.[0]?.text || "{}";
            const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
            const parsed = JSON.parse(cleaned);
            results.push(parsed);
          } catch {
            results.push({
              examId: exam.id,
              examName: exam.examName,
              category: categoryLabel[exam.category] || exam.category,
              subject: exam.subject,
              className: exam.className,
              teacherName: teacher.name,
              totalMarks: exam.totalMarks,
              overallDepthRating: "At NCERT Level",
              depthScore: 50,
              summary: "AI analysis unavailable.",
              questionAnalysis: [],
              strengths: [],
              concerns: ["AI classification temporarily unavailable"],
              recommendations: [],
            });
          }
        }
      }

      res.json(results);
    } catch (err) {
      console.error("[principal/education-quality]", err);
      res.status(500).json({ message: "Failed to compute education quality" });
    }
  });

  app.get("/api/principal/school-insights", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "principal" && req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const allEvals = await storage.getAllEvaluations?.() || [];
      const allSheets = await storage.getAllAnswerSheets?.() || [];
      const allExams = await storage.getAllExams?.() || [];

      const examMap = new Map(allExams.map((e: any) => [e.id, e]));
      const sheetMap = new Map(allSheets.map((s: any) => [s.id, s]));

      // Subject strength/weakness
      const subjectData: Record<string, number[]> = {};
      // Evaluations per subject
      const evalsBySubject: Record<string, number> = {};
      const evalsByClass: Record<string, number> = {};
      // All student scores for top/bottom percentile
      const allStudentScores: Record<string, number[]> = {};

      for (const ev of allEvals) {
        const sheet = sheetMap.get(ev.answerSheetId);
        if (!sheet) continue;
        const exam = examMap.get(sheet.examId);
        if (!exam) continue;
        const qs = JSON.parse(ev.questions || "[]");
        const awarded = qs.reduce((a: number, q: any) => a + (q.marks_awarded || 0), 0);
        const max = qs.reduce((a: number, q: any) => a + (q.max_marks || 0), 0);
        const pct = max > 0 ? (awarded / max) * 100 : 0;
        if (!subjectData[exam.subject]) subjectData[exam.subject] = [];
        subjectData[exam.subject].push(pct);
        evalsBySubject[exam.subject] = (evalsBySubject[exam.subject] || 0) + 1;
        evalsByClass[exam.className] = (evalsByClass[exam.className] || 0) + 1;
        if (!allStudentScores[ev.admissionNumber]) allStudentScores[ev.admissionNumber] = [];
        allStudentScores[ev.admissionNumber].push(pct);
      }

      const subjectStrengths = Object.entries(subjectData).map(([subject, scores]) => ({
        subject,
        avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      })).sort((a, b) => b.avgScore - a.avgScore);

      // Top/bottom 10%
      const studentAvgs = Object.entries(allStudentScores).map(([admission, scores]) => ({
        admission,
        avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      })).sort((a, b) => b.avg - a.avg);
      const topN = Math.max(1, Math.ceil(studentAvgs.length * 0.1));
      const topStudents = studentAvgs.slice(0, topN);
      const bottomStudents = studentAvgs.slice(-topN);

      const overallAvg = allEvals.length > 0 ? (() => {
        let s = 0, c = 0;
        for (const ev of allEvals) {
          const qs = JSON.parse(ev.questions || "[]");
          const a = qs.reduce((x: number, q: any) => x + (q.marks_awarded || 0), 0);
          const m = qs.reduce((x: number, q: any) => x + (q.max_marks || 0), 0);
          if (m > 0) { s += (a / m) * 100; c++; }
        }
        return c > 0 ? Math.round(s / c) : 0;
      })() : 0;

      res.json({
        overallAvg,
        subjectStrengths,
        evalsBySubject,
        evalsByClass,
        topStudents: topStudents.map(s => ({ ...s, avg: Math.round(s.avg) })),
        bottomStudents: bottomStudents.map(s => ({ ...s, avg: Math.round(s.avg) })),
        totalEvaluations: allEvals.length,
      });
    } catch (err) {
      console.error("[principal/school-insights]", err);
      res.status(500).json({ message: "Failed" });
    }
  });

  // Delete with admin password confirm (generic endpoint)
  app.post("/api/admin/verify-password", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    try {
      const { password } = req.body;
      const valid = await verifyAdminPassword(req.user.id, password);
      res.json({ valid });
    } catch (err) { res.status(500).json({ message: "Failed" }); }
  });

  return httpServer;
}

/*
File Purpose:
This file registers all server API routes and keeps the runtime wiring entrypoint stable.

Responsibilities:

* Defines and attaches route handlers for auth, exams, homework, analytics, chat, profile, and governance flows
* Coordinates middleware usage and request-level validation in the route layer
* Serves as the compatibility entrypoint while modular route files are introduced

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
