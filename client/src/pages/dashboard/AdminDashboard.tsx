import "@/dashboard.css";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X, MessageSquare, TrendingUp, Send, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { fetchWithAuth } from "@/lib/fetcher";
import ProfilePanel from "@/components/ProfilePanel";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function kpiColor(score: number) {
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

const ADMIN_CHAT_QUESTIONS = [
  "Which class needs academic intervention?",
  "Who is the most effective teacher this term?",
  "Which subject shows the weakest school performance?",
  "How is homework completion trending across classes?",
  "Which students are at risk of underperformance?",
];

const BAR_COLORS = [
  { bg: "var(--lav-card)", border: "" },
  { bg: "var(--green-bg)", border: "1.5px solid rgba(42,157,110,.3)" },
  { bg: "var(--amber-bg)", border: "1.5px solid rgba(196,122,30,.3)" },
  { bg: "var(--blue-bg)", border: "1.5px solid rgba(37,99,192,.2)" },
  { bg: "#fce4ef", border: "1.5px solid rgba(212,65,126,.2)" },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState("overview");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [showAvaMenu, setShowAvaMenu] = useState(false);
  const [moreInsightsOpen, setMoreInsightsOpen] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const avaRef = useRef<HTMLDivElement>(null);

  const { data: kpis, isLoading: kpisLoading } = useQuery<any>({
    queryKey: ["/api/admin/kpis"],
    queryFn: () => fetchWithAuth("/api/admin/kpis").then(r => r.json()),
    staleTime: 60000,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<any>({
    queryKey: ["/api/admin/analytics"],
    queryFn: () => fetchWithAuth("/api/admin/analytics").then(r => r.json()),
    enabled: activeSection === "overview",
    staleTime: 60000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetchWithAuth("/api/admin/stats").then(r => r.json()),
    staleTime: 60000,
  });

  const { data: studentList, isLoading: studentsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/students"],
    queryFn: () => fetchWithAuth("/api/admin/students").then(r => r.json()),
    enabled: activeSection === "students",
    staleTime: 60000,
  });

  const { data: teacherList, isLoading: teachersLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/teachers"],
    queryFn: () => fetchWithAuth("/api/admin/teachers").then(r => r.json()),
    enabled: activeSection === "teachers",
    staleTime: 60000,
  });

  const { data: messages, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ["/api/chat/messages", activeConversationId],
    queryFn: () => fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`).then(r => r.json()),
    enabled: !!activeConversationId,
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avaRef.current && !avaRef.current.contains(e.target as Node)) setShowAvaMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const startConversation = useMutation({
    mutationFn: () => fetchWithAuth("/api/chat/conversations", { method: "POST", body: JSON.stringify({ title: "School Analysis" }) }).then(r => r.json()),
    onSuccess: (d) => { setActiveConversationId(d.id); queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] }); },
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) => fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`, { method: "POST", body: JSON.stringify({ content }) }).then(r => r.json()),
    onSuccess: () => { setChatMessage(""); refetchMessages(); },
  });

  const userName = (user as any)?.name || "Admin";
  const initials = getInitials(userName);

  // Compute chart data from analytics
  const classPerf = analytics?.classPerformance || [];
  const subjPerf = analytics?.subjectPerformance || [];
  const teacherStats = analytics?.teacherStats || [];
  const marksDistribution = analytics?.marksDistribution || [];

  // Filter charts
  const filteredClassPerf = classFilter
    ? classPerf.filter((c: any) => `${c.className}${c.section}` === classFilter || c.className === classFilter)
    : classPerf;
  const filteredSubjPerf = subjectFilter
    ? subjPerf.filter((s: any) => s.subject === subjectFilter)
    : subjPerf;

  const classOptions = [...new Set(classPerf.map((c: any) => `${c.className}${c.section}`))];
  const subjectOptions = [...new Set(subjPerf.map((s: any) => s.subject))];

  const maxBarHeight = 100;
  const classBars = filteredClassPerf.slice(0, 8).map((c: any, i: number) => ({
    label: `${c.className}${c.section}`,
    pct: c.avgPct,
    height: Math.round((c.avgPct / 100) * maxBarHeight),
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));
  const subjBars = filteredSubjPerf.map((s: any, i: number) => ({
    label: s.subject.slice(0, 4),
    pct: s.avgPct,
    height: Math.round((s.avgPct / 100) * maxBarHeight),
    color: BAR_COLORS[(i + 2) % BAR_COLORS.length],
  }));

  const totalDistCount = marksDistribution.reduce((s: number, d: any) => s + d.count, 0);
  const distParts = [
    { label: "76–100%", color: "var(--green)", pct: totalDistCount ? Math.round((marksDistribution.find((d: any) => d.range === "76–100%")?.count || 0) / totalDistCount * 100) : 25 },
    { label: "51–75%", color: "var(--amber)", pct: totalDistCount ? Math.round((marksDistribution.find((d: any) => d.range === "51–75%")?.count || 0) / totalDistCount * 100) : 35 },
    { label: "26–50%", color: "var(--lavender)", pct: totalDistCount ? Math.round((marksDistribution.find((d: any) => d.range === "26–50%")?.count || 0) / totalDistCount * 100) : 25 },
    { label: "0–25%", color: "var(--red)", pct: totalDistCount ? Math.round((marksDistribution.find((d: any) => d.range === "0–25%")?.count || 0) / totalDistCount * 100) : 15 },
  ];
  const circumference = 2 * Math.PI * 38;
  let donutOffset = 0;
  const donutSegments = distParts.map(d => {
    const dash = (d.pct / 100) * circumference;
    const seg = { ...d, dash, dashOffset: -donutOffset };
    donutOffset += dash;
    return seg;
  });

  if (kpisLoading && !kpis) {
    return (
      <div className="sf-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="sf-root">
      {/* TOP NAV — exact TeacherDashboard structure */}
      <nav className="sf-topnav">
        <div className="sf-logo">
          <div className="sf-logo-mark teacher" style={{ background: "var(--ink)" }}>A</div>
          <span className="sf-logo-name">ScholarFlow</span>
          <span className="sf-teacher-pill" style={{ background: "var(--ink)", color: "var(--white)", border: "none" }}>ADMIN</span>
        </div>

        <div className="sf-nav-tabs">
          <button className={`sf-nav-tab${activeSection === "overview" ? " on" : ""}`} onClick={() => setActiveSection("overview")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
            Overview
          </button>
          <button className={`sf-nav-tab${activeSection === "students" ? " on" : ""}`} onClick={() => setActiveSection("students")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Students
          </button>
          <button className={`sf-nav-tab${activeSection === "teachers" ? " on" : ""}`} onClick={() => setActiveSection("teachers")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            Teachers
          </button>
          <button className={`sf-nav-tab${activeSection === "profile" ? " on" : ""}`} onClick={() => setActiveSection("profile")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Profile
          </button>
        </div>

        <div className="sf-nav-right">
          <div className="sf-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "var(--dim)", flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input placeholder="Search…" />
          </div>
          <div className="sf-ic-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <button className="sf-btn-analyst" onClick={() => setIsChatOpen(true)} data-testid="button-ai-analyst">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
            AI Analyst
          </button>
          <div className="sf-ava teacher" ref={avaRef} onClick={() => setShowAvaMenu(v => !v)} data-testid="button-avatar">
            {initials}
            {showAvaMenu && (
              <div className="sf-ava-menu">
                <button className="sf-ava-menu-item" onClick={() => { setActiveSection("profile"); setShowAvaMenu(false); }}>My Profile</button>
                <button className="sf-ava-menu-item danger" onClick={() => logout()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* PAGE */}
      <div className="sf-page">
        <div className="sf-page-head">
          <div>
            <div className="sf-page-title">{getGreeting()}, {userName.split(" ")[0]}.</div>
            <div className="sf-page-sub">{new Date().toDateString()} &nbsp;·&nbsp; School-wide governance, analytics and intelligence</div>
          </div>
        </div>

        {/* 6 AI-DRIVEN KPIs — using sf-funnel with 3-col grid */}
        <div className="sf-funnel" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="sf-f-col" data-testid="kpi-health">
            <div className="sf-f-cat">School Academic Health</div>
            <div className="sf-f-num" style={{ color: kpis ? kpiColor(kpis.healthScore) : undefined }}>
              {kpis ? `${kpis.healthScore}` : "–"}
              {kpis && <span style={{ fontSize: 20, marginLeft: 4, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: kpis.healthGrade === "A" ? "var(--green-bg)" : kpis.healthGrade === "B" ? "var(--amber-bg)" : "var(--red-bg)", color: kpis.healthGrade === "A" ? "var(--green)" : kpis.healthGrade === "B" ? "var(--amber)" : "var(--red)" }}>{kpis.healthGrade}</span>}
            </div>
            <div className={`sf-f-delta ${kpis?.healthScore >= 65 ? "sf-d-up" : "sf-d-flat"}`}>
              {kpis ? (kpis.healthScore >= 65 ? `↑ Grade ${kpis.healthGrade}` : `→ Needs focus`) : "Loading"}
            </div>
            <div className="sf-f-desc">Composite of performance, engagement and teacher effectiveness.</div>
          </div>

          <div className="sf-f-col" data-testid="kpi-improvement">
            <div className="sf-f-cat">Academic Improvement</div>
            <div className="sf-f-num" style={{ color: kpis ? kpiColor(kpis.improvementIndex) : undefined }}>
              {kpis ? `${kpis.improvementIndex}%` : "–"}
            </div>
            <div className={`sf-f-delta ${kpis?.improvementIndex >= 50 ? "sf-d-up" : "sf-d-flat"}`}>
              {kpis ? `${kpis.improvementCount} of ${kpis.improvementTotal} students` : "Loading"}
            </div>
            <div className="sf-f-desc">Students whose latest exam score exceeds their first attempt.</div>
          </div>

          <div className="sf-f-col" data-testid="kpi-intervention">
            <div className="sf-f-cat">Require Intervention</div>
            <div className="sf-f-num" style={{ color: kpis?.interventionCount > 0 ? "var(--red)" : "var(--green)" }}>
              {kpis ? kpis.interventionCount : "–"}
            </div>
            <div className={`sf-f-delta ${kpis?.interventionCount === 0 ? "sf-d-up" : "sf-d-flat"}`}>
              {kpis ? (kpis.interventionCount === 0 ? "↑ All above 50%" : `→ Avg below 50%`) : "Loading"}
            </div>
            <div className="sf-f-desc">Students with overall average below 50% across all exams.</div>
          </div>

          <div className="sf-f-col" data-testid="kpi-teacher">
            <div className="sf-f-cat">Teacher Effectiveness</div>
            <div className="sf-f-num" style={{ color: kpis ? kpiColor(kpis.teacherEffectivenessScore) : undefined }}>
              {kpis ? `${kpis.teacherEffectivenessScore}` : "–"}
            </div>
            <div className={`sf-f-delta ${kpis?.teacherEffectivenessScore >= 70 ? "sf-d-up" : "sf-d-flat"}`}>
              {kpis ? (kpis.teacherEffectivenessScore >= 70 ? "↑ Consistent outcomes" : "→ Variation detected") : "Loading"}
            </div>
            <div className="sf-f-desc">Score based on consistency of class performance across teachers.</div>
          </div>

          <div className="sf-f-col" data-testid="kpi-engagement">
            <div className="sf-f-cat">Learning Engagement</div>
            <div className="sf-f-num" style={{ color: kpis ? kpiColor(kpis.engagementIndex) : undefined }}>
              {kpis ? `${kpis.engagementIndex}%` : "–"}
            </div>
            <div className={`sf-f-delta ${kpis?.engagementIndex >= 60 ? "sf-d-up" : "sf-d-flat"}`}>
              {kpis ? (kpis.engagementIndex >= 60 ? "↑ Good participation" : "→ Needs push") : "Loading"}
            </div>
            <div className="sf-f-desc">Homework submission rate across all assigned homework tasks.</div>
          </div>

          <div className="sf-f-col" data-testid="kpi-homework-eff">
            <div className="sf-f-cat">Homework Effectiveness</div>
            <div className="sf-f-num" style={{ color: kpis ? kpiColor(kpis.homeworkEffectivenessIndex) : undefined }}>
              {kpis ? (kpis.homeworkEffectivenessIndex > 0 ? `${kpis.homeworkEffectivenessIndex}%` : "–") : "–"}
            </div>
            <div className="sf-f-delta sf-d-flat">
              {kpis?.homeworkEffectivenessIndex > 0 ? "Correctness score avg" : "→ No submissions yet"}
            </div>
            <div className="sf-f-desc">Average correctness score from AI-graded homework submissions.</div>
          </div>
        </div>

        {/* SECTION TABS */}
        <div className="sf-section-tabs">
          <button className={`sf-stab${activeSection === "overview" ? " on" : ""}`} onClick={() => setActiveSection("overview")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
            Overview
          </button>
          <button className={`sf-stab${activeSection === "students" ? " on" : ""}`} onClick={() => setActiveSection("students")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            All Students
          </button>
          <button className={`sf-stab${activeSection === "teachers" ? " on" : ""}`} onClick={() => setActiveSection("teachers")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            All Teachers
          </button>
          <button className={`sf-stab${activeSection === "profile" ? " on" : ""}`} onClick={() => setActiveSection("profile")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            Profile
          </button>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeSection === "overview" && (
          <>
            <div className="sf-analytics-head">
              <div>
                <div className="sf-section-title">School Analytics</div>
                <div className="sf-section-sub">Live data across all classes, subjects and teachers</div>
              </div>
              <div className="sf-filter-row">
                <select className="sf-fsel" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
                  <option value="">All Classes</option>
                  {classOptions.map((c: any) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="sf-fsel" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
                  <option value="">All Subjects</option>
                  {subjectOptions.map((s: any) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="sf-charts-grid">
              {/* Chart 1: Class Performance */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-lav">📊</div>
                    <div>
                      <div className="sf-chart-name">Class Performance</div>
                      <div className="sf-chart-desc">Avg score % per class-section</div>
                    </div>
                  </div>
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                <div className="sf-bar-chart">
                  {analyticsLoading ? (
                    <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}><div className="sf-spinner" /></div>
                  ) : classBars.length > 0 ? classBars.map((b, i) => (
                    <div key={i} className="sf-bar-col">
                      <div className="sf-bar" style={{ height: `${b.height}px`, background: b.color.bg, border: b.color.border || undefined }} data-v={`${b.pct}%`} />
                      <div className="sf-blbl">{b.label}</div>
                    </div>
                  )) : <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No evaluation data yet</div>}
                </div>
              </div>

              {/* Chart 2: Subject Performance */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-green">📚</div>
                    <div>
                      <div className="sf-chart-name">Subject Difficulty</div>
                      <div className="sf-chart-desc">Avg score % per subject</div>
                    </div>
                  </div>
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                <div className="sf-bar-chart">
                  {analyticsLoading ? (
                    <div style={{ width: "100%", textAlign: "center", padding: "32px 0" }}><div className="sf-spinner" /></div>
                  ) : subjBars.length > 0 ? subjBars.map((b, i) => (
                    <div key={i} className="sf-bar-col">
                      <div className="sf-bar" style={{ height: `${b.height}px`, background: b.color.bg, border: b.color.border || undefined }} data-v={`${b.pct}%`} />
                      <div className="sf-blbl">{b.label}</div>
                    </div>
                  )) : <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No data yet</div>}
                </div>
              </div>

              {/* Chart 3: Teacher stats */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-amber">👨‍🏫</div>
                    <div>
                      <div className="sf-chart-name">Teacher Performance</div>
                      <div className="sf-chart-desc">Exams, evaluations, class avg</div>
                    </div>
                  </div>
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {analyticsLoading ? (
                    <div style={{ textAlign: "center", padding: "32px 0" }}><div className="sf-spinner" /></div>
                  ) : teacherStats.length === 0 ? (
                    <div style={{ textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "24px 0" }}>No data yet</div>
                  ) : teacherStats.slice(0, 5).map((t: any) => (
                    <div key={t.teacherId} className="sf-exam-item" style={{ cursor: "default" }}>
                      <div className="sf-exam-subj" style={{ background: "var(--lav-bg)" }}>{getInitials(t.teacherName)}</div>
                      <div className="sf-exam-info">
                        <div className="sf-exam-name">{t.teacherName}</div>
                        <div className="sf-exam-meta">{t.examsCreated} exams · {t.sheetsEvaluated} evaluated</div>
                      </div>
                      <span className="sf-exam-status sf-es-done" style={{ background: "none", color: kpiColor(t.avgClassPct) }}>{t.avgClassPct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart 4: Marks Distribution Donut */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-blue">🎯</div>
                    <div>
                      <div className="sf-chart-name">Marks Distribution</div>
                      <div className="sf-chart-desc">Score bands across all evaluations</div>
                    </div>
                  </div>
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                {analyticsLoading ? (
                  <div style={{ textAlign: "center", padding: "32px 0" }}><div className="sf-spinner" /></div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
                    <svg width="100" height="100" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
                      <circle cx="50" cy="50" r="38" fill="none" stroke="var(--rule)" strokeWidth="14" />
                      {totalDistCount > 0 && donutSegments.map((seg, i) => (
                        <circle key={i} cx="50" cy="50" r="38" fill="none"
                          stroke={seg.color} strokeWidth="14"
                          strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
                          strokeDashoffset={seg.dashOffset}
                          transform="rotate(-90 50 50)"
                        />
                      ))}
                      <text x="50" y="53" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)" fontFamily="DM Sans">{totalDistCount}</text>
                      <text x="50" y="63" textAnchor="middle" fontSize="8" fill="var(--mid)" fontFamily="DM Sans">evals</text>
                    </svg>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                      {distParts.map((d, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                          <span style={{ color: "var(--mid)", flex: 1 }}>{d.label}</span>
                          <span style={{ fontWeight: 700 }}>{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* MORE INSIGHTS — collapsible */}
            <div style={{ marginTop: 24 }}>
              <button
                className="sf-stab"
                style={{ display: "flex", alignItems: "center", gap: 6, width: "auto", fontSize: 14, fontWeight: 700 }}
                onClick={() => setMoreInsightsOpen(v => !v)}
                data-testid="button-more-insights"
              >
                {moreInsightsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                More Insights
              </button>

              {moreInsightsOpen && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginTop: 16 }}>
                  {/* Class Stability */}
                  <div className="sf-card">
                    <div className="sf-card-title">Class Performance Stability</div>
                    <div className="sf-card-sub">Low standard deviation = consistent outcomes</div>
                    {(kpis?.moreInsights?.classStability || []).slice(0, 6).map((c: any, i: number) => (
                      <div key={i} className="sf-exam-item" style={{ cursor: "default" }}>
                        <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", fontSize: 11 }}>C{c.className}</div>
                        <div className="sf-exam-info">
                          <div className="sf-exam-name">Class {c.className}</div>
                          <div className="sf-exam-meta">StdDev: {c.stdDev}</div>
                        </div>
                        <span className={`sf-exam-status ${c.label === "Stable" ? "sf-es-done" : c.label === "Volatile" ? "sf-es-draft" : ""}`}>{c.label}</span>
                      </div>
                    ))}
                    {!kpis?.moreInsights?.classStability?.length && <div className="sf-empty"><div className="sf-empty-icon">📈</div>No data yet</div>}
                  </div>

                  {/* Subject Difficulty */}
                  <div className="sf-card">
                    <div className="sf-card-title">Subject Difficulty</div>
                    <div className="sf-card-sub">Based on average exam performance</div>
                    {(kpis?.moreInsights?.subjectDifficulty || []).map((s: any, i: number) => (
                      <div key={i} className="sf-exam-item" style={{ cursor: "default" }}>
                        <div className="sf-exam-subj" style={{ background: "var(--amber-bg)", fontSize: 11 }}>{s.subject.slice(0, 3)}</div>
                        <div className="sf-exam-info">
                          <div className="sf-exam-name">{s.subject}</div>
                          <div className="sf-exam-meta">Avg: {s.avgPct}%</div>
                        </div>
                        <span className={`sf-exam-status ${s.trend === "Easy" ? "sf-es-done" : s.trend === "Hard" ? "sf-es-draft" : ""}`}>{s.trend}</span>
                      </div>
                    ))}
                    {!kpis?.moreInsights?.subjectDifficulty?.length && <div className="sf-empty"><div className="sf-empty-icon">📚</div>No data yet</div>}
                  </div>

                  {/* Rank Distribution */}
                  <div className="sf-card">
                    <div className="sf-card-title">Rank Distribution</div>
                    <div className="sf-card-sub">Student score bands across school</div>
                    {(kpis?.moreInsights?.rankDistribution || []).map((r: any, i: number) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                          <span style={{ color: "var(--mid)" }}>{r.band}</span>
                          <span style={{ fontWeight: 700 }}>{r.count} ({r.pct}%)</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: "var(--rule)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${r.pct}%`, background: BAR_COLORS[i].bg, borderRadius: 3, transition: "width 0.5s ease" }} />
                        </div>
                      </div>
                    ))}
                    {!kpis?.moreInsights?.rankDistribution?.some((r: any) => r.count > 0) && <div className="sf-empty"><div className="sf-empty-icon">🏆</div>No evaluation data</div>}
                  </div>

                  {/* Engagement Drop Alerts */}
                  <div className="sf-card">
                    <div className="sf-card-title">Engagement Drop Alerts</div>
                    <div className="sf-card-sub">Classes with homework submission below 50%</div>
                    {(kpis?.moreInsights?.engagementAlerts || []).length > 0 ? (
                      kpis.moreInsights.engagementAlerts.map((a: any, i: number) => (
                        <div key={i} className="sf-fitem">
                          <div className="sf-fitem-ico sf-fi-red">⚠️</div>
                          <div>
                            <div className="sf-fitem-subj">{a.className}</div>
                            <div className="sf-fitem-text">{a.completionPct}% completion — {a.alert}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="sf-empty"><div className="sf-empty-icon">✅</div>No engagement alerts — all classes are engaged.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── STUDENTS TAB ── */}
        {activeSection === "students" && (
          <div className="sf-panel">
            <div className="sf-panel-title">All Students</div>
            <div className="sf-panel-sub">Complete student directory across all classes and sections</div>
            {studentsLoading ? (
              <div style={{ textAlign: "center", padding: "32px" }}><div className="sf-spinner" /></div>
            ) : (studentList || []).length === 0 ? (
              <div className="sf-empty"><div className="sf-empty-icon">🎓</div>No students registered yet.</div>
            ) : (
              <>
                {[["9", "A"], ["9", "B"], ["10", "A"], ["10", "B"]].map(([cls, sec]) => {
                  const group = (studentList || []).filter((s: any) => s.studentClass === cls && s.section === sec);
                  if (!group.length) return null;
                  return (
                    <div key={`${cls}${sec}`} style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--rule)" }}>
                        Class {cls} — Section {sec} · {group.length} students
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                        {group.map((s: any) => (
                          <div key={s.id} className="sf-exam-item" style={{ cursor: "default", padding: "10px 14px" }} data-testid={`student-card-${s.id}`}>
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
              </>
            )}
          </div>
        )}

        {/* ── TEACHERS TAB ── */}
        {activeSection === "teachers" && (
          <div className="sf-panel">
            <div className="sf-panel-title">All Teachers</div>
            <div className="sf-panel-sub">Staff directory with subject and class assignments</div>
            {teachersLoading ? (
              <div style={{ textAlign: "center", padding: "32px" }}><div className="sf-spinner" /></div>
            ) : (teacherList || []).length === 0 ? (
              <div className="sf-empty"><div className="sf-empty-icon">👩‍🏫</div>No teachers registered yet.</div>
            ) : (teacherList || []).map((t: any) => {
              let subjects: string[] = [];
              let classes: string[] = [];
              try { subjects = JSON.parse(t.subjectsAssigned || "[]"); } catch {}
              try { classes = JSON.parse(t.classesAssigned || "[]"); } catch {}
              return (
                <div key={t.id} className="sf-exam-item" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: "14px 18px" }} data-testid={`teacher-card-${t.id}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                    <div className="sf-exam-subj" style={{ background: "var(--ink)", color: "var(--cream)", flexShrink: 0 }}>{getInitials(t.name)}</div>
                    <div className="sf-exam-info" style={{ flex: 1 }}>
                      <div className="sf-exam-name">{t.name}</div>
                      <div className="sf-exam-meta">{t.employeeId} · {t.email}</div>
                    </div>
                    {t.isClassTeacher === 1 && <span className="sf-exam-status sf-es-done" style={{ flexShrink: 0 }}>Class Teacher</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: 52 }}>
                    {subjects.map((s: string) => <span key={s} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--lav-bg)", fontWeight: 600 }}>{s}</span>)}
                    {classes.map((c: string) => <span key={c} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--cream)", border: "1px solid var(--rule)", color: "var(--mid)" }}>Class {c}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeSection === "profile" && <ProfilePanel />}
      </div>

      {/* ── AI CHAT SIDEBAR — exact TeacherDashboard structure ── */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 20 }} className="fixed right-0 top-0 h-screen w-full sm:w-[420px] bg-background border-l z-50 flex flex-col shadow-2xl">
              <div className="p-4 border-b flex items-center justify-between bg-primary text-primary-foreground shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  <div><h2 className="font-bold leading-tight">AI Performance Analyst</h2><p className="text-xs text-primary-foreground/70">School-wide intelligence</p></div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="text-primary-foreground hover:bg-white/10 rounded-xl"><X className="h-5 w-5" /></Button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {!activeConversationId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center"><TrendingUp className="h-8 w-8 text-primary" /></div>
                    <div><h3 className="font-bold text-lg">School-Wide Analysis</h3><p className="text-sm text-muted-foreground mt-2 max-w-xs">Ask any question about school performance, teacher effectiveness, or student trends.</p></div>
                    <div className="w-full space-y-2">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-left">Example questions</p>
                      {ADMIN_CHAT_QUESTIONS.map(q => (
                        <button key={q} onClick={() => { startConversation.mutate(undefined, { onSuccess: () => setTimeout(() => setChatMessage(q), 300) }); }} className="w-full text-left text-sm px-3 py-2 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/40 hover:border-primary/20 transition-all">{q}</button>
                      ))}
                    </div>
                    <Button onClick={() => startConversation.mutate()} disabled={startConversation.isPending} className="rounded-xl w-full">
                      {startConversation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />} Start New Analysis
                    </Button>
                  </div>
                ) : (
                  <>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                      {(!messages || messages.length === 0) && <div className="text-center py-8 text-muted-foreground text-sm"><MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>Ask a question to get started</p></div>}
                      {messages?.map((msg: any) => (
                        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          {msg.role === "assistant" && <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-1"><TrendingUp className="h-3 w-3 text-primary" /></div>}
                          <div className={`max-w-[82%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted rounded-tl-none"}`}>{msg.content}</div>
                        </div>
                      ))}
                      {sendMessage.isPending && <div className="flex justify-start items-center gap-2"><div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><TrendingUp className="h-3 w-3 text-primary" /></div><div className="bg-muted p-3 rounded-2xl rounded-tl-none flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Analyzing data…</span></div></div>}
                    </div>
                    <div className="p-4 border-t bg-muted/30 shrink-0">
                      <div className="flex items-center gap-2 mb-2"><Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 rounded-lg" onClick={() => setActiveConversationId(null)}><Plus className="h-3 w-3 mr-1" /> New</Button></div>
                      <form onSubmit={e => { e.preventDefault(); if (chatMessage.trim()) sendMessage.mutate(chatMessage); }} className="flex gap-2">
                        <Input placeholder="Ask about school performance…" value={chatMessage} onChange={e => setChatMessage(e.target.value)} className="rounded-xl bg-background" disabled={sendMessage.isPending} data-testid="input-chat-message" />
                        <Button type="submit" size="icon" className="rounded-xl shrink-0" disabled={sendMessage.isPending || !chatMessage.trim()} data-testid="button-send-message"><Send className="h-4 w-4" /></Button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating chat button */}
      {!isChatOpen && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="fixed bottom-6 right-6 z-40">
          <Button onClick={() => setIsChatOpen(true)} className="h-14 w-14 rounded-full shadow-2xl hover:scale-110 transition-transform" data-testid="button-float-chat">
            <MessageSquare className="h-6 w-6" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
