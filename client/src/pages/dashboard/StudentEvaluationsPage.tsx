import "@/dashboard.css";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import ProfileDrawer from "@/components/ProfileDrawer";
import StudentTopNav from "@/components/student/StudentTopNav";

async function fetchWithAuth(url: string, options?: RequestInit) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "", ...(options?.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function StudentEvaluationsPage() {
  const { user } = useAuth();
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [chatByEval, setChatByEval] = useState<Record<number, { q: string; a: string; loading: boolean }>>({});

  const { data: evaluations, isLoading } = useQuery<any[]>({
    queryKey: ["/api/student/evaluations"],
    queryFn: () => fetchWithAuth("/api/student/evaluations"),
    staleTime: 30000,
  });

  const chatMutation = useMutation({
    mutationFn: ({ evaluationId, question }: { evaluationId: number; question: string }) =>
      fetchWithAuth(`/api/student/evaluations/${evaluationId}/chat`, { method: "POST", body: JSON.stringify({ question }) }),
    onSuccess: (resp, vars) => {
      setChatByEval(prev => ({ ...prev, [vars.evaluationId]: { ...(prev[vars.evaluationId] || { q: "" }), a: resp.answer || "", loading: false } }));
    },
    onError: (_e, vars) => {
      setChatByEval(prev => ({ ...prev, [vars.evaluationId]: { ...(prev[vars.evaluationId] || { q: "" }), a: "Could not get response right now.", loading: false } }));
    },
  });

  const userName = (user as any)?.name || "Student";
  const initials = getInitials(userName);

  const stats = useMemo(() => {
    const list = evaluations || [];
    const total = list.length;
    const avgPct = total > 0 ? Math.round(list.reduce((sum, e) => sum + (e.pct || 0), 0) / total) : 0;
    const topPct = total > 0 ? Math.max(...list.map(e => e.pct || 0)) : 0;
    const improveCount = list.filter(e => (e.areasOfImprovement?.length || 0) > 0).length;
    return { total, avgPct, topPct, improveCount };
  }, [evaluations]);

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

        <div className="sf-funnel sf-funnel-4">
          <div className="sf-f-col">
            <div className="sf-f-cat">Completed</div>
            <div className="sf-f-num">{stats.total}</div>
            <div className="sf-f-desc">Evaluated exams</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Average</div>
            <div className="sf-f-num">{stats.avgPct}%</div>
            <div className="sf-f-desc">Average score</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Best</div>
            <div className="sf-f-num">{stats.topPct}%</div>
            <div className="sf-f-desc">Highest score</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Needs Focus</div>
            <div className="sf-f-num">{stats.improveCount}</div>
            <div className="sf-f-desc">Evaluations with flagged areas</div>
          </div>
        </div>

        <div className="sf-panel">
          <div className="sf-panel-title">My Evaluation Reports</div>
          <div className="sf-panel-sub">Score, analysis, improvement areas, and private Q&A per evaluation</div>

          {isLoading ? (
            <div style={{ padding: "24px 0", textAlign: "center" }}><Spinner size="sm" /></div>
          ) : !evaluations || evaluations.length === 0 ? (
            <div className="sf-empty"><div className="sf-empty-icon">📝</div>No completed evaluations yet.</div>
          ) : (
            evaluations.map((ev: any) => {
              const chatState = chatByEval[ev.id] || { q: "", a: "", loading: false };
              return (
                <div key={ev.id} className="sf-exam-item" style={{ cursor: "default", alignItems: "flex-start", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 12 }}>
                    <div className="sf-exam-subj" style={{ background: "var(--blue-bg)", flexShrink: 0 }}>📘</div>
                    <div className="sf-exam-info" style={{ flex: 1 }}>
                      <div className="sf-exam-name">{ev.examName} · {ev.subject}</div>
                      <div className="sf-exam-meta">{new Date(ev.evaluatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                    </div>
                    <span className="sf-exam-status sf-es-done">{ev.totalMarks}/{ev.maxMarks} ({ev.pct}%)</span>
                  </div>

                  <div style={{ width: "100%", padding: "10px 14px", background: "var(--lav-bg)", borderRadius: 10, fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.6 }}>
                    <b>Analysis:</b> {ev.overallFeedback || "No analysis available."}
                  </div>

                  {(ev.areasOfImprovement || []).length > 0 && (
                    <div style={{ width: "100%", fontSize: 12.5, color: "var(--ink2)" }}>
                      <b>Areas of Improvement:</b> {ev.areasOfImprovement.join(", ")}
                    </div>
                  )}

                  <div style={{ width: "100%", display: "flex", gap: 8, alignItems: "center" }}>
                    <Input
                      placeholder="Ask a question about this evaluation…"
                      value={chatState.q}
                      onChange={e => setChatByEval(prev => ({ ...prev, [ev.id]: { ...chatState, q: e.target.value } }))}
                    />
                    <Button
                      size="sm"
                      disabled={!chatState.q.trim() || chatState.loading}
                      onClick={() => {
                        setChatByEval(prev => ({ ...prev, [ev.id]: { ...chatState, loading: true } }));
                        chatMutation.mutate({ evaluationId: ev.id, question: chatState.q });
                      }}
                    >
                      Ask
                    </Button>
                  </div>

                  {chatState.a && (
                    <div style={{ width: "100%", padding: "10px 14px", background: "var(--cream)", borderRadius: 10, fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.6 }}>
                      <b>AI Tutotr:</b> {chatState.a}
                    </div>
                  )}
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
