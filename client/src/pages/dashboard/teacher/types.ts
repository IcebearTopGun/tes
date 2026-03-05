export interface StructuredSubject {
  name: string;
  code: string;
  className: string;
  section: string;
}

export interface ClassSection {
  className: string;
  section: string;
}

export interface OcrResult {
  sheetId: number;
  examId: number;
  admissionNumber: string;
  studentName: string;
  answers: Array<{ question_number: number; answer_text: string }>;
}

export interface AnalyticsData {
  classAverages: { subject: string; avgMarks: number; totalMarks: number; examCount: number }[];
  studentPerformance: { studentName: string; totalMarks: number; maxMarks: number; examName: string; subject: string; pct: number }[];
  marksDistribution: { range: string; count: number }[];
  improvementTrends: { examName: string; subject: string; avgMarks: number; maxMarks: number; avgPct: number }[];
  chapterWeakness: { chapter: string; subject: string; avgScore: number; totalQuestions: number; studentsAffected: number }[];
}

export type ScriptEntry = {
  admissionNumber: string;
  studentName: string;
  pages: number;
  status: pending | evaluating | done | error;
  scriptId?: number;
  marks?: string;
  maxMarks?: number;
};

/*
File Purpose:
This file declares shared TypeScript types used across the teacher dashboard modules.

Responsibilities:

* Defines local data shapes for analytics, OCR results, and UI state
* Provides typed contracts for component props and hooks

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
