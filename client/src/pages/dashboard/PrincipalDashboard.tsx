import "@/dashboard.css";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "@/lib/fetcher";
import ProfileDrawer from "@/components/ProfileDrawer";
import CustomInsights from "@/components/CustomInsights";
import { getInitials } from "@/shared/utils/identity";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function kpiColor(score: number) {
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

export default function PrincipalDashboard() {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState("overview");
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [showAvaMenu, setShowAvaMenu] = useState(false);
  const avaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avaRef.current && !avaRef.current.contains(e.target as Node)) setShowAvaMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/principal/stats"],
    queryFn: () => fetchWithAuth("/api/principal/stats").then((r) => r.json()),
    staleTime: 60000,
  });

  const { data: classPerformance, isLoading: cpLoading } = useQuery<any[]>({
    queryKey: ["/api/principal/class-performance"],
    queryFn: () => fetchWithAuth("/api/principal/class-performance").then((r) => r.json()),
    enabled: activeSection === "class-performance",
    staleTime: 60000,
  });

  const { data: teacherEffectiveness, isLoading: teLoading } = useQuery<any[]>({
    queryKey: ["/api/principal/teacher-effectiveness"],
    queryFn: () => fetchWithAuth("/api/principal/teacher-effectiveness").then((r) => r.json()),
    enabled: activeSection === "teacher-insights",
    staleTime: 60000,
  });

  const { data: eduQuality, isLoading: eqLoading } = useQuery<any[]>({
    queryKey: ["/api/principal/education-quality"],
    queryFn: () => fetchWithAuth("/api/principal/education-quality").then((r) => r.json()),
    enabled: activeSection === "education-quality",
    staleTime: 60000,
  });

  const userName = (user as any)?.name || "Principal";
  const initials = getInitials(userName);

  if (statsLoading && !stats) {
    return (
      <div className="sf-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const kpis = [
    { label: "Total Students", value: stats?.totalStudents ?? 0 },
    { label: "Total Teachers", value: stats?.totalTeachers ?? 0 },
    { label: "Total Exams", value: stats?.totalExams ?? 0 },
    { label: "Sheets Evaluated", value: stats?.sheetsEvaluated ?? 0 },
    { label: "Avg Performance", value: `${stats?.avgPerformance ?? 0}%`, color: kpiColor(stats?.avgPerformance ?? 0) },
    { label: "Active Classes", value: stats?.activeClasses ?? 0 },
  ];

  return (
    <div className="sf-root">
      <nav className="sf-topnav">
        <div className="sf-logo">
          <div className="sf-logo-mark teacher" style={{ background: "var(--ink)" }}>P</div>
          <span className="sf-logo-name">ScholarFlow</span>
          <span className="sf-teacher-pill" style={{ background: "var(--ink)", color: "var(--white)", border: "none" }}>PRINCIPAL</span>
        </div>

        <div className="sf-nav-tabs">
          <button className={`sf-nav-tab${activeSection === "overview" ? " on" : ""}`} onClick={() => setActiveSection("overview")}>Overview</button>
          <button className={`sf-nav-tab${activeSection === "teacher-insights" ? " on" : ""}`} onClick={() => setActiveSection("teacher-insights")}>Teacher Insights</button>
          <button className={`sf-nav-tab${activeSection === "class-performance" ? " on" : ""}`} onClick={() => setActiveSection("class-performance")}>Class Insights</button>
          <button className={`sf-nav-tab${activeSection === "education-quality" ? " on" : ""}`} onClick={() => setActiveSection("education-quality")}>Quality of Education</button>
          <button className={`sf-nav-tab${activeSection === "ai-insights" ? " on" : ""}`} onClick={() => setActiveSection("ai-insights")}>AI Insights</button>
        </div>

        <div className="sf-nav-right">
          <div className="sf-ava teacher" ref={avaRef} onClick={() => setShowAvaMenu((v) => !v)}>
            {initials}
            {showAvaMenu && (
              <div className="sf-ava-menu">
                <button className="sf-ava-menu-item" onClick={() => { setIsProfilePanelOpen(true); setShowAvaMenu(false); }}>My Profile</button>
                <button className="sf-ava-menu-item danger" onClick={() => logout()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="sf-page">
        <div className="sf-page-head">
          <div>
            <div className="sf-page-title">{getGreeting()}, {userName.split(" ")[0]}.</div>
            <div className="sf-page-sub">{new Date().toDateString()} &nbsp;·&nbsp; Principal control center</div>
          </div>
        </div>

        {activeSection === "overview" && (
          <>
            <div className="sf-funnel" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {kpis.map((kpi, idx) => (
                <div key={kpi.label} className="sf-f-col" style={{ paddingLeft: idx % 3 === 0 ? 0 : undefined, borderRight: idx % 3 === 2 ? "none" : undefined }}>
                  <div className="sf-f-cat">{kpi.label}</div>
                  <div className="sf-f-num" style={{ color: kpi.color }}>{kpi.value}</div>
                  <div className="sf-f-desc">Live school metric copied from admin stats.</div>
                </div>
              ))}
            </div>

            <div className="sf-panel" style={{ marginTop: 18 }}>
              <div className="sf-panel-title">School Overview</div>
              <div className="sf-panel-sub">Operational snapshot across academics and workload.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
                <div className="sf-exam-item" style={{ cursor: "default" }}>
                  <div className="sf-exam-subj" style={{ background: "var(--green-bg)" }}>📚</div>
                  <div className="sf-exam-info"><div className="sf-exam-name">Homework Assigned</div></div>
                  <span className="sf-exam-status sf-es-done">{stats?.homeworkAssigned ?? 0}</span>
                </div>
                <div className="sf-exam-item" style={{ cursor: "default" }}>
                  <div className="sf-exam-subj" style={{ background: "var(--lav-bg)" }}>📝</div>
                  <div className="sf-exam-info"><div className="sf-exam-name">Homework Submitted</div></div>
                  <span className="sf-exam-status sf-es-done">{stats?.homeworkSubmitted ?? 0}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {activeSection === "class-performance" && (
          <div className="sf-panel">
            <div className="sf-panel-title">Class Insights</div>
            <div className="sf-panel-sub">Minimal class-wise performance summary.</div>
            {cpLoading ? (
              <div style={{ textAlign: "center", padding: 24 }}><div className="sf-spinner" /></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(classPerformance || []).slice(0, 20).map((c: any) => (
                  <div key={`${c.class}-${c.section}`} className="sf-exam-item" style={{ cursor: "default" }}>
                    <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", fontSize: 11 }}>{c.class}{c.section}</div>
                    <div className="sf-exam-info">
                      <div className="sf-exam-name">Class {c.class} - Section {c.section}</div>
                      <div className="sf-exam-meta">Participation {c.participation}% · Evaluated {c.evaluatedCount}/{c.totalStudents}</div>
                    </div>
                    <span className="sf-exam-status sf-es-done">{c.avgScore}%</span>
                  </div>
                ))}
                {(classPerformance || []).length === 0 && <div className="sf-empty"><div className="sf-empty-icon">📈</div>No class data yet.</div>}
              </div>
            )}
          </div>
        )}

        {activeSection === "teacher-insights" && (
          <div className="sf-panel">
            <div className="sf-panel-title">Teacher Insights</div>
            <div className="sf-panel-sub">Minimal teacher effectiveness summary.</div>
            {teLoading ? (
              <div style={{ textAlign: "center", padding: 24 }}><div className="sf-spinner" /></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(teacherEffectiveness || []).slice(0, 20).map((t: any) => (
                  <div key={t.teacherId} className="sf-exam-item" style={{ cursor: "default" }}>
                    <div className="sf-exam-subj" style={{ background: "var(--blue-bg)", fontSize: 11 }}>{getInitials(t.name || "T")}</div>
                    <div className="sf-exam-info">
                      <div className="sf-exam-name">{t.name}</div>
                      <div className="sf-exam-meta">{t.examCount} exams · {t.studentsEvaluated} students</div>
                    </div>
                    <span className="sf-exam-status sf-es-done">{t.avgScore}%</span>
                  </div>
                ))}
                {(teacherEffectiveness || []).length === 0 && <div className="sf-empty"><div className="sf-empty-icon">👩‍🏫</div>No teacher data yet.</div>}
              </div>
            )}
          </div>
        )}

        {activeSection === "education-quality" && (
          <div className="sf-panel">
            <div className="sf-panel-title">Quality of Education</div>
            <div className="sf-panel-sub">Minimal curriculum-depth highlights.</div>
            {eqLoading ? (
              <div style={{ textAlign: "center", padding: 24 }}><div className="sf-spinner" /></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(eduQuality || []).slice(0, 20).map((e: any, idx: number) => (
                  <div key={`${e.examId}-${idx}`} className="sf-exam-item" style={{ cursor: "default" }}>
                    <div className="sf-exam-subj" style={{ background: "var(--amber-bg)" }}>📘</div>
                    <div className="sf-exam-info">
                      <div className="sf-exam-name">{e.examName} · {e.subject} · Class {e.className}</div>
                      <div className="sf-exam-meta">{e.teacherName}</div>
                    </div>
                    <span className="sf-exam-status">{e.overallDepthRating}</span>
                  </div>
                ))}
                {(eduQuality || []).length === 0 && <div className="sf-empty"><div className="sf-empty-icon">📚</div>No quality analysis yet.</div>}
              </div>
            )}
          </div>
        )}

        {activeSection === "ai-insights" && (
          <div className="sf-panel">
            <CustomInsights role="principal" />
          </div>
        )}

        <ProfileDrawer open={isProfilePanelOpen} onClose={() => setIsProfilePanelOpen(false)} />
      </div>
    </div>
  );
}
