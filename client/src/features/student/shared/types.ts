export interface HomeworkSubmission {
  id: number;
  answerText?: string | null;
  aiFeedback?: string | null;
  correctnessScore?: number | null;
  status?: string | null;
  submittedAt?: string | null;
}

export interface StudentHomeworkItem {
  id: number;
  subject: string;
  description: string;
  dueDate: string;
  submission?: HomeworkSubmission | null;
}

export interface HomeworkAnalytics {
  totalAssigned: number;
  totalSubmitted: number;
  lateSubmissions: number;
  onTimePct: number;
  avgCorrectness: number;
}

export interface StudentEvaluationItem {
  id: number;
  examName: string;
  subject: string;
  evaluatedAt: string;
  totalMarks: number;
  maxMarks: number;
  pct: number;
  overallFeedback?: string | null;
  areasOfImprovement: string[];
}

export interface EvaluationStats {
  total: number;
  avgPct: number;
  topPct: number;
  improveCount: number;
}
