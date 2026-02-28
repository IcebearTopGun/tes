import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchWithAuth } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, Users, GraduationCap, Send, X, MessageSquare, TrendingUp, BarChart3, BookOpen, LogOut } from "lucide-react";
import "@/dashboard.css";

const BAR_COLORS = [
  { bg: "linear-gradient(135deg,#7c5cfc,#b18aff)", border: "none" },
  { bg: "linear-gradient(135deg,#3bc4f2,#7ef2f2)", border: "none" },
  { bg: "linear-gradient(135deg,#f7971e,#ffd200)", border: "none" },
  { bg: "linear-gradient(135deg,#f857a6,#ff5858)", border: "none" },
  { bg: "linear-gradient(135deg,#43e97b,#38f9d7)", border: "none" },
];

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function pctColor(pct: number): string {
  return pct >= 75 ? "#22c55e" : pct >= 55 ? "#f59e0b" : "#ef4444";
}

const EXAMPLE_QUESTIONS = [
  "Which class needs academic intervention?",
  "Who is the most effective teacher?",
  "Which subject shows weakest class performance?",
  "How is homework completion trending?",
  "Which students are at risk of underperformance?",
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<"overview" | "students" | "teachers">("overview");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetchWithAuth("/api/admin/stats").then(r => r.json()),
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<any>({
    queryKey: ["/api/admin/analytics"],
    queryFn: () => fetchWithAuth("/api/admin/analytics").then(r => r.json()),
    enabled: activeSection === "overview",
  });

  const { data: studentList, isLoading: studentsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/students"],
    queryFn: () => fetchWithAuth("/api/admin/students").then(r => r.json()),
    enabled: activeSection === "students",
  });

  const { data: teacherList, isLoading: teachersLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/teachers"],
    queryFn: () => fetchWithAuth("/api/admin/teachers").then(r => r.json()),
    enabled: activeSection === "teachers",
  });

  const { data: messages } = useQuery<any[]>({
    queryKey: ["/api/chat/conversations", activeConversationId, "messages"],
    queryFn: () => fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`).then(r => r.json()),
    enabled: !!activeConversationId,
    refetchInterval: activeConversationId ? 3000 : false,
  });

  const startConversation = useMutation({
    mutationFn: () => fetchWithAuth("/api/chat/conversations", { method: "POST", body: JSON.stringify({ title: "Admin Analysis" }) }).then(r => r.json()),
    onSuccess: (data: any) => { setActiveConversationId(data.id); },
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) => fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`, {
      method: "POST", body: JSON.stringify({ content }),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", activeConversationId, "messages"] });
      setChatMessage("");
      setTimeout(() => scrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" }), 100);
    },
  });

  const handleSend = () => {
    if (!chatMessage.trim()) return;
    if (!activeConversationId) {
      startConversation.mutate(undefined, { onSuccess: () => setTimeout(() => sendMessage.mutate(chatMessage), 300) });
    } else {
      sendMessage.mutate(chatMessage);
    }
  };

  const classPerf = analytics?.classPerformance || [];
  const subjPerf = analytics?.subjectPerformance || [];
  const teacherStats = analytics?.teacherStats || [];
  const maxBarHeight = 100;
  const classBars = classPerf.map((c: any, i: number) => ({
    label: `${c.className}${c.section}`,
    pct: c.avgPct,
    height: Math.round((c.avgPct / 100) * maxBarHeight),
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));
  const subjBars = subjPerf.map((s: any, i: number) => ({
    label: s.subject.slice(0, 4),
    pct: s.avgPct,
    height: Math.round((s.avgPct / 100) * maxBarHeight),
    color: BAR_COLORS[(i + 2) % BAR_COLORS.length],
  }));

  if (statsLoading && !stats) {
    return (
      <div className="sf-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="sf-root">
      {/* SIDEBAR */}
      <aside className="sf-sidebar">
        <div className="sf-sidebar-logo">
          <div className="sf-logo-icon">ES</div>
          <div>
            <div className="sf-logo-title">EduSync</div>
            <div className="sf-logo-sub">Admin Portal</div>
          </div>
        </div>

        <div className="sf-sidebar-section">Overview</div>
        <button className={`sf-nav-item${activeSection === "overview" ? " active" : ""}`} onClick={() => setActiveSection("overview")} data-testid="nav-overview">
          <LayoutDashboard size={16} /> School Overview
        </button>
        <button className={`sf-nav-item${activeSection === "students" ? " active" : ""}`} onClick={() => setActiveSection("students")} data-testid="nav-students">
          <GraduationCap size={16} /> All Students
        </button>
        <button className={`sf-nav-item${activeSection === "teachers" ? " active" : ""}`} onClick={() => setActiveSection("teachers")} data-testid="nav-teachers">
          <Users size={16} /> All Teachers
        </button>

        <div className="sf-sidebar-section" style={{ marginTop: "auto" }}>Actions</div>
        <button className="sf-nav-item" onClick={() => setIsChatOpen(true)} data-testid="button-admin-chat">
          <MessageSquare size={16} /> AI Analyst Chat
        </button>
        <button className="sf-nav-item" onClick={logout} style={{ color: "var(--err)" }} data-testid="button-logout">
          <LogOut size={16} /> Sign Out
        </button>

        <div className="sf-sidebar-user">
          <div className="sf-user-av">{getInitials(user?.name || "AD")}</div>
          <div>
            <div className="sf-user-name">{user?.name || "Principal Admin"}</div>
            <div className="sf-user-role">Administrator</div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="sf-main">
        <header className="sf-header">
          <div>
            <div className="sf-welcome">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {user?.name?.split(" ")[0] || "Admin"}.</div>
            <div className="sf-welcome-sub">{new Date().toDateString()} · School-wide governance and intelligence</div>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => setIsChatOpen(true)} data-testid="button-open-chat">
            <MessageSquare className="h-4 w-4" /> AI Analyst
          </Button>
        </header>

        {/* KPI CARDS */}
        <div className="sf-kpis">
          <div className="sf-kpi" data-testid="kpi-students">
            <div className="sf-kpi-label">TOTAL STUDENTS</div>
            <div className="sf-kpi-val">{stats?.totalStudents ?? "–"}</div>
            <div className="sf-kpi-sub" style={{ color: "var(--ink2)" }}>Across all classes</div>
          </div>
          <div className="sf-kpi" data-testid="kpi-teachers">
            <div className="sf-kpi-label">TOTAL TEACHERS</div>
            <div className="sf-kpi-val">{stats?.totalTeachers ?? "–"}</div>
            <div className="sf-kpi-sub">Active staff</div>
          </div>
          <div className="sf-kpi" data-testid="kpi-exams">
            <div className="sf-kpi-label">EXAMS CREATED</div>
            <div className="sf-kpi-val">{stats?.totalExams ?? "–"}</div>
            <div className="sf-kpi-sub">{stats?.sheetsEvaluated ?? 0} evaluated</div>
          </div>
          <div className="sf-kpi" data-testid="kpi-avg">
            <div className="sf-kpi-label">AVG PERFORMANCE</div>
            <div className="sf-kpi-val" style={{ color: stats?.avgPerformance > 0 ? pctColor(stats.avgPerformance) : undefined }}>
              {stats?.avgPerformance > 0 ? `${stats.avgPerformance}%` : "–"}
            </div>
            <div className="sf-kpi-sub">School-wide</div>
          </div>
          <div className="sf-kpi" data-testid="kpi-classes">
            <div className="sf-kpi-label">ACTIVE CLASSES</div>
            <div className="sf-kpi-val">{stats?.activeClasses ?? "–"}</div>
            <div className="sf-kpi-sub">Unique class-sections</div>
          </div>
          <div className="sf-kpi" data-testid="kpi-homework">
            <div className="sf-kpi-label">HOMEWORK</div>
            <div className="sf-kpi-val">{stats?.homeworkAssigned ?? "–"}</div>
            <div className="sf-kpi-sub">{stats?.homeworkSubmitted ?? 0} submitted</div>
          </div>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeSection === "overview" && (
          <div>
            <div className="sf-charts-row">
              {/* Class Performance Bar Chart */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div>
                    <div className="sf-chart-name"><BarChart3 size={14} style={{ display: "inline", marginRight: 4 }} />Class Performance</div>
                    <div className="sf-chart-desc">Average score % per class-section</div>
                  </div>
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                <div className="sf-bar-chart">
                  {analyticsLoading ? (
                    <div style={{ width: "100%", textAlign: "center", padding: "32px 0" }}><Spinner size="sm" /></div>
                  ) : classBars.length > 0 ? classBars.map((b: any, i: number) => (
                    <div key={i} className="sf-bar-col">
                      <div className="sf-bar" style={{ height: `${b.height}px`, background: b.color.bg }} data-v={`${b.pct}%`} />
                      <div className="sf-blbl">{b.label}</div>
                    </div>
                  )) : <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No evaluation data yet</div>}
                </div>
              </div>

              {/* Subject Performance Bar Chart */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div>
                    <div className="sf-chart-name"><BookOpen size={14} style={{ display: "inline", marginRight: 4 }} />Subject Performance</div>
                    <div className="sf-chart-desc">Average score % per subject</div>
                  </div>
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                <div className="sf-bar-chart">
                  {analyticsLoading ? (
                    <div style={{ width: "100%", textAlign: "center", padding: "32px 0" }}><Spinner size="sm" /></div>
                  ) : subjBars.length > 0 ? subjBars.map((b: any, i: number) => (
                    <div key={i} className="sf-bar-col">
                      <div className="sf-bar" style={{ height: `${b.height}px`, background: b.color.bg }} data-v={`${b.pct}%`} />
                      <div className="sf-blbl">{b.label}</div>
                    </div>
                  )) : <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No data yet</div>}
                </div>
              </div>
            </div>

            {/* Bottom Row */}
            <div className="sf-bottom-row">
              {/* Teacher Performance */}
              <div className="sf-card">
                <div className="sf-card-title">Teacher Performance</div>
                <div className="sf-card-sub">Exams created, sheets evaluated, class avg score</div>
                {analyticsLoading ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}><Spinner size="sm" /></div>
                ) : teacherStats.length === 0 ? (
                  <div className="sf-empty"><div className="sf-empty-icon">👨‍🏫</div>No teacher data yet.</div>
                ) : teacherStats.map((t: any, i: number) => (
                  <div key={t.teacherId} className="sf-exam-item" style={{ cursor: "default" }} data-testid={`teacher-row-${t.teacherId}`}>
                    <div className="sf-exam-subj" style={{ background: "var(--lav-bg)" }}>{getInitials(t.teacherName)}</div>
                    <div className="sf-exam-info">
                      <div className="sf-exam-name">{t.teacherName}</div>
                      <div className="sf-exam-meta">{t.examsCreated} exams · {t.sheetsEvaluated} evaluated</div>
                    </div>
                    <span className="sf-exam-status sf-es-done" style={{ background: "none", color: pctColor(t.avgClassPct) }}>{t.avgClassPct}% avg</span>
                  </div>
                ))}
              </div>

              {/* Marks Distribution */}
              <div className="sf-card">
                <div className="sf-card-title">Marks Distribution</div>
                <div className="sf-card-sub">Score band breakdown across all evaluations</div>
                {analyticsLoading ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}><Spinner size="sm" /></div>
                ) : analytics?.marksDistribution?.every((d: any) => d.count === 0) ? (
                  <div className="sf-empty"><div className="sf-empty-icon">📊</div>No evaluation data yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                    {(analytics?.marksDistribution || []).map((d: any, i: number) => {
                      const total = analytics.marksDistribution.reduce((s: number, x: any) => s + x.count, 0);
                      const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                      return (
                        <div key={d.range}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: "var(--mid)" }}>{d.range}</span>
                            <span style={{ fontWeight: 700 }}>{d.count} ({pct}%)</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: "var(--rule)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: BAR_COLORS[i].bg, borderRadius: 4, transition: "width 0.5s ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Homework Completion */}
              <div className="sf-card">
                <div className="sf-card-title">Homework Completion</div>
                <div className="sf-card-sub">Submission rates per class-section</div>
                {analyticsLoading ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}><Spinner size="sm" /></div>
                ) : (analytics?.homeworkStats || []).length === 0 ? (
                  <div className="sf-empty"><div className="sf-empty-icon">📝</div>No homework data yet.</div>
                ) : (analytics?.homeworkStats || []).map((hw: any, i: number) => (
                  <div key={i} className="sf-exam-item" style={{ cursor: "default" }}>
                    <div className="sf-exam-subj" style={{ background: "var(--blue-bg)", fontSize: 11 }}>{hw.className}</div>
                    <div className="sf-exam-info">
                      <div className="sf-exam-name">Class {hw.className}</div>
                      <div className="sf-exam-meta">{hw.totalAssigned} assigned · {hw.totalSubmitted} submitted</div>
                    </div>
                    <span className="sf-exam-status" style={{ color: pctColor(hw.completionPct), background: "none", fontWeight: 700 }}>{hw.completionPct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STUDENTS TAB ── */}
        {activeSection === "students" && (
          <div className="sf-panel">
            <div className="sf-panel-title">All Students</div>
            <div className="sf-panel-sub">Complete list of students across all classes and sections</div>
            {studentsLoading ? (
              <div style={{ textAlign: "center", padding: "32px" }}><Spinner /></div>
            ) : (studentList || []).length === 0 ? (
              <div className="sf-empty"><div className="sf-empty-icon">🎓</div>No students registered yet.</div>
            ) : (
              <div>
                {["9-A", "9-B", "10-A", "10-B"].map(group => {
                  const [cls, sec] = group.split("-");
                  const groupStudents = (studentList || []).filter((s: any) => s.studentClass === cls && s.section === sec);
                  if (groupStudents.length === 0) return null;
                  return (
                    <div key={group} style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid var(--rule)" }}>
                        Class {cls} — Section {sec} ({groupStudents.length} students)
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                        {groupStudents.map((s: any) => (
                          <div key={s.id} className="sf-exam-item" style={{ cursor: "default", padding: "10px 12px" }} data-testid={`student-card-${s.id}`}>
                            <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", fontSize: 11 }}>{getInitials(s.name)}</div>
                            <div className="sf-exam-info">
                              <div className="sf-exam-name" style={{ fontSize: 13 }}>{s.name}</div>
                              <div className="sf-exam-meta">{s.admissionNumber}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TEACHERS TAB ── */}
        {activeSection === "teachers" && (
          <div className="sf-panel">
            <div className="sf-panel-title">All Teachers</div>
            <div className="sf-panel-sub">Staff directory with subject and class assignments</div>
            {teachersLoading ? (
              <div style={{ textAlign: "center", padding: "32px" }}><Spinner /></div>
            ) : (teacherList || []).length === 0 ? (
              <div className="sf-empty"><div className="sf-empty-icon">👩‍🏫</div>No teachers registered yet.</div>
            ) : (
              (teacherList || []).map((t: any) => {
                const subjects = (() => { try { return JSON.parse(t.subjectsAssigned || "[]"); } catch { return []; } })();
                const classes = (() => { try { return JSON.parse(t.classesAssigned || "[]"); } catch { return []; } })();
                return (
                  <div key={t.id} className="sf-exam-item" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "14px 16px" }} data-testid={`teacher-card-${t.id}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                      <div className="sf-exam-subj" style={{ background: "var(--ink)", color: "var(--cream)", flexShrink: 0 }}>{getInitials(t.name)}</div>
                      <div className="sf-exam-info" style={{ flex: 1 }}>
                        <div className="sf-exam-name">{t.name}</div>
                        <div className="sf-exam-meta">{t.employeeId} · {t.email}</div>
                      </div>
                      {t.isClassTeacher === 1 && (
                        <span className="sf-exam-status sf-es-done" style={{ flexShrink: 0 }}>Class Teacher — {t.classTeacherOf}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: 52 }}>
                      {subjects.map((s: string) => (
                        <span key={s} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--lav-bg)", color: "var(--ink)", fontWeight: 600 }}>{s}</span>
                      ))}
                      {classes.map((c: string) => (
                        <span key={c} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--cream)", border: "1px solid var(--rule)", color: "var(--mid)" }}>Class {c}</span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* ── AI ANALYST CHAT SIDEBAR ── */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 20 }} className="fixed right-0 top-0 h-screen w-full sm:w-[420px] bg-background border-l z-50 flex flex-col shadow-2xl">
              <div className="p-4 border-b flex items-center justify-between bg-primary text-primary-foreground shrink-0">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  <div><h2 className="font-bold leading-tight">School AI Analyst</h2><p className="text-xs text-primary-foreground/70">School-wide intelligence</p></div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="text-primary-foreground hover:bg-white/10 rounded-xl"><X className="h-5 w-5" /></Button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {!activeConversationId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center"><TrendingUp className="h-8 w-8 text-primary" /></div>
                    <div><h3 className="font-bold text-lg">School-Wide Analysis</h3><p className="text-sm text-muted-foreground mt-2 max-w-xs">Ask any question about class performance, teacher effectiveness, or school trends.</p></div>
                    <div className="w-full space-y-2">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-left">Example questions</p>
                      {EXAMPLE_QUESTIONS.map(q => (
                        <button key={q} onClick={() => {
                          startConversation.mutate(undefined, { onSuccess: () => setTimeout(() => { setChatMessage(q); }, 300) });
                        }} className="w-full text-left text-sm px-3 py-2 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/40 hover:border-primary/20 transition-all">{q}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                    {(messages || []).map((msg: any) => (
                      <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {sendMessage.isPending && (
                      <div className="flex justify-start"><div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3"><div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div></div></div>
                    )}
                  </div>
                )}
              </div>
              <div className="p-4 border-t bg-card/50 shrink-0">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Ask about school performance…"
                    value={chatMessage}
                    onChange={e => setChatMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    className="flex-1 resize-none rounded-xl min-h-[44px] max-h-32 text-sm"
                    rows={1}
                    data-testid="input-chat-message"
                  />
                  <Button size="icon" onClick={handleSend} disabled={!chatMessage.trim() || sendMessage.isPending} className="rounded-xl h-11 w-11 shrink-0" data-testid="button-send-message">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
