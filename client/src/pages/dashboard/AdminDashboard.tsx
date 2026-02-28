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
import ProfileDrawer from "@/components/ProfileDrawer";

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
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [showAvaMenu, setShowAvaMenu] = useState(false);
  const [expandedEWStudent, setExpandedEWStudent] = useState<string | null>(null);
  const [expandedQQItem, setExpandedQQItem] = useState<number | null>(null);
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

  const { data: adminEW, isLoading: adminEWLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/early-warning"],
    queryFn: () => fetchWithAuth("/api/admin/early-warning").then(r => r.json()),
    enabled: activeSection === "early-warning",
    staleTime: 60000,
  });

  const { data: adminQQ, isLoading: adminQQLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/question-quality"],
    queryFn: () => fetchWithAuth("/api/admin/question-quality").then(r => r.json()),
    enabled: activeSection === "question-quality",
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
          <button className={`sf-nav-tab${activeSection === "early-warning" ? " on" : ""}`} onClick={() => setActiveSection("early-warning")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Early Warning
          </button>
          <button className={`sf-nav-tab${activeSection === "question-quality" ? " on" : ""}`} onClick={() => setActiveSection("question-quality")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Question Quality
          </button>
          <button className="sf-nav-tab" onClick={() => setIsProfilePanelOpen(true)}>
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
                <button className="sf-ava-menu-item" onClick={() => { setIsProfilePanelOpen(true); setShowAvaMenu(false); }}>My Profile</button>
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
          <button className="sf-stab" onClick={() => setIsProfilePanelOpen(true)}>
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

        {/* ── EARLY WARNING TAB ── */}
        {activeSection === "early-warning" && (
          <div className="sf-panel">
            <div className="sf-panel-title">Early Warning System — School-Wide</div>
            <div className="sf-panel-sub">Bottom 2 at-risk students per class — click any student to view a full risk explanation</div>
            {adminEWLoading ? (
              <div style={{ textAlign: "center", padding: "32px" }}><div className="sf-spinner" /></div>
            ) : !adminEW || adminEW.length === 0 ? (
              <div className="sf-empty"><div className="sf-empty-icon">🟢</div>No at-risk students identified across the school. Evaluate more answer sheets to activate this system.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {adminEW.map((group: any) => (
                  <div key={group.class}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Class {group.class}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {group.students.map((w: any) => {
                        const ewKey = `${group.class}_${w.admissionNumber}`;
                        const isExpanded = expandedEWStudent === ewKey;
                        const riskColor = w.riskLevel === "HIGH" ? "#d94f4f" : w.riskLevel === "MEDIUM" ? "#d08a2b" : "#3a8a5c";
                        const riskBg = w.riskLevel === "HIGH" ? "#fff0f0" : w.riskLevel === "MEDIUM" ? "#fff8ed" : "#f0faf4";
                        const riskIcon = w.riskLevel === "HIGH" ? "🔴" : w.riskLevel === "MEDIUM" ? "🟡" : "🟢";
                        return (
                          <div key={w.admissionNumber} data-testid={`admin-ew-student-${w.admissionNumber}`} style={{ borderRadius: 13, border: `1.5px solid ${riskColor}22`, overflow: "hidden", background: riskBg }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}
                              onClick={() => setExpandedEWStudent(isExpanded ? null : ewKey)}>
                              <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${riskColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: riskColor, flexShrink: 0 }}>
                                {w.studentName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{w.studentName}</div>
                                <div style={{ fontSize: 12, color: "var(--mid)", marginTop: 2 }}>Score: {w.earlierAvgPct}% → {w.recentAvgPct}% &nbsp;·&nbsp; HW: {w.hwSubmitted}/{w.hwTotal}</div>
                                {(w.weakSubjects || []).length > 0 && (
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                                    {(w.weakSubjects || []).map((s: string) => (
                                      <span key={s} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: "#f0e0e0", color: "#b03030" }}>{s}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div style={{ textAlign: "right", flexShrink: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: riskColor }}>{riskIcon} {w.riskLevel}</div>
                                <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>Risk: {w.riskScore}</div>
                                <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>{isExpanded ? "▲ collapse" : "▼ explain"}</div>
                              </div>
                            </div>
                            {isExpanded && (
                              <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${riskColor}22` }}>
                                <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(0,0,0,0.04)", borderRadius: 10, fontSize: 13, color: "var(--ink)", lineHeight: 1.6 }}>
                                  <b>Why at risk:</b> {w.riskReason || "Low homework engagement and consistently below-average performance."}
                                </div>
                                {(w.subjectBreakdown || []).length > 0 && (
                                  <div style={{ marginTop: 14 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Subject-Wise Marks</div>
                                    {(w.subjectBreakdown || []).map((sb: any) => (
                                      <div key={sb.subject} style={{ marginBottom: 8 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                                          <span style={{ color: "var(--ink)", fontWeight: 500 }}>{sb.subject}</span>
                                          <span style={{ color: sb.avgPct < 50 ? "#d94f4f" : sb.avgPct < 65 ? "#d08a2b" : "#3a8a5c", fontWeight: 600 }}>{sb.avgPct}%</span>
                                        </div>
                                        <div style={{ height: 5, borderRadius: 3, background: "rgba(0,0,0,0.08)" }}>
                                          <div style={{ height: "100%", borderRadius: 3, width: `${sb.avgPct}%`, background: sb.avgPct < 50 ? "#d94f4f" : sb.avgPct < 65 ? "#d08a2b" : "#3a8a5c" }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {(w.evalTimeline || []).length > 0 && (
                                  <div style={{ marginTop: 14 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Evaluation History</div>
                                    {(w.evalTimeline || []).map((et: any, idx: number) => (
                                      <div key={et.evalId} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", background: "rgba(255,255,255,0.5)", borderRadius: 6, fontSize: 12, marginBottom: 4 }}>
                                        <span style={{ color: "var(--mid)" }}>#{idx + 1} {et.examName || et.subject}</span>
                                        <span style={{ fontWeight: 600, color: et.pct < 50 ? "#d94f4f" : et.pct < 65 ? "#d08a2b" : "#3a8a5c" }}>{et.pct}%</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                                  <div style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.5)", borderRadius: 9, textAlign: "center" }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: w.hwMissRate > 50 ? "#d94f4f" : "#3a8a5c" }}>{w.hwSubmitted}/{w.hwTotal}</div>
                                    <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>HW Submitted</div>
                                  </div>
                                  <div style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.5)", borderRadius: 9, textAlign: "center" }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: w.hwMissRate > 50 ? "#d94f4f" : "#3a8a5c" }}>{w.hwMissRate}%</div>
                                    <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>HW Miss Rate</div>
                                  </div>
                                  <div style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.5)", borderRadius: 9, textAlign: "center" }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: w.scoreTrend > 5 ? "#d94f4f" : "#3a8a5c" }}>{w.recentAvgPct}%</div>
                                    <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>Recent Avg</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── QUESTION QUALITY TAB ── */}
        {activeSection === "question-quality" && (
          <div className="sf-panel">
            <div className="sf-panel-title">Question Quality Analysis — School-Wide</div>
            <div className="sf-panel-sub">Questions with low average scores flagged for review — click any item to see detailed insight</div>
            {adminQQLoading ? (
              <div style={{ textAlign: "center", padding: "32px" }}><div className="sf-spinner" /></div>
            ) : !adminQQ || adminQQ.length === 0 ? (
              <div className="sf-empty"><div className="sf-empty-icon">📊</div>No question quality signals detected yet. More evaluations are needed to generate analysis.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {adminQQ.map((q: any, i: number) => {
                  const isExpanded = expandedQQItem === i;
                  const qualityScore = Math.round(q.avgPct || 0);
                  const qualityLabel = qualityScore < 30 ? "Critical" : qualityScore < 45 ? "Poor" : "Needs Review";
                  const qualityColor = qualityScore < 30 ? "#d94f4f" : qualityScore < 45 ? "#d08a2b" : "#c07a20";
                  const deviations: string[] = q.sampleDeviations || [];

                  const insights: string[] = [];
                  if (qualityScore < 30) insights.push("Critically low class performance — possible teaching gap or unclear question framing.");
                  if (qualityScore < 45) insights.push("More than half of students scored below 50% on this question.");
                  if (deviations.length > 0) insights.push(`Common deviation patterns: "${deviations[0]}"`);
                  if (q.studentsAffected && q.studentsAffected > 3) insights.push(`${q.studentsAffected} students affected — this may indicate a recurring conceptual gap.`);
                  const memoryBased = deviations.some((d: string) => /memory|rote|recall|definition/i.test(d));
                  if (memoryBased) insights.push("Pattern suggests over-reliance on memory-based question formats rather than conceptual depth.");
                  if (insights.length === 0) insights.push("Question shows consistently low student performance. Review difficulty calibration and answer scheme clarity.");

                  return (
                    <div key={i} data-testid={`admin-qq-item-${i}`} style={{ borderRadius: 13, border: "1.5px solid var(--rule)", overflow: "hidden", background: "var(--pane)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "14px 16px", cursor: "pointer" }}
                        onClick={() => setExpandedQQItem(isExpanded ? null : i)}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                            Q{q.questionNumber}: {q.examName || q.subject}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--mid)", marginBottom: 5 }}>
                            {q.teacherName || "Unknown Teacher"} &nbsp;·&nbsp; {q.subject} &nbsp;·&nbsp; {q.studentsAffected || 0} students evaluated
                          </div>
                          <div style={{ fontSize: 12, color: qualityColor, fontWeight: 500 }}>
                            {q.flagReason || "Low student performance flagged for quality review."}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: qualityColor }}>{qualityScore}%</div>
                          <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 1 }}>avg score</div>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 5 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "#fff0f0", color: qualityColor }}>{qualityLabel}</span>
                            <span style={{ fontSize: 10, color: "var(--mid)" }}>{isExpanded ? "▲" : "▼"}</span>
                          </div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--rule)" }}>
                          <div style={{ marginTop: 12, fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Quality Insights</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {insights.map((insight, idx) => (
                              <div key={idx} style={{ display: "flex", gap: 8, padding: "9px 12px", background: "#fff8ed", borderRadius: 8, fontSize: 13, color: "var(--ink)", lineHeight: 1.55 }}>
                                <span style={{ flexShrink: 0, color: "#d08a2b" }}>⚠</span>
                                <span>{insight}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Quality Score Breakdown</div>
                            <div style={{ height: 7, borderRadius: 4, background: "rgba(0,0,0,0.07)", marginBottom: 6 }}>
                              <div style={{ height: "100%", borderRadius: 4, width: `${qualityScore}%`, background: qualityScore < 30 ? "#d94f4f" : qualityScore < 45 ? "#d08a2b" : "#c07a20", transition: "width 0.4s" }} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--mid)" }}>
                              <span>Class avg: <b style={{ color: qualityColor }}>{qualityScore}%</b></span>
                              <span>Students affected: <b style={{ color: "var(--ink)" }}>{q.studentsAffected || 0}</b></span>
                              <span>Exam: <b style={{ color: "var(--ink)" }}>{q.examName}</b></span>
                            </div>
                          </div>
                          {deviations.length > 0 && (
                            <div style={{ marginTop: 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Sample Student Deviation Patterns</div>
                              {deviations.map((d: string, idx: number) => (
                                <div key={idx} style={{ padding: "7px 11px", background: "rgba(0,0,0,0.03)", borderRadius: 7, fontSize: 12, color: "var(--mid)", marginBottom: 5, lineHeight: 1.5 }}>"{d}"</div>
                              ))}
                            </div>
                          )}
                          <div style={{ marginTop: 14, padding: "10px 13px", background: "#f0f4ff", borderRadius: 8, fontSize: 12.5, color: "#4460cc", lineHeight: 1.55 }}>
                            <b>Recommendation:</b> Review this question with {q.teacherName || "the teacher"}. Consider rebalancing difficulty, adding analytical depth, or clarifying question framing.
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        <ProfileDrawer open={isProfilePanelOpen} onClose={() => setIsProfilePanelOpen(false)} />
      </div>

      {/* ── AI CHAT SIDEBAR ── */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.18)", backdropFilter: "blur(4px)", zIndex: 40 }} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 20 }} style={{ position: "fixed", right: 0, top: 0, height: "100vh", width: 420, background: "#f5f3ee", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(26,26,46,0.12)" }}>
              {/* Top bar — navy */}
              <div style={{ background: "#1a1a2e", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>⏱ AI Analyst</span>
                <button onClick={() => setIsChatOpen(false)} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.6)", fontSize: 14 }}>✕</button>
              </div>
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
                {!activeConversationId ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
                    <div style={{ background: "#dddaf5", padding: "28px 28px 24px", textAlign: "center" }}>
                      <div style={{ width: 60, height: 60, borderRadius: 16, background: "#f5f3ee", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 12px rgba(26,26,46,0.1)" }}>
                        <TrendingUp style={{ width: 26, height: 26, color: "#1a1a2e" }} />
                      </div>
                      <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: 22, color: "#1a1a2e", marginBottom: 8, lineHeight: 1.2 }}>School-Wide Analysis</h2>
                      <p style={{ fontSize: 13.5, color: "#6b6b85", lineHeight: 1.55, maxWidth: 280, margin: "0 auto" }}>Ask any question about school performance, teacher effectiveness, or student trends.</p>
                    </div>
                    <div style={{ background: "#dddaf5", padding: "0 28px 20px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                      {["School", "Teachers", "Students", "Classes"].map(p => (
                        <span key={p} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 20, background: "rgba(26,26,46,0.08)", color: "#4a4a7a" }}>{p}</span>
                      ))}
                    </div>
                    <div style={{ padding: "20px 24px 24px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8888a8", marginBottom: 12 }}>Example Questions</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                        {ADMIN_CHAT_QUESTIONS.map(q => (
                          <button key={q} onClick={() => { startConversation.mutate(undefined, { onSuccess: () => setTimeout(() => setChatMessage(q), 300) }); }} style={{ background: "white", border: "1.5px solid rgba(26,26,46,0.1)", borderRadius: 12, padding: "13px 16px", textAlign: "left", fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "#1a1a2e", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, lineHeight: 1.4, transition: "all 0.18s" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", border: "1.5px solid #4a4a7a", background: "#dddaf5", flexShrink: 0 }} />{q}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => startConversation.mutate()} disabled={startConversation.isPending} style={{ width: "100%", background: "#1a1a2e", color: "white", border: "none", borderRadius: 12, padding: "15px 20px", fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.2s" }}>
                        {startConversation.isPending ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 16, height: 16 }} />} Start New Analysis
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, background: "#f8f7fd" }}>
                      {(!messages || messages.length === 0) && <div style={{ textAlign: "center", padding: "32px 0", color: "#8888a8", fontSize: 13 }}>Ask a question to get started</div>}
                      {messages?.map((msg: any) => (
                        <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 8, alignItems: "flex-end" }}>
                          {msg.role === "assistant" && <div style={{ width: 26, height: 26, borderRadius: 7, background: "#3D2C8D", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✦</div>}
                          <div style={{ maxWidth: "80%", padding: "9px 13px", borderRadius: 10, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", ...(msg.role === "user" ? { background: "#4a4a7a", color: "white", borderBottomRightRadius: 3 } : { background: "white", color: "#1a1a2e", border: "1px solid #E0DCF0", borderBottomLeftRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }) }}>{msg.content}</div>
                        </div>
                      ))}
                      {sendMessage.isPending && <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}><div style={{ width: 26, height: 26, borderRadius: 7, background: "#3D2C8D", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>✦</div><div style={{ background: "white", border: "1px solid #E0DCF0", borderRadius: "10px 10px 10px 3px", padding: "9px 13px", fontSize: 13, color: "#8888a8" }}>Analyzing data…</div></div>}
                    </div>
                    <div style={{ padding: "12px 16px", borderTop: "1px solid #E0DCF0", background: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                      <div style={{ marginBottom: 8 }}><button onClick={() => setActiveConversationId(null)} style={{ fontSize: 12, color: "#8888a8", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus style={{ width: 12, height: 12 }} /> New conversation</button></div>
                      <form onSubmit={e => { e.preventDefault(); if (chatMessage.trim()) sendMessage.mutate(chatMessage); }} style={{ display: "flex", gap: 8 }}>
                        <input placeholder="Ask about school performance…" value={chatMessage} onChange={e => setChatMessage(e.target.value)} disabled={sendMessage.isPending} style={{ flex: 1, border: "1px solid #E0DCF0", borderRadius: 7, padding: "7px 11px", fontSize: 13, fontFamily: "DM Sans, sans-serif", background: "white", color: "#1a1a2e", outline: "none" }} data-testid="input-chat-message" />
                        <button type="submit" disabled={sendMessage.isPending || !chatMessage.trim()} style={{ width: 32, height: 32, borderRadius: 7, background: "#1a1a2e", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 15, flexShrink: 0 }} data-testid="button-send-message">↑</button>
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
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ position: "fixed", bottom: 24, right: 24, zIndex: 40 }}>
          <button onClick={() => setIsChatOpen(true)} data-testid="button-float-chat" style={{ width: 56, height: 56, borderRadius: "50%", background: "#1a1a2e", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 30px rgba(26,26,46,0.3)", transition: "transform 0.2s" }}>
            <MessageSquare style={{ width: 22, height: 22, color: "white" }} />
          </button>
        </motion.div>
      )}
    </div>
  );
}
