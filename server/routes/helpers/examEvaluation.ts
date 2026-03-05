import { similarityScore, tokenizeText } from "./textSimilarity";

export function parseModelAnswers(
  modelAnswerText: string,
  fallbackTotalMarks: number
): Array<{ qNum: number; answer: string; maxMarks: number }> {
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

export function buildLocalExamEvaluation(params: {
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
    const sim = model ? similarityScore(student, model) : Math.min(1, tokenizeText(student).length / 18);
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

/*
File Purpose:
This file contains local exam evaluation helpers used when AI evaluation is unavailable.

Responsibilities:

* Parses model answers into question-level structure
* Builds deterministic local evaluation output

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
