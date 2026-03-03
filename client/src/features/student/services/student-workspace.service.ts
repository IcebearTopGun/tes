import { fetchJsonWithAuth } from "@/lib/fetcher";
import type { HomeworkAnalytics, StudentEvaluationItem, StudentHomeworkItem } from "../shared/types";

interface ChatResponse {
  answer: string;
}

/**
 * Student workspace API abstraction.
 * Centralizes student homework/evaluation network contracts.
 */
export class StudentWorkspaceService {
  static getHomework(): Promise<StudentHomeworkItem[]> {
    return fetchJsonWithAuth<StudentHomeworkItem[]>("/api/student/homework");
  }

  static getHomeworkAnalytics(): Promise<HomeworkAnalytics> {
    return fetchJsonWithAuth<HomeworkAnalytics>("/api/student/homework/analytics");
  }

  static submitHomework(homeworkId: number, filesBase64: string[]): Promise<unknown> {
    return fetchJsonWithAuth(`/api/student/homework/${homeworkId}/submit`, {
      method: "POST",
      body: JSON.stringify({ filesBase64 }),
    });
  }

  static askHomeworkQuestion(homeworkId: number, question: string): Promise<ChatResponse> {
    return fetchJsonWithAuth<ChatResponse>(`/api/student/homework/${homeworkId}/chat`, {
      method: "POST",
      body: JSON.stringify({ question }),
    });
  }

  static getEvaluations(): Promise<StudentEvaluationItem[]> {
    return fetchJsonWithAuth<StudentEvaluationItem[]>("/api/student/evaluations");
  }

  static askEvaluationQuestion(evaluationId: number, question: string): Promise<ChatResponse> {
    return fetchJsonWithAuth<ChatResponse>(`/api/student/evaluations/${evaluationId}/chat`, {
      method: "POST",
      body: JSON.stringify({ question }),
    });
  }
}
