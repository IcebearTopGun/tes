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
  const hashedPassword = await bcrypt.hash("password123", 10);

  // Ensure teacher exists
  let teacher = await storage.getTeacherByEmployeeId("T001");
  if (!teacher) {
    teacher = await storage.createTeacher({
      employeeId: "T001",
      name: "Ramesh Sharma",
      email: "ramesh.sharma@school.edu",
      password: hashedPassword,
    });
  }

  // Seed students (skip if already exists)
  const seedStudents = [
    { admissionNumber: "S001", name: "Jane Smith", studentClass: "10", section: "A" },
    { admissionNumber: "S002", name: "Arjun Mehta", studentClass: "10", section: "A" },
    { admissionNumber: "S003", name: "Priya Rao", studentClass: "10", section: "A" },
    { admissionNumber: "S004", name: "Rahul Kumar", studentClass: "10", section: "A" },
    { admissionNumber: "S005", name: "Ananya Patel", studentClass: "10", section: "B" },
    { admissionNumber: "S006", name: "Kavya Reddy", studentClass: "10", section: "B" },
    { admissionNumber: "S007", name: "Siddharth Nair", studentClass: "10", section: "B" },
    { admissionNumber: "S008", name: "Rohan Gupta", studentClass: "11", section: "A" },
    { admissionNumber: "S009", name: "Deepa Singh", studentClass: "11", section: "A" },
    { admissionNumber: "S010", name: "Karthik Reddy", studentClass: "11", section: "A" },
  ];
  for (const s of seedStudents) {
    const existing = await storage.getStudentByAdmissionNumber(s.admissionNumber);
    if (!existing) {
      await storage.createStudent({ ...s, password: hashedPassword });
    }
  }

  // Seed exams + evaluations only if teacher has none
  const existingExams = await storage.getExamsByTeacher(teacher.id);
  if (existingExams.length === 0) {
    const mathExam = await storage.createExam({
      teacherId: teacher.id,
      subject: "Mathematics",
      className: "10",
      examName: "Mathematics Unit Test — Class 10",
      category: "unit_test",
      totalMarks: 50,
      questionText: "Q1 (5 marks): Solve: 2x + 3 = 7.\nQ2 (10 marks): Find the area of a circle with radius 7 cm.\nQ3 (10 marks): Factorize: x² + 5x + 6.\nQ4 (15 marks): Solve the quadratic equation: x² – 5x + 6 = 0.\nQ5 (10 marks): Simplify: (a + b)² – (a – b)².",
      modelAnswerText: "Q1: x = 2.\nQ2: Area = 154 cm².\nQ3: (x + 2)(x + 3).\nQ4: x = 2 or x = 3.\nQ5: 4ab.",
    });

    const scienceExam = await storage.createExam({
      teacherId: teacher.id,
      subject: "Science",
      className: "10",
      examName: "Science Mid Term — Class 10",
      category: "mid_term",
      totalMarks: 100,
      questionText: "Q1 (10 marks): Define photosynthesis and write its equation.\nQ2 (20 marks): Explain Newton's three laws of motion with examples.\nQ3 (15 marks): What is the periodic table? How are elements arranged?\nQ4 (25 marks): Describe the water cycle with a labelled diagram.\nQ5 (30 marks): Distinguish between acids and bases. Give 5 examples each.",
      modelAnswerText: "Q1: Process by which plants make food using sunlight, CO₂ and water. Equation: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂.\nQ2: Law 1 – Inertia; Law 2 – F = ma; Law 3 – Every action has an equal and opposite reaction.\nQ3: Arrangement of elements by increasing atomic number in periods and groups.\nQ4: Evaporation → Condensation → Precipitation → Collection.\nQ5: Acids: HCl, H₂SO₄, HNO₃, CH₃COOH, H₃PO₄. Bases: NaOH, KOH, Ca(OH)₂, NH₃, Mg(OH)₂.",
    });

    const englishExam = await storage.createExam({
      teacherId: teacher.id,
      subject: "English",
      className: "11",
      examName: "English Class Test — Class 11",
      category: "class_test",
      totalMarks: 25,
      questionText: "Q1 (10 marks): Write a descriptive paragraph on the importance of nature.\nQ2 (10 marks): Fill in the blanks with correct verb forms.\nQ3 (5 marks): Identify parts of speech in the given sentences.",
      modelAnswerText: "Q1: Nature is the foundation of all life. A well-written paragraph touching on ecosystem, biodiversity, sustainability, and human wellbeing expected.\nQ2: am, is, are, was, were, has, have, had, will, would.\nQ3: Noun, pronoun, verb, adjective, adverb, preposition, conjunction, interjection.",
    });

    // Seed evaluations via answer sheets
    const evalSeeds = [
      { exam: mathExam, admissionNumber: "S001", name: "Jane Smith", marks: 38 },
      { exam: mathExam, admissionNumber: "S002", name: "Arjun Mehta", marks: 45 },
      { exam: mathExam, admissionNumber: "S003", name: "Priya Rao", marks: 41 },
      { exam: mathExam, admissionNumber: "S004", name: "Rahul Kumar", marks: 30 },
      { exam: mathExam, admissionNumber: "S005", name: "Ananya Patel", marks: 35 },
      { exam: scienceExam, admissionNumber: "S001", name: "Jane Smith", marks: 78 },
      { exam: scienceExam, admissionNumber: "S002", name: "Arjun Mehta", marks: 88 },
      { exam: scienceExam, admissionNumber: "S003", name: "Priya Rao", marks: 92 },
      { exam: scienceExam, admissionNumber: "S004", name: "Rahul Kumar", marks: 65 },
      { exam: scienceExam, admissionNumber: "S005", name: "Ananya Patel", marks: 72 },
      { exam: scienceExam, admissionNumber: "S006", name: "Kavya Reddy", marks: 58 },
      { exam: englishExam, admissionNumber: "S008", name: "Rohan Gupta", marks: 18 },
      { exam: englishExam, admissionNumber: "S009", name: "Deepa Singh", marks: 22 },
      { exam: englishExam, admissionNumber: "S010", name: "Karthik Reddy", marks: 15 },
    ];

    for (const d of evalSeeds) {
      const sheet = await storage.createAnswerSheet({
        examId: d.exam.id,
        studentId: null,
        admissionNumber: d.admissionNumber,
        studentName: d.name,
        ocrOutput: JSON.stringify({ admission_number: d.admissionNumber, student_name: d.name, answers: [] }),
        status: "evaluated",
      });
      await storage.createEvaluation({
        answerSheetId: sheet.id,
        studentName: d.name,
        admissionNumber: d.admissionNumber,
        totalMarks: d.marks,
        questions: JSON.stringify([
          { question_number: 1, chapter: "General", marks_awarded: Math.round(d.marks * 0.4), max_marks: Math.round(d.exam.totalMarks * 0.4), deviation_reason: "Satisfactory answer", improvement_suggestion: "Review key concepts" },
          { question_number: 2, chapter: "General", marks_awarded: Math.round(d.marks * 0.3), max_marks: Math.round(d.exam.totalMarks * 0.3), deviation_reason: "Partially correct", improvement_suggestion: "Practice more examples" },
          { question_number: 3, chapter: "General", marks_awarded: Math.round(d.marks * 0.3), max_marks: Math.round(d.exam.totalMarks * 0.3), deviation_reason: "Good understanding", improvement_suggestion: "Work on depth of explanation" },
        ]),
        overallFeedback: `Good effort. Scored ${d.marks}/${d.exam.totalMarks} marks. Keep practising to improve further.`,
      });
    }

    // Seed homework
    const today = new Date();
    const in7 = new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0];
    const in3 = new Date(today.getTime() + 3 * 86400000).toISOString().split("T")[0];
    const yesterday = new Date(today.getTime() - 86400000).toISOString().split("T")[0];

    await storage.createHomework({ teacherId: teacher.id, subject: "Mathematics", className: "10", section: "A", description: "Solve exercises 1–20 from Chapter 4: Quadratic Equations. Show all working steps.", modelSolutionText: "Detailed solutions using factorisation, completing the square, and the quadratic formula.", dueDate: in7 });
    await storage.createHomework({ teacherId: teacher.id, subject: "Science", className: "10", section: "A", description: "Prepare a labelled diagram of the human digestive system and describe the function of each organ.", modelSolutionText: "Diagram should include: mouth, oesophagus, stomach, small intestine, large intestine, rectum, liver, pancreas, and gallbladder with correct labels and functions.", dueDate: in3 });
    await storage.createHomework({ teacherId: teacher.id, subject: "Mathematics", className: "10", section: "B", description: "Practice problems on linear equations — worksheet attached. Attempt all 15 questions.", modelSolutionText: "Solutions to all 15 linear equation problems from the worksheet.", dueDate: yesterday });
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

      // Fetch NCERT context for this exam's class + subject
      const ncertChaptersData = await storage.getNcertChaptersByClassAndSubject(exam.className, exam.subject);
      const ncertContext = ncertChaptersData.length > 0
        ? ncertChaptersData.map(ch => `Chapter: ${ch.chapterName}\n${ch.chapterContent}`).join("\n\n---\n\n")
        : "";

      const evalPrompt = `You are an experienced teacher evaluating a student's exam answer sheet.

=== EXAM DETAILS ===
Exam: ${exam.examName}
Subject: ${exam.subject}
Class: ${exam.className}
Total Marks Available: ${exam.totalMarks}

=== MODEL ANSWER ===
${modelAnswerText || "(No model answer provided — evaluate based on subject knowledge)"}

${markingSchemeText ? `=== MARKING SCHEME ===\n${markingSchemeText}` : ""}

${ncertContext ? `=== NCERT REFERENCE CHAPTERS ===\n${ncertContext}\n\nMap each question to the most relevant NCERT chapter above.` : ""}

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

  // ANALYTICS — supports ?class=X&subject=Y filters
  app.get("/api/analytics", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const classFilter = req.query.class as string | undefined;
      const subjectFilter = req.query.subject as string | undefined;
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
      const classes = [...new Set(teacherExams.map(e => e.className))].sort();
      const subjects = [...new Set(teacherExams.map(e => e.subject))].sort();
      res.json({ classes, subjects });
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
    const msgs = await storage.getMessagesByConversation(parseInt(req.params.id));
    res.json(msgs);
  });

  app.post("/api/chat/conversations/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    
    const conversationId = parseInt(req.params.id);
    const { content } = req.body;

    try {
      // 1. Get context (RAG) — exams + homework analytics
      const evals = await storage.getEvaluationsByTeacher(req.user.id);
      const evalContext = JSON.stringify(evals.map(e => ({
        student: e.studentName,
        admission: e.admissionNumber,
        marks: e.totalMarks,
        subject: e.subject,
        exam: e.examName,
        feedback: e.overallFeedback
      })));

      const hwSubmissions = await storage.getHomeworkSubmissionsByTeacher(req.user.id);
      const hwContext = hwSubmissions.length > 0
        ? JSON.stringify(hwSubmissions.map(s => ({
            student: s.admissionNumber,
            subject: s.subject,
            homework: s.description,
            status: s.status,
            correctness: s.correctnessScore,
            onTime: s.isOnTime === 1,
            submittedAt: s.submittedAt,
            dueDate: s.dueDate,
          })))
        : "No homework submission data yet.";

      // 2. Save user message
      await storage.createMessage({ conversationId, role: "user", content });

      // 3. Get AI response
      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `You are an educational data analyst. Use the following student evaluation data and homework analytics to answer the teacher's questions. 
            ONLY use the provided data. Do NOT hallucinate. If data is missing, say so.
            
            EXAM EVALUATION DATA: ${evalContext}
            
            HOMEWORK ANALYTICS DATA: ${hwContext}` 
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
                  text: "Extract student information from this handwritten answer sheet page. Return ONLY valid JSON with fields: admission_number (string), student_name (string), sheet_number (integer, the page/sheet number written on the paper — default 1 if not visible), and answers (array of {question_number: number, answer_text: string}). If you cannot read the admission number or name, use 'UNKNOWN'."
                },
                { type: "image_url", image_url: { url: imageBase64 } },
              ],
            }],
            response_format: { type: "json_object" },
          });

          const ocrData = JSON.parse(response.choices[0].message.content || "{}");
          const page = await storage.createAnswerSheetPage({
            examId,
            admissionNumber: ocrData.admission_number || "UNKNOWN",
            studentName: ocrData.student_name || "UNKNOWN",
            sheetNumber: ocrData.sheet_number || (idx + 1),
            imageBase64,
            ocrOutput: JSON.stringify(ocrData),
            status: "processed",
          });
          console.log(`[BULK] Page ${idx + 1} OCR done — student: ${ocrData.student_name}, admission: ${ocrData.admission_number}`);
          return { page, ocrData };
        } catch (err: any) {
          console.error(`[BULK] OCR failed for page ${idx + 1}:`, err?.message);
          return { error: `Page ${idx + 1} OCR failed`, index: idx };
        }
      }));

      // 2. Group successful pages by admission_number
      const groups = new Map<string, { studentName: string; pages: { page: any; ocrData: any }[] }>();
      for (const result of pageResults) {
        if ((result as any).error) continue;
        const { page, ocrData } = result as any;
        const admNo = page.admissionNumber;
        if (!groups.has(admNo)) {
          groups.set(admNo, { studentName: page.studentName, pages: [] });
        }
        groups.get(admNo)!.pages.push({ page, ocrData });
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

        const script = await storage.createMergedAnswerScript({
          examId,
          admissionNumber: admNo,
          studentName: group.studentName,
          mergedAnswers: JSON.stringify(mergedAnswers),
          pageIds: JSON.stringify(pageIds),
          status: "pending",
        });
        mergedScripts.push(script);
        console.log(`[BULK] Merged script created for ${admNo} (${pageIds.length} pages, ${mergedAnswers.length} answers)`);
      }

      const errors = pageResults.filter((r: any) => r.error).map((r: any) => r.error);
      res.json({
        pagesProcessed: pageResults.length - errors.length,
        errors,
        mergedScripts,
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

${ncertContext ? `=== NCERT REFERENCE CHAPTERS ===\n${ncertContext}\n\nMap each question to the most relevant NCERT chapter above.` : ""}

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
        return { ...hw, submission: sub || null };
      }));
      res.json(withStatus);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load homework", detail: err?.message });
    }
  });

  // Student: submit homework (upload image/pdf, run OCR, AI evaluate)
  app.post("/api/student/homework/:id/submit", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "student") return res.status(401).json({ message: "Unauthorized" });
    const homeworkId = parseInt(req.params.id);
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ message: "fileBase64 is required" });

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

      // OCR extraction
      let ocrText = "";
      try {
        ocrText = await extractDocumentText(fileBase64, "homework submission");
      } catch (ocrErr) {
        console.warn("[HW SUBMIT] OCR failed:", ocrErr);
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
          status = "completed";
        }
      } else if (ocrText) {
        status = "completed";
        correctnessScore = 70;
        aiFeedback = "Submission received. No model solution available for detailed evaluation.";
      }

      let submission;
      if (existing) {
        submission = await storage.updateHomeworkSubmission(existing.id, {
          fileBase64,
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
          fileBase64,
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
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load homework analytics" });
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
      const evalContext = evals.length
        ? JSON.stringify(evals.map(e => ({
            subject: e.subject,
            exam: e.examName,
            score: e.totalMarks,
            maxScore: e.maxMarks,
            feedback: e.overallFeedback,
          })))
        : "No evaluation data available yet.";

      // Include homework analytics in AI context
      const hwSubmissions = await storage.getHomeworkSubmissionsByStudent(req.user.id);
      const hwContext = hwSubmissions.length > 0
        ? JSON.stringify(hwSubmissions.map(s => ({
            subject: s.subject,
            homework: s.description,
            status: s.status,
            correctness: s.correctnessScore,
            onTime: s.isOnTime === 1,
            submittedAt: s.submittedAt,
          })))
        : "No homework submissions yet.";

      await storage.createMessage({ conversationId, role: "user", content });

      const history = await storage.getMessagesByConversation(conversationId);
      const chatHistory = history.slice(-10).map((m: any) => ({ role: m.role, content: m.content }));

      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a personal academic coach for a student. Use the student's evaluation data and homework submission history to give personalised, encouraging advice.
Be concise, supportive, and specific. Reference their actual scores, subjects, and homework patterns when relevant.
Student's evaluation data: ${evalContext}
Student's homework history: ${hwContext}`,
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
      const { subject, studentClass, section, description, modelSolution, dueDate } = req.body;
      const hw = await storage.createHomework({
        teacherId: req.user.id,
        subject,
        className: studentClass || req.body.className || "",
        section: section || "",
        description,
        modelSolutionText: modelSolution || req.body.modelSolutionText || null,
        dueDate,
      });
      res.status(201).json(hw);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to create homework", detail: err?.message });
    }
  });

  // ─── TEACHER OPTIONS (subjects, classes, sections for dropdowns) ───────────

  app.get("/api/teacher/options", authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") return res.status(401).json({ message: "Unauthorized" });
    try {
      const teacherExams = await storage.getExamsByTeacher(req.user.id);
      const teacherHw = await storage.getHomeworkByTeacher(req.user.id);

      const subjectsFromExams = teacherExams.map(e => e.subject);
      const subjectsFromHw = teacherHw.map(h => h.subject);
      const classesFromExams = teacherExams.map(e => e.className);
      const classesFromHw = teacherHw.map(h => h.className);

      const allSubjects = [...new Set([...subjectsFromExams, ...subjectsFromHw])].sort();
      const allClasses = [...new Set([...classesFromExams, ...classesFromHw])].sort();

      const DEFAULT_SUBJECTS = ["Mathematics", "Science", "English", "Social Studies", "Hindi", "Physics", "Chemistry", "Biology", "History", "Geography"];
      const DEFAULT_CLASSES = ["8", "9", "10", "11", "12"];
      const SECTIONS = ["A", "B", "C", "D"];

      res.json({
        subjects: allSubjects.length > 0 ? allSubjects : DEFAULT_SUBJECTS,
        classes: allClasses.length > 0 ? allClasses : DEFAULT_CLASSES,
        sections: SECTIONS,
      });
    } catch (err) {
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

  return httpServer;
}
