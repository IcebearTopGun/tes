import "@/dashboard.css";
import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
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

export default function StudentHomeworkPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [uploadingHwId, setUploadingHwId] = useState<number | null>(null);
  const [pendingHwId, setPendingHwId] = useState<number | null>(null);
  const [chatByHw, setChatByHw] = useState<Record<number, { q: string; a: string; loading: boolean }>>({});
  const hwFileRef = useRef<HTMLInputElement>(null);

  const { data: homeworkList, isLoading: isHomeworkLoading, refetch: refetchHomework } = useQuery<any[]>({
    queryKey: ["/api/student/homework"],
    queryFn: () => fetchWithAuth("/api/student/homework"),
    staleTime: 30000,
  });

  const { data: hwAnalytics, refetch: refetchHwAnalytics } = useQuery<any>({
    queryKey: ["/api/student/homework/analytics"],
    queryFn: () => fetchWithAuth("/api/student/homework/analytics"),
    staleTime: 30000,
  });

  const submitHomework = useMutation({
    mutationFn: ({ hwId, filesBase64 }: { hwId: number; filesBase64: string[] }) =>
      fetchWithAuth(`/api/student/homework/${hwId}/submit`, { method: "POST", body: JSON.stringify({ filesBase64 }) }),
    onSuccess: () => {
      toast({ title: "Homework submitted", description: "Your answer sheets were uploaded and evaluated." });
      refetchHomework();
      refetchHwAnalytics();
    },
    onError: (err: any) => toast({ title: "Submission failed", description: err?.message || "Could not submit homework.", variant: "destructive" }),
    onSettled: () => { setUploadingHwId(null); setPendingHwId(null); },
  });

  const chatMutation = useMutation({
    mutationFn: ({ hwId, question }: { hwId: number; question: string }) =>
      fetchWithAuth(`/api/student/homework/${hwId}/chat`, { method: "POST", body: JSON.stringify({ question }) }),
    onSuccess: (resp, vars) => {
      setChatByHw(prev => ({ ...prev, [vars.hwId]: { ...(prev[vars.hwId] || { q: "" }), a: resp.answer || "", loading: false } }));
    },
    onError: (_e, vars) => {
      setChatByHw(prev => ({ ...prev, [vars.hwId]: { ...(prev[vars.hwId] || { q: "" }), a: "Could not get response right now.", loading: false } }));
    },
  });

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || pendingHwId === null) return;
    const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

    try {
      setUploadingHwId(pendingHwId);
      const filesBase64 = await Promise.all(files.map(toBase64));
      submitHomework.mutate({ hwId: pendingHwId, filesBase64 });
    } catch {
      toast({ title: "Upload failed", description: "Could not read one or more files.", variant: "destructive" });
      setUploadingHwId(null);
      setPendingHwId(null);
    } finally {
      e.target.value = "";
    }
  };

  const userName = (user as any)?.name || "Student";
  const initials = getInitials(userName);

  const sortedHomework = [...(homeworkList || [])].sort((a: any, b: any) => {
    if ((a.subject || "") !== (b.subject || "")) return String(a.subject || "").localeCompare(String(b.subject || ""));
    return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
  });

  const grouped = sortedHomework.reduce((acc: Record<string, Record<string, any[]>>, hw: any) => {
    const subject = hw.subject || "General";
    const month = new Date(hw.dueDate).toLocaleString("en-US", { month: "long", year: "numeric" });
    if (!acc[subject]) acc[subject] = {};
    if (!acc[subject][month]) acc[subject][month] = [];
    acc[subject][month].push(hw);
    return acc;
  }, {});

  return (
    <div className="sf-root">
      <StudentTopNav activeTab="homework" initials={initials} onProfileClick={() => setIsProfilePanelOpen(true)} />

      <div className="sf-page">
        <div className="sf-page-head">
          <div>
            <div className="sf-page-title">Homework</div>
            <div className="sf-page-sub">Assigned homework for your class and section</div>
          </div>
        </div>

        <input ref={hwFileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleBulkFileChange} />

        {hwAnalytics && (
          <div className="sf-funnel sf-funnel-5">
            <div className="sf-f-col">
              <div className="sf-f-cat">Assigned</div>
              <div className="sf-f-num">{hwAnalytics.totalAssigned}</div>
              <div className="sf-f-desc">Total homework assigned</div>
            </div>
            <div className="sf-f-col">
              <div className="sf-f-cat">Submitted</div>
              <div className="sf-f-num">{hwAnalytics.totalSubmitted}</div>
              <div className="sf-f-desc">Total submitted</div>
            </div>
            <div className="sf-f-col">
              <div className="sf-f-cat">Late</div>
              <div className="sf-f-num">{hwAnalytics.lateSubmissions ?? 0}</div>
              <div className="sf-f-desc">Submitted after due date</div>
            </div>
            <div className="sf-f-col">
              <div className="sf-f-cat">On-time</div>
              <div className="sf-f-num">{hwAnalytics.onTimePct}%</div>
              <div className="sf-f-desc">On-time submission rate</div>
            </div>
            <div className="sf-f-col">
              <div className="sf-f-cat">Avg Score</div>
              <div className="sf-f-num">{hwAnalytics.avgCorrectness}%</div>
              <div className="sf-f-desc">Average correctness</div>
            </div>
          </div>
        )}

        <div className="sf-panel">
          <div className="sf-panel-title">My Homework</div>
          <div className="sf-panel-sub">Grouped by subject and month, sorted by due date (latest first)</div>

          {isHomeworkLoading ? (
            <div style={{ padding: "24px 0", textAlign: "center" }}><Spinner size="sm" /></div>
          ) : !homeworkList || homeworkList.length === 0 ? (
            <div className="sf-empty"><div className="sf-empty-icon">📚</div>No homework assigned yet for your class and section.</div>
          ) : (
            Object.entries(grouped).map(([subject, months]) => (
              <div key={subject} style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{subject}</div>
                {Object.entries(months).map(([month, items]) => (
                  <div key={month} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>{month}</div>
                    {(items as any[]).map((hw: any) => {
                      const sub = hw.submission;
                      const dueDate = new Date(hw.dueDate);
                      const isDuePassed = new Date() > dueDate;
                      const isEditable = !isDuePassed;
                      const isUploading = uploadingHwId === hw.id;
                      const statusLabel = sub ? (sub.status === "needs_improvement" ? "Needs Improvement" : "Submitted") : isDuePassed ? "Pending (Overdue)" : "Pending";
                      const statusCls = sub ? (sub.status === "needs_improvement" ? "sf-es-draft" : "sf-es-done") : isDuePassed ? "sf-es-draft" : "";
                      const chatState = chatByHw[hw.id] || { q: "", a: "", loading: false };

                      return (
                        <div key={hw.id} className="sf-exam-item" style={{ cursor: "default", alignItems: "flex-start", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 12 }}>
                            <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", flexShrink: 0 }}>📝</div>
                            <div className="sf-exam-info" style={{ flex: 1 }}>
                              <div className="sf-exam-name">{hw.description}</div>
                              <div className="sf-exam-meta">Due: {dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                            </div>
                            <span className={`sf-exam-status ${statusCls}`} style={{ flexShrink: 0 }}>{statusLabel}</span>
                            {(!sub || isEditable) && (
                              <Button
                                size="sm"
                                className="rounded-xl gap-1"
                                disabled={isUploading}
                                onClick={() => { setPendingHwId(hw.id); hwFileRef.current?.click(); }}
                                data-testid={`button-submit-hw-${hw.id}`}
                              >
                                {isUploading ? <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</> : <><Upload className="h-3 w-3" /> {sub ? "Edit Submission" : "Upload Answer Sheets"}</>}
                              </Button>
                            )}
                          </div>

                          {!isEditable && sub && (
                            <div style={{ fontSize: 12, color: "var(--mid)" }}>Submission is locked because the due date has passed.</div>
                          )}

                          {sub?.aiFeedback && (
                            <div style={{ width: "100%", padding: "10px 14px", background: "var(--lav-bg)", borderRadius: 10, fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.6 }}>
                              <b>Analysis:</b> {sub.aiFeedback}
                              {sub.correctnessScore != null && <span style={{ marginLeft: 8, fontWeight: 700, color: sub.correctnessScore >= 70 ? "var(--green)" : "var(--amber)" }}>{sub.correctnessScore}%</span>}
                            </div>
                          )}

                          {sub && (
                            <div style={{ width: "100%", display: "flex", gap: 8, alignItems: "center" }}>
                              <Input
                                placeholder="Ask a question about this evaluation…"
                                value={chatState.q}
                                onChange={e => setChatByHw(prev => ({ ...prev, [hw.id]: { ...chatState, q: e.target.value } }))}
                              />
                              <Button
                                size="sm"
                                disabled={!chatState.q.trim() || chatState.loading}
                                onClick={() => {
                                  setChatByHw(prev => ({ ...prev, [hw.id]: { ...chatState, loading: true } }));
                                  chatMutation.mutate({ hwId: hw.id, question: chatState.q });
                                }}
                              >
                                Ask
                              </Button>
                            </div>
                          )}

                          {chatState.a && (
                            <div style={{ width: "100%", padding: "10px 14px", background: "var(--cream)", borderRadius: 10, fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.6 }}>
                              <b>AI Tutotr:</b> {chatState.a}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <ProfileDrawer open={isProfilePanelOpen} onClose={() => setIsProfilePanelOpen(false)} />
    </div>
  );
}
