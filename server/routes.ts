import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import OpenAI from "openai";

const JWT_SECRET = process.env.SESSION_SECRET || "super-secret-key";

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

async function seedDatabase() {
  const existingTeacher = await storage.getTeacherByEmployeeId("T001");
  if (!existingTeacher) {
    const hashedPassword = await bcrypt.hash("password123", 10);
    await storage.createTeacher({
      employeeId: "T001",
      name: "John Doe",
      email: "john.doe@school.edu",
      password: hashedPassword
    });
  }

  const existingStudent = await storage.getStudentByAdmissionNumber("S001");
  if (!existingStudent) {
    const hashedPassword = await bcrypt.hash("password123", 10);
    await storage.createStudent({
      admissionNumber: "S001",
      name: "Jane Smith",
      studentClass: "10",
      section: "A",
      password: hashedPassword
    });
  }
}

// Middleware to extract token from Header
interface AuthRequest extends Request {
  user?: { id: number; role: "teacher" | "student" };
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; role: "teacher" | "student" };
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();

  // TEACHER LOGIN
  app.post(api.auth.teacherLogin.path, async (req, res) => {
    try {
      const input = api.auth.teacherLogin.input.parse(req.body);
      const teacher = await storage.getTeacherByEmployeeId(input.employeeId);
      if (!teacher || !(await bcrypt.compare(input.password, teacher.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = jwt.sign({ id: teacher.id, role: "teacher" }, JWT_SECRET, { expiresIn: "1d" });
      const { password, ...teacherWithoutPassword } = teacher;
      res.json({ token, role: "teacher", user: teacherWithoutPassword });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // STUDENT LOGIN
  app.post(api.auth.studentLogin.path, async (req, res) => {
    try {
      const input = api.auth.studentLogin.input.parse(req.body);
      const student = await storage.getStudentByAdmissionNumber(input.admissionNumber);
      if (!student || !(await bcrypt.compare(input.password, student.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = jwt.sign({ id: student.id, role: "student" }, JWT_SECRET, { expiresIn: "1d" });
      const { password, ...studentWithoutPassword } = student;
      res.json({ token, role: "student", user: studentWithoutPassword });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // TEACHER SIGNUP
  app.post(api.auth.teacherSignup.path, async (req, res) => {
    try {
      const input = api.auth.teacherSignup.input.parse(req.body);
      const existing = await storage.getTeacherByEmployeeId(input.employeeId);
      if (existing) {
        return res.status(400).json({ message: "Employee ID already exists" });
      }
      const hashedPassword = await bcrypt.hash(input.password, 10);
      const teacher = await storage.createTeacher({ ...input, password: hashedPassword });
      const token = jwt.sign({ id: teacher.id, role: "teacher" }, JWT_SECRET, { expiresIn: "1d" });
      const { password, ...teacherWithoutPassword } = teacher;
      res.status(201).json({ token, role: "teacher", user: teacherWithoutPassword });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // STUDENT SIGNUP
  app.post(api.auth.studentSignup.path, async (req, res) => {
    try {
      const input = api.auth.studentSignup.input.parse(req.body);
      const existing = await storage.getStudentByAdmissionNumber(input.admissionNumber);
      if (existing) {
        return res.status(400).json({ message: "Admission Number already exists" });
      }
      const hashedPassword = await bcrypt.hash(input.password, 10);
      const student = await storage.createStudent({ ...input, password: hashedPassword });
      const token = jwt.sign({ id: student.id, role: "student" }, JWT_SECRET, { expiresIn: "1d" });
      const { password, ...studentWithoutPassword } = student;
      res.status(201).json({ token, role: "student", user: studentWithoutPassword });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
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
      } else {
        const student = await storage.getStudent(id);
        if (!student) return res.status(401).json({ message: "User not found" });
        const { password, ...user } = student;
        return res.json({ role, user });
      }
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // DASHBOARDS
  app.get(api.dashboard.teacherStats.path, authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json({ 
      totalStudents: 150, 
      activeClasses: 5,
      totalExams: 24,
      sheetsEvaluated: 1240,
      avgPerformance: 82,
      recentActivity: [
        { id: 1, action: "Evaluated", target: "Midterm Math", time: "2 hours ago" },
        { id: 2, action: "Created", target: "Final Science Exam", time: "5 hours ago" },
        { id: 3, action: "Graded", target: "History Essay", time: "1 day ago" }
      ]
    });
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

    res.json({
      assignments: evals.length,
      attendance: 95,
      performanceSummary,
      marksOverview,
      improvementAreas: improvementAreas.length ? improvementAreas : ["No improvement areas recorded yet."],
      feedback: feedback.length ? feedback : [{ from: "System", comment: "No evaluated exams yet.", date: new Date().toISOString().split("T")[0] }],
    });
  });

  // EXAMS
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
    if (!mimeType.startsWith("image/")) {
      console.error(`[OCR] Unsupported file type: ${mimeType}`);
      return res.status(400).json({
        message: `Unsupported file type: ${mimeType || "unknown"}. Answer sheets must be image files (JPG, PNG, WEBP). PDFs cannot be processed — please photograph or scan the sheet as an image.`
      });
    }

    console.log(`[OCR] Starting OCR for exam ${examId}, image size: ${imageBase64.length} chars, type: ${mimeType}`);

    try {
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

      const ocrData = JSON.parse(rawContent);
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

      const evalPrompt = `You are an experienced teacher evaluating a student's exam answer sheet.

=== EXAM DETAILS ===
Exam: ${exam.examName}
Subject: ${exam.subject}
Total Marks Available: ${exam.totalMarks}

=== MODEL ANSWER ===
${modelAnswerText || "(No model answer provided — evaluate based on subject knowledge)"}

${markingSchemeText ? `=== MARKING SCHEME ===\n${markingSchemeText}` : ""}

=== STUDENT DETAILS ===
Name: ${sheet.studentName}
Admission Number: ${sheet.admissionNumber}

=== STUDENT'S ANSWERS (from OCR) ===
${studentAnswers || sheet.ocrOutput}

=== INSTRUCTIONS ===
- Compare each student answer against the model answer.
- Award marks fairly: full marks for correct, partial for partially correct, 0 for blank/wrong.
- Total marks awarded must not exceed ${exam.totalMarks}.
- Provide specific improvement suggestions per question.

Return ONLY valid JSON with this exact structure:
{
  "student_name": "${sheet.studentName}",
  "admission_number": "${sheet.admissionNumber}",
  "total_marks": <number 0-${exam.totalMarks}>,
  "questions": [
    {
      "question_number": <number>,
      "marks_awarded": <number>,
      "max_marks": <number>,
      "improvement_suggestion": "<specific, actionable feedback>"
    }
  ],
  "overall_feedback": "<2-3 sentence summary of overall performance>"
}`;

      console.log("[EVAL] Calling OpenAI GPT-4o for evaluation (text-only)...");
      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: evalPrompt }],
        response_format: { type: "json_object" }
      });

      const rawEval = response.choices[0].message.content || "{}";
      console.log("[EVAL] Raw OpenAI response:", rawEval.substring(0, 300));
      const evalData = JSON.parse(rawEval);
      console.log(`[EVAL] Parsed eval — student: ${evalData.student_name}, total_marks: ${evalData.total_marks}, questions: ${evalData.questions?.length ?? 0}`);

      const evaluation = await storage.createEvaluation({
        answerSheetId,
        studentName: evalData.student_name || sheet.studentName,
        admissionNumber: evalData.admission_number || sheet.admissionNumber,
        totalMarks: evalData.total_marks ?? 0,
        questions: JSON.stringify(evalData.questions ?? []),
        overallFeedback: evalData.overall_feedback || ""
      });

      res.json(evaluation);
    } catch (err: any) {
      console.error("[EVAL] Error:", err?.message || err);
      if (err?.status) console.error("[EVAL] OpenAI status:", err.status, err?.error);
      res.status(500).json({ message: "Failed to evaluate answer sheet", detail: err?.message });
    }
  });

  // ANALYTICS
  app.get("/api/analytics", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const data = await storage.getAnalytics(req.user.id);
      res.json(data);
    } catch (err) {
      console.error("Analytics Error:", err);
      res.status(500).json({ message: "Failed to load analytics" });
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
    const msgs = await storage.getMessagesByConversation(parseInt(req.params.id));
    res.json(msgs);
  });

  app.post("/api/chat/conversations/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    
    const conversationId = parseInt(req.params.id);
    const { content } = req.body;

    try {
      // 1. Get context (RAG)
      const evals = await storage.getEvaluationsByTeacher(req.user.id);
      const context = JSON.stringify(evals.map(e => ({
        student: e.studentName,
        admission: e.admissionNumber,
        marks: e.totalMarks,
        subject: e.subject,
        exam: e.examName,
        feedback: e.overallFeedback
      })));

      // 2. Save user message
      await storage.createMessage({ conversationId, role: "user", content });

      // 3. Get AI response
      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `You are an educational data analyst. Use the following student evaluation data to answer the teacher's questions. 
            ONLY use the provided data. Do NOT hallucinate. If data is missing, say so.
            Data: ${context}` 
          },
          { role: "user", content }
        ]
      });

      const aiContent = response.choices[0].message.content || "I couldn't analyze that.";
      
      // 4. Save AI message
      const msg = await storage.createMessage({ conversationId, role: "assistant", content: aiContent });
      
      res.json(msg);
    } catch (err) {
      console.error("Chat Error:", err);
      res.status(500).json({ message: "Analysis failed" });
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
    const msgs = await storage.getMessagesByConversation(parseInt(req.params.id));
    res.json(msgs);
  });

  app.post("/api/student/chat/conversations/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });

    const conversationId = parseInt(req.params.id);
    const { content } = req.body;

    try {
      const student = await storage.getStudent(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found" });

      const evals = await storage.getEvaluationsByStudent(student.admissionNumber);
      const context = evals.length
        ? JSON.stringify(evals.map(e => ({
            subject: e.subject,
            exam: e.examName,
            score: e.totalMarks,
            maxScore: e.maxMarks,
            feedback: e.overallFeedback,
          })))
        : "No evaluation data available yet.";

      await storage.createMessage({ conversationId, role: "user", content });

      const history = await storage.getMessagesByConversation(conversationId);
      const chatHistory = history.slice(-10).map((m: any) => ({ role: m.role, content: m.content }));

      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a personal academic coach for a student. Use the student's evaluation data to give personalised, encouraging advice.
Be concise, supportive, and specific. Reference their actual scores and subjects when relevant.
Student's evaluation data: ${context}`,
          },
          ...chatHistory,
        ],
      });

      const aiContent = response.choices[0].message.content || "I couldn't process that. Please try again.";
      const msg = await storage.createMessage({ conversationId, role: "assistant", content: aiContent });
      res.json(msg);
    } catch (err) {
      console.error("Student Chat Error:", err);
      res.status(500).json({ message: "Chat failed" });
    }
  });

  return httpServer;
}
