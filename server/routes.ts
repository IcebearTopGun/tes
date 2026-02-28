import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import OpenAI from "openai";

const JWT_SECRET = process.env.SESSION_SECRET || "super-secret-key";
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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
    res.json({ 
      assignments: 3, 
      attendance: 95,
      performanceSummary: "Your performance has been consistently high this semester, with a notable strength in STEM subjects.",
      marksOverview: [
        { subject: "Mathematics", score: 92, total: 100 },
        { subject: "Science", score: 88, total: 100 },
        { subject: "History", score: 75, total: 100 }
      ],
      improvementAreas: ["Time management in exams", "Citation accuracy in essays"],
      feedback: [
        { from: "Prof. Miller", comment: "Excellent work on the calculus assignment.", date: "2026-02-15" }
      ]
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

  app.post(api.exams.processAnswerSheet.path, authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const examId = parseInt(req.params.id);
    const { imageBase64 } = req.body;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Extract student information and answers from this handwritten answer sheet. Return ONLY valid JSON with fields: admission_number, student_name, and answers (an array of {question_number: number, answer_text: string})." },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" }
      });

      const ocrData = JSON.parse(response.choices[0].message.content || "{}");
      
      // Attempt to map to student
      const student = await storage.getStudentByAdmissionNumber(ocrData.admission_number);
      
      const sheet = await storage.createAnswerSheet({
        examId,
        studentId: student?.id || null,
        admissionNumber: ocrData.admission_number,
        studentName: ocrData.student_name,
        ocrOutput: JSON.stringify(ocrData),
        status: "processed"
      });

      res.json({
        id: sheet.id,
        ...ocrData
      });
    } catch (err) {
      console.error("OCR Error:", err);
      res.status(500).json({ message: "Failed to process answer sheet" });
    }
  });

  app.post(api.exams.evaluate.path, authMiddleware, async (req: AuthRequest, res) => {
    if (req.user?.role !== "teacher") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const answerSheetId = parseInt(req.params.id);
    try {
      const sheet = await storage.getAnswerSheet(answerSheetId);
      if (!sheet) {
        return res.status(404).json({ message: "Answer sheet not found" });
      }

      const exam = await storage.getExam(sheet.examId);
      if (!exam) {
        return res.status(404).json({ message: "Exam not found" });
      }

      const prompt = `
        Evaluate this student's answer sheet based on the teacher's model answers and marking scheme.
        
        Exam Details:
        Subject: \${exam.subject}
        Total Marks: \${exam.totalMarks}
        Model Answer URL: \${exam.modelAnswerUrl || 'Not provided'}
        Marking Scheme URL: \${exam.markingSchemeUrl || 'Not provided'}

        Student Answer Sheet (OCR output):
        \${sheet.ocrOutput}

        Return ONLY valid JSON with the following structure:
        {
          "student_name": "string",
          "admission_number": "string",
          "total_marks": number,
          "questions": [
            {
              "question_number": number,
              "marks_awarded": number,
              "max_marks": number,
              "improvement_suggestion": "string"
            }
          ],
          "overall_feedback": "string"
        }
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const evalData = JSON.parse(response.choices[0].message.content || "{}");
      
      const evaluation = await storage.createEvaluation({
        answerSheetId,
        studentName: evalData.student_name,
        admissionNumber: evalData.admission_number,
        totalMarks: evalData.total_marks,
        questions: JSON.stringify(evalData.questions),
        overallFeedback: evalData.overall_feedback
      });

      res.json(evaluation);
    } catch (err) {
      console.error("Evaluation Error:", err);
      res.status(500).json({ message: "Failed to evaluate answer sheet" });
    }
  });

  return httpServer;
}
