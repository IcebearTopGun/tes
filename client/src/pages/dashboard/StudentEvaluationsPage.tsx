import "@/dashboard.css";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import ProfileDrawer from "@/components/ProfileDrawer";
import StudentTopNav from "@/components/student/StudentTopNav";
import { StudentWorkspaceService } from "@/features/student/services/student-workspace.service";
import { EvaluationStats } from "@/features/student/evaluations/components/EvaluationStats";
import { useStudentEvaluationsWorkspace } from "@/features/student/evaluations/hooks/useStudentEvaluationsWorkspace";
import { PrivateEvaluationQA } from "@/features/student/shared/components/PrivateEvaluationQA";
import { getInitials } from "@/shared/utils/identity";

export default function StudentEvaluationsPage() {
  const { user } = useAuth();
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [chatByEvaluation, setChatByEvaluation] = useState<Record<number, { q: string; a: string; loading: boolean }>>({});

  const { evaluationsQuery, stats } = useStudentEvaluationsWorkspace();
  const evaluations = evaluationsQuery.data;

  const chatMutation = useMutation({
    mutationFn: ({ evaluationId, question }: { evaluationId: number; question: string }) =>
      StudentWorkspaceService.askEvaluationQuestion(evaluationId, question),
    onSuccess: (response, variables) => {
      setChatByEvaluation((previous) => ({
        ...previous,
        [variables.evaluationId]: {
          ...(previous[variables.evaluationId] || { q: "" }),
          a: response.answer || "",
          loading: false,
        },
      }));
    },
    onError: (_error, variables) => {
      setChatByEvaluation((previous) => ({
        ...previous,
        [variables.evaluationId]: {
          ...(previous[variables.evaluationId] || { q: "" }),
          a: "Could not get response right now.",
          loading: false,
        },
      }));
    },
  });

  const userName = (user as any)?.name || "Student";
  const initials = getInitials(userName);

  return (
    <div className="sf-root">
      <StudentTopNav activeTab="evaluations" initials={initials} onProfileClick={() => setIsProfilePanelOpen(true)} />

      <div className="sf-page">
        <div className="sf-page-head">
          <div>
            <div className="sf-page-title">Exam Evaluations</div>
            <div className="sf-page-sub">Your completed exam evaluations only</div>
          </div>
        </div>

        <EvaluationStats stats={stats} />

        <div className="sf-panel">
          <div className="sf-panel-title">My Evaluation Reports</div>
          <div className="sf-panel-sub">Score, analysis, improvement areas, and private Q&A per evaluation</div>

          {evaluationsQuery.isLoading ? (
            <div style={{ padding: "24px 0", textAlign: "center" }}>
              <Spinner size="sm" />
            </div>
          ) : !evaluations || evaluations.length === 0 ? (
            <div className="sf-empty">
              <div className="sf-empty-icon">📝</div>
              No completed evaluations yet.
            </div>
          ) : (
            evaluations.map((evaluation) => {
              const chatState = chatByEvaluation[evaluation.id] || { q: "", a: "", loading: false };

              return (
                <div
                  key={evaluation.id}
                  className="sf-exam-item"
                  style={{ cursor: "default", alignItems: "flex-start", flexDirection: "column", gap: 8 }}
                >
                  <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 12 }}>
                    <div className="sf-exam-subj" style={{ background: "var(--blue-bg)", flexShrink: 0 }}>
                      📘
                    </div>
                    <div className="sf-exam-info" style={{ flex: 1 }}>
                      <div className="sf-exam-name">
                        {evaluation.examName} · {evaluation.subject}
                      </div>
                      <div className="sf-exam-meta">
                        {new Date(evaluation.evaluatedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                    <span className="sf-exam-status sf-es-done">
                      {evaluation.totalMarks}/{evaluation.maxMarks} ({evaluation.pct}%)
                    </span>
                  </div>

                  <div
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "var(--lav-bg)",
                      borderRadius: 10,
                      fontSize: 12.5,
                      color: "var(--ink2)",
                      lineHeight: 1.6,
                    }}
                  >
                    <b>Analysis:</b> {evaluation.overallFeedback || "No analysis available."}
                  </div>

                  {(evaluation.questions || []).length > 0 && (
                    <div style={{ width: "100%", display: "grid", gap: 8 }}>
                      {(evaluation.questions || []).map((q) => (
                        <div key={q.questionNumber} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "9px 11px", background: "#fff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>
                            <span>Q{q.questionNumber} {q.chapter ? `� ${q.chapter}` : ""}</span>
                            <span>{q.marksAwarded}/{q.maxMarks}</span>
                          </div>
                          {(q.missingPoints || []).length > 0 && (
                            <div style={{ marginTop: 5, fontSize: 12, color: "#7c2d12" }}>
                              <b>Missing:</b> {q.missingPoints.join(", ")}
                            </div>
                          )}
                          {q.improvementSuggestion && (
                            <div style={{ marginTop: 4, fontSize: 12, color: "var(--ink2)" }}>
                              <b>Suggestion:</b> {q.improvementSuggestion}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(evaluation.areasOfImprovement || []).length > 0 && (
                    <div style={{ width: "100%", fontSize: 12.5, color: "var(--ink2)" }}>
                      <b>Areas of Improvement:</b> {evaluation.areasOfImprovement.join(", ")}
                    </div>
                  )}

                  <PrivateEvaluationQA
                    question={chatState.q}
                    answer={chatState.a}
                    loading={chatState.loading}
                    onQuestionChange={(value) => {
                      setChatByEvaluation((previous) => ({
                        ...previous,
                        [evaluation.id]: { ...chatState, q: value },
                      }));
                    }}
                    onAsk={() => {
                      setChatByEvaluation((previous) => ({
                        ...previous,
                        [evaluation.id]: { ...chatState, loading: true },
                      }));
                      chatMutation.mutate({ evaluationId: evaluation.id, question: chatState.q });
                    }}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      <ProfileDrawer open={isProfilePanelOpen} onClose={() => setIsProfilePanelOpen(false)} />
    </div>
  );
}



