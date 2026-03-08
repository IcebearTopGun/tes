export interface HomeworkSubmission {
  id: number;
  answerText?: string | null;
  aiFeedback?: string | null;
  correctnessScore?: number | null;
  totalMarks?: number | null;
  maxMarks?: number | null;
  questionAnalysis?: Array<{ question_number?: number; marks_awarded?: number; max_marks?: number; analysis?: string }> | null;
  status?: string | null;
  submittedAt?: string | null;
}

export interface StudentHomeworkItem {
  id: number;
  subject: string;
  description: string;
  dueDate: string;
  submission?: HomeworkSubmission | null;
  editable?: boolean;
  canDeleteSubmission?: boolean;
  resultsVisible?: boolean;
  analysisVisible?: boolean;
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
  questions?: Array<{
    questionNumber: number;
    marksAwarded: number;
    maxMarks: number;
    chapter?: string;
    missingPoints?: string[];
    expectedKeyPoints?: string[];
    deviationReason?: string;
    improvementSuggestion?: string;
  }>;
}

export interface EvaluationStats {
  total: number;
  avgPct: number;
  topPct: number;
  improveCount: number;
}






