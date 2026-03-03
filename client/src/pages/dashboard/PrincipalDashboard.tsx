import "@/dashboard.css";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetcher";
import ProfileDrawer from "@/components/ProfileDrawer";
import CustomInsights from "@/components/CustomInsights";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function getInitials(name: string) {
  return name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
}
function kpiColor(score: number) {
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}
const BAR_COLORS = [
  { bg: "var(--lav-card)", border: "" },
  { bg: "var(--green-bg)", border: "1.5px solid rgba(42,157,110,.3)" },
  { bg: "var(--amber-bg)", border: "1.5px solid rgba(196,122,30,.3)" },
  { bg: "var(--blue-bg)", border: "1.5px solid rgba(37,99,192,.2)" },
  { bg: "#fce4ef", border: "1.5px solid rgba(212,65,126,.2)" },
];

export default function PrincipalDashboard() {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState("school-insights");
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [showAvaMenu, setShowAvaMenu] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [moreInsightsOpen, setMoreInsightsOpen] = useState(false);
  const avaRef = useRef<HTMLDivElement>(null);

  const userName = (user as any)?.name || "Principal";
  const initials = getInitials(userName);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avaRef.current && !avaRef.current.contains(e.target as Node)) setShowAvaMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/principal/stats"],
    queryFn: () => fetchWithAuth("/api/principal/stats").then(r => r.json()),
  });

  const { data: classPerformance, isLoading: cpLoading } = useQuery<any[]>({
    queryKey: ["/api/principal/class-performance"],
    queryFn: () => fetchWithAuth("/api/principal/class-performance").then(r => r.json()),
  });

  const { data: teacherEffectiveness, isLoading: teLoading } = useQuery<any[]>({
    queryKey: ["/api/principal/teacher-effectiveness"],
    queryFn: () => fetchWithAuth("/api/principal/teacher-effectiveness").then(r => r.json()),
    enabled: activeSection === "teacher-insights",
  });

  const { data: schoolInsights, isLoading: siLoading } = useQuery<any>({
    queryKey: ["/api/principal/school-insights"],
    queryFn: () => fetchWithAuth("/api/principal/school-insights").then(r => r.json()),
    enabled: activeSection === "school-insights",
  });

  const [eduQualityOpen, setEduQualityOpen] = useState<number | null>(null);
  const { data: eduQuality, isLoading: isLoadingEduQuality } = useQuery<any[]>({
    queryKey: ["/api/principal/education-quality"],
    queryFn: () => fetchWithAuth("/api/principal/education-quality").then(r => r.json()),
    enabled: activeSection === "education-quality",
  });

  const maxBarH = 90;
  const allClasses = classPerformance || [];
  const allTeachers = teacherEffectiveness || [];
  const si = schoolInsights || {};
  const filteredClasses = classFilter ? allClasses.filter((c: any) => String(c.class) === classFilter) : allClasses;
  const filteredTeachers = teacherFilter ? allTeachers.filter((t: any) => String(t.teacherId) === teacherFilter) : allTeachers;
  const uniqueClasses = [...new Set(allClasses.map((c: any) => c.class))].sort();
  const overviewColumns = [
    [
      { label: "Total Students", value: String(stats?.totalStudents ?? 0) },
      { label: "Sheets Evaluated", value: String(stats?.sheetsEvaluated ?? 0) },
    ],
    [
      { label: "Total Teachers", value: String(stats?.totalTeachers ?? 0) },
      { label: "Avg Performance", value: `${stats?.avgPerformance ?? 0}%`, color: kpiColor(stats?.avgPerformance ?? 0) },
    ],
    [
      { label: "Total Exams", value: String(stats?.totalExams ?? 0) },
      { label: "Active Classes", value: String(stats?.activeClasses ?? 0) },
    ],
  ];

  const classBars = filteredClasses.slice(0, 8).map((c: any, i: number) => ({
    label: `${c.class}-${c.section}`, pct: c.avgScore,
    height: Math.round(((c.avgScore || 0) / 100) * maxBarH), color: BAR_COLORS[i % BAR_COLORS.length],
  }));
  const participationBars = filteredClasses.slice(0, 8).map((c: any, i: number) => ({
    label: `${c.class}-${c.section}`, pct: c.participation,
    height: Math.round(((c.participation || 0) / 100) * maxBarH), color: BAR_COLORS[(i + 3) % BAR_COLORS.length],
  }));
  const subjectBars = (si.subjectStrengths || []).slice(0, 8).map((s: any, i: number) => ({
    label: s.subject.slice(0, 4), pct: s.avgScore,
    height: Math.round(((s.avgScore || 0) / 100) * maxBarH), color: BAR_COLORS[(i + 2) % BAR_COLORS.length],
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

      {/* ── TOP NAV — identical structure to AdminDashboard ── */}
      <nav className="sf-topnav">
        <div className="sf-logo">
          <div className="sf-logo-mark teacher" style={{ background: "var(--ink)" }}>P</div>
          <span className="sf-logo-name">ScholarFlow</span>
          <span className="sf-teacher-pill" style={{ background: "var(--ink)", color: "var(--white)", border: "none" }}>PRINCIPAL</span>
        </div>

        <div className="sf-nav-tabs">
          <button className={`sf-nav-tab${activeSection === "school-insights" ? " on" : ""}`} onClick={() => setActiveSection("school-insights")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            School Insights
          </button>
          <button className={`sf-nav-tab${activeSection === "teacher-insights" ? " on" : ""}`} onClick={() => setActiveSection("teacher-insights")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            Teacher Insights
          </button>
          <button className={`sf-nav-tab${activeSection === "class-performance" ? " on" : ""}`} onClick={() => setActiveSection("class-performance")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
            Class Insights
          </button>
          <button className={`sf-nav-tab${activeSection === "education-quality" ? " on" : ""}`} onClick={() => setActiveSection("education-quality")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            Quality of Education
          </button>
          <button className={`sf-nav-tab${activeSection === "ai-insights" ? " on" : ""}`} onClick={() => setActiveSection("ai-insights")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            AI Insights
          </button>

        </div>

        <div className="sf-nav-right">
          <div className="sf-ava teacher" ref={avaRef} onClick={() => setShowAvaMenu(v => !v)}>
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

      {/* ── PAGE ── */}
      <div className="sf-page">
        <div className="sf-page-head">
          <div>
            <div className="sf-page-title">{getGreeting()}, {userName.split(" ")[0]}.</div>
            <div className="sf-page-sub">{new Date().toDateString()} &nbsp;·&nbsp; School-wide governance, analytics and intelligence</div>
          </div>
        </div>

        {/* ── PRINCIPAL KPIs ── */}
        <div className="sf-funnel" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {overviewColumns.map((column, idx) => (
            <div key={`principal-overview-col-${idx}`} className="sf-f-col" style={{ paddingLeft: idx === 0 ? 0 : undefined, borderRight: idx === 2 ? "none" : undefined }}>
              {column.map((kpi, blockIdx) => (
                <div key={kpi.label} style={{ marginTop: blockIdx === 0 ? 0 : 4 }}>
                  <div className="sf-f-cat">{kpi.label}</div>
                  <div className="sf-f-num" style={{ color: kpi.color }}>{kpi.value}</div>
                  <div className="sf-f-desc">Live school metric.</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ── CLASS PERFORMANCE TAB ── */}
        {activeSection === "class-performance" && (
          <>
            <div className="sf-analytics-head">
              <div>
                <div className="sf-section-title">Class Performance</div>
                <div className="sf-section-sub">Academic performance breakdown by class and section</div>
              </div>
              <div className="sf-filter-row">
                <select className="sf-fsel" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
                  <option value="">All Classes</option>
                  {uniqueClasses.map((c: any) => <option key={c} value={c}>Class {c}</option>)}
                </select>
              </div>
            </div>

            <div className="sf-charts-grid">
              {/* Chart 1 — Avg Score */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-lav">📊</div>
                    <div>
                      <div className="sf-chart-name">Academic Performance Index</div>
                      <div className="sf-chart-desc">Avg score % per class-section</div>
                    </div>
                  </div>
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                <div className="sf-bar-chart">
                  {cpLoading ? <div style={{ width: "100%", textAlign: "center", padding: "32px 0" }}><div className="sf-spinner" /></div>
                    : classBars.length > 0 ? classBars.map((b, i) => (
                      <div key={i} className="sf-bar-col">
                        <div className="sf-bar" style={{ height: `${b.height}px`, background: b.color.bg, border: b.color.border || undefined }} data-v={`${b.pct}%`} />
                        <div className="sf-blbl">{b.label}</div>
                      </div>
                    )) : <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No evaluation data yet</div>}
                </div>
              </div>

              {/* Chart 2 — Participation */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-green">🎯</div>
                    <div>
                      <div className="sf-chart-name">Participation Rate</div>
                      <div className="sf-chart-desc">% students assessed per class-section</div>
                    </div>
                  </div>
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                <div className="sf-bar-chart">
                  {cpLoading ? <div style={{ width: "100%", textAlign: "center", padding: "32px 0" }}><div className="sf-spinner" /></div>
                    : participationBars.length > 0 ? participationBars.map((b, i) => (
                      <div key={i} className="sf-bar-col">
                        <div className="sf-bar" style={{ height: `${b.height}px`, background: b.color.bg, border: b.color.border || undefined }} data-v={`${b.pct}%`} />
                        <div className="sf-blbl">{b.label}</div>
                      </div>
                    )) : <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No data yet</div>}
                </div>
              </div>

              {/* Chart 3 — Performance Distribution per class */}
              <div className="sf-chart-card" style={{ gridColumn: "1 / -1" }}>
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-amber">🏅</div>
                    <div>
                      <div className="sf-chart-name">Performance Distribution by Class</div>
                      <div className="sf-chart-desc">High performers · Average · At-risk per class-section</div>
                    </div>
                  </div>
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                {cpLoading ? (
                  <div style={{ textAlign: "center", padding: "32px 0" }}><div className="sf-spinner" /></div>
                ) : filteredClasses.length === 0 ? (
                  <div className="sf-empty"><div className="sf-empty-icon">📈</div>No evaluation data yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {filteredClasses.map((c: any) => (
                      <div key={`${c.class}-${c.section}`} className="sf-exam-item" style={{ cursor: "default" }}>
                        <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", fontSize: 11 }}>{c.class}{c.section}</div>
                        <div className="sf-exam-info">
                          <div className="sf-exam-name">Class {c.class} — Section {c.section}</div>
                          <div className="sf-exam-meta">{c.evaluatedCount || 0} students evaluated · Avg: {c.avgScore}%</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--green-bg)", color: "var(--green)", fontWeight: 700 }}>↑ {c.highPerformers || 0} High</span>
                          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--amber-bg)", color: "var(--amber)", fontWeight: 700 }}>~ {c.average || 0} Avg</span>
                          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "#fff0f0", color: "var(--red)", fontWeight: 700 }}>⚠ {c.atRisk || 0} Risk</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── TEACHER INSIGHTS TAB ── */}
        {activeSection === "teacher-insights" && (
          <>
            <div className="sf-analytics-head">
              <div>
                <div className="sf-section-title">Teacher Effectiveness</div>
                <div className="sf-section-sub">Consistency, evaluations and performance per teacher</div>
              </div>
              <div className="sf-filter-row">
                <select className="sf-fsel" value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)}>
                  <option value="">All Teachers</option>
                  {allTeachers.map((t: any) => <option key={t.teacherId} value={String(t.teacherId)}>{t.name}</option>)}
                </select>
              </div>
            </div>

            {teLoading ? (
              <div style={{ textAlign: "center", padding: "48px" }}><div className="sf-spinner" /></div>
            ) : (
              <div className="sf-charts-grid">
                {/* Consistency Index bars */}
                <div className="sf-chart-card">
                  <div className="sf-chart-head">
                    <div className="sf-chart-ico-row">
                      <div className="sf-chart-ico sf-ci-lav">📐</div>
                      <div>
                        <div className="sf-chart-name">Result Consistency Index</div>
                        <div className="sf-chart-desc">Higher = more consistent outcomes</div>
                      </div>
                    </div>
                    <span className="sf-chart-badge sf-cb-live">Live</span>
                  </div>
                  <div className="sf-bar-chart">
                    {filteredTeachers.length === 0 ? <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No data yet</div>
                      : filteredTeachers.slice(0, 8).map((t: any, i: number) => {
                        const h = Math.round(((t.consistencyIndex || 0) / 100) * maxBarH);
                        return (
                          <div key={i} className="sf-bar-col">
                            <div className="sf-bar" style={{ height: `${h}px`, background: BAR_COLORS[i % BAR_COLORS.length].bg }} data-v={`${t.consistencyIndex}`} />
                            <div className="sf-blbl">{(t.name || "T").split(" ")[0]}</div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Exams Conducted */}
                <div className="sf-chart-card">
                  <div className="sf-chart-head">
                    <div className="sf-chart-ico-row">
                      <div className="sf-chart-ico sf-ci-green">📝</div>
                      <div>
                        <div className="sf-chart-name">Evaluations Conducted</div>
                        <div className="sf-chart-desc">Total exams per teacher</div>
                      </div>
                    </div>
                    <span className="sf-chart-badge sf-cb-live">Live</span>
                  </div>
                  <div className="sf-bar-chart">
                    {filteredTeachers.length === 0 ? <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No data yet</div>
                      : filteredTeachers.slice(0, 8).map((t: any, i: number) => {
                        const maxEx = Math.max(...filteredTeachers.map((x: any) => x.examCount || 0), 1);
                        const h = Math.round(((t.examCount || 0) / maxEx) * maxBarH);
                        return (
                          <div key={i} className="sf-bar-col">
                            <div className="sf-bar" style={{ height: `${h}px`, background: BAR_COLORS[(i + 1) % BAR_COLORS.length].bg }} data-v={`${t.examCount}`} />
                            <div className="sf-blbl">{(t.name || "T").split(" ")[0]}</div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Teacher detail rows */}
                <div className="sf-chart-card" style={{ gridColumn: "1 / -1" }}>
                  <div className="sf-chart-head">
                    <div className="sf-chart-ico-row">
                      <div className="sf-chart-ico sf-ci-amber">👨‍🏫</div>
                      <div>
                        <div className="sf-chart-name">Teacher Performance Detail</div>
                        <div className="sf-chart-desc">Full stats per teacher</div>
                      </div>
                    </div>
                  </div>
                  {filteredTeachers.length === 0 ? (
                    <div className="sf-empty"><div className="sf-empty-icon">👩‍🏫</div>No teacher evaluation data yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      {filteredTeachers.map((t: any) => (
                        <div key={t.teacherId} className="sf-exam-item" style={{ cursor: "default" }}>
                          <div className="sf-exam-subj" style={{ background: "var(--lav-bg)" }}>{getInitials(t.name || "T")}</div>
                          <div className="sf-exam-info">
                            <div className="sf-exam-name">{t.name}</div>
                            <div className="sf-exam-meta">{t.examCount} exams · {t.studentsEvaluated} students · Consistency: {t.consistencyIndex}</div>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span className="sf-exam-status sf-es-done" style={{ background: "none", color: kpiColor(t.avgScore) }}>{t.avgScore}% avg</span>
                            <span className="sf-exam-status" style={{ background: t.consistencyIndex >= 75 ? "var(--green-bg)" : "var(--amber-bg)", color: t.consistencyIndex >= 75 ? "var(--green)" : "var(--amber)" }}>
                              {t.consistencyIndex >= 75 ? "Consistent" : "Variable"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── SCHOOL INSIGHTS TAB ── */}
        {activeSection === "school-insights" && (
          <>
            <div className="sf-analytics-head">
              <div>
                <div className="sf-section-title">School Insights</div>
                <div className="sf-section-sub">Overall health, subject analysis and student performance trends</div>
              </div>
            </div>

            {siLoading ? (
              <div style={{ textAlign: "center", padding: "48px" }}><div className="sf-spinner" /></div>
            ) : (
              <div className="sf-charts-grid">
                {/* Subject Strength */}
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
                    {subjectBars.length > 0 ? subjectBars.map((b, i) => (
                      <div key={i} className="sf-bar-col">
                        <div className="sf-bar" style={{ height: `${b.height}px`, background: b.color.bg, border: b.color.border || undefined }} data-v={`${b.pct}%`} />
                        <div className="sf-blbl">{b.label}</div>
                      </div>
                    )) : <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No data yet</div>}
                  </div>
                </div>

                {/* Evaluation load by subject */}
                <div className="sf-chart-card">
                  <div className="sf-chart-head">
                    <div className="sf-chart-ico-row">
                      <div className="sf-chart-ico sf-ci-blue">📋</div>
                      <div>
                        <div className="sf-chart-name">Evaluation Load</div>
                        <div className="sf-chart-desc">Evaluations per subject</div>
                      </div>
                    </div>
                    <span className="sf-chart-badge sf-cb-live">Live</span>
                  </div>
                  {Object.keys(si.evalsBySubject || {}).length === 0 ? (
                    <div className="sf-empty"><div className="sf-empty-icon">📋</div>No evaluation data</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                      {Object.entries(si.evalsBySubject || {}).map(([subj, count]: any, i: number) => {
                        const maxCount = Math.max(...Object.values(si.evalsBySubject) as number[], 1);
                        return (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                              <span style={{ color: "var(--mid)" }}>{subj}</span>
                              <span style={{ fontWeight: 700 }}>{count}</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, background: "var(--rule)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(count / maxCount) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length].bg, borderRadius: 3, transition: "width 0.5s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Top Students */}
                <div className="sf-chart-card">
                  <div className="sf-chart-head">
                    <div className="sf-chart-ico-row">
                      <div className="sf-chart-ico sf-ci-lav">🏆</div>
                      <div>
                        <div className="sf-chart-name">Top 10% Students</div>
                        <div className="sf-chart-desc">Highest performers school-wide</div>
                      </div>
                    </div>
                  </div>
                  {(si.topStudents || []).length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {si.topStudents.map((s: any, i: number) => (
                        <div key={i} className="sf-exam-item" style={{ cursor: "default" }}>
                          <div className="sf-exam-subj" style={{ background: "var(--green-bg)", color: "var(--green)", fontSize: 11 }}>#{i + 1}</div>
                          <div className="sf-exam-info"><div className="sf-exam-name">{s.admission}</div></div>
                          <span className="sf-exam-status sf-es-done">{s.avg}%</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="sf-empty"><div className="sf-empty-icon">🏆</div>No evaluation data</div>}
                </div>

                {/* At-Risk Students */}
                <div className="sf-chart-card">
                  <div className="sf-chart-head">
                    <div className="sf-chart-ico-row">
                      <div className="sf-chart-ico" style={{ background: "#fff0f0", fontSize: 16 }}>⚠️</div>
                      <div>
                        <div className="sf-chart-name">At-Risk Students</div>
                        <div className="sf-chart-desc">Bottom 10% — require intervention</div>
                      </div>
                    </div>
                  </div>
                  {(si.bottomStudents || []).length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {si.bottomStudents.map((s: any, i: number) => (
                        <div key={i} className="sf-exam-item" style={{ cursor: "default" }}>
                          <div className="sf-exam-subj" style={{ background: "#fff0f0", color: "var(--red)", fontSize: 11 }}>⚠</div>
                          <div className="sf-exam-info"><div className="sf-exam-name">{s.admission}</div></div>
                          <span className="sf-exam-status sf-es-draft">{s.avg}%</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="sf-empty"><div className="sf-empty-icon">✅</div>No at-risk students</div>}
                </div>

                {/* More insights collapsible */}
                <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                  <button className="sf-stab" style={{ display: "flex", alignItems: "center", gap: 6, width: "auto", fontSize: 14, fontWeight: 700 }} onClick={() => setMoreInsightsOpen(v => !v)}>
                    {moreInsightsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    More Insights
                  </button>
                  {moreInsightsOpen && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginTop: 16 }}>
                      <div className="sf-card">
                        <div className="sf-card-title">Evaluation Load — Classes</div>
                        <div className="sf-card-sub">Number of evaluations per class</div>
                        {Object.entries(si.evalsByClass || {}).map(([cls, count]: any, i: number) => {
                          const maxCount = Math.max(...Object.values(si.evalsByClass || { x: 1 }) as number[], 1);
                          return (
                            <div key={i} style={{ marginBottom: 10 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                                <span style={{ color: "var(--mid)" }}>Class {cls}</span>
                                <span style={{ fontWeight: 700 }}>{count}</span>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, background: "var(--rule)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${(count / maxCount) * 100}%`, background: BAR_COLORS[(i + 1) % BAR_COLORS.length].bg, borderRadius: 3, transition: "width 0.5s" }} />
                              </div>
                            </div>
                          );
                        })}
                        {!Object.keys(si.evalsByClass || {}).length && <div className="sf-empty"><div className="sf-empty-icon">🏫</div>No data</div>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── QUALITY OF EDUCATION TAB ── */}
        {activeSection === "education-quality" && (
          <div className="sf-panel">
            <div className="sf-analytics-head">
              <div>
                <div className="sf-panel-title">Quality of Education</div>
                <div className="sf-panel-sub">AI-powered analysis: are your questions at the right NCERT depth for the class?</div>
              </div>
              <span style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, background: "var(--lav-bg)", color: "var(--lavender)", fontWeight: 700, border: "1.5px solid var(--lav-card)" }}>✦ AI Analysis</span>
            </div>

            {isLoadingEduQuality && (
              <div style={{ textAlign: "center", padding: 48 }}>
                <div className="sf-spinner" />
                <div style={{ marginTop: 12, fontSize: 13, color: "var(--mid)" }}>Analysing question papers against NCERT curriculum…</div>
              </div>
            )}

            {!isLoadingEduQuality && (!eduQuality || eduQuality.length === 0) && (
              <div className="sf-empty">
                <div className="sf-empty-icon">📚</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>No exam papers to analyse yet</div>
                <div style={{ fontSize: 12 }}>Create exams with question text to unlock AI curriculum depth analysis</div>
              </div>
            )}

            {!isLoadingEduQuality && eduQuality && eduQuality.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Summary bar — overall depth distribution across all exams */}
                {(() => {
                  const counts = { below: 0, at: 0, above: 0, mixed: 0 };
                  eduQuality.forEach((eq: any) => {
                    const r = eq.overallDepthRating || "";
                    if (r.includes("Below")) counts.below++;
                    else if (r.includes("Above")) counts.above++;
                    else if (r.includes("Mixed")) counts.mixed++;
                    else counts.at++;
                  });
                  const total = eduQuality.length;
                  return (
                    <div className="sf-chart-card" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                      {[
                        { label: "Below NCERT Level", count: counts.below, color: "#d08a2b", bg: "var(--amber-bg)", icon: "⬇" },
                        { label: "At NCERT Level", count: counts.at, color: "var(--green)", bg: "var(--green-bg)", icon: "✓" },
                        { label: "Above NCERT Level", count: counts.above, color: "#2563c0", bg: "var(--blue-bg)", icon: "⬆" },
                        { label: "Mixed Level", count: counts.mixed, color: "var(--lavender)", bg: "var(--lav-bg)", icon: "~" },
                      ].map(item => (
                        <div key={item.label} style={{ background: item.bg, borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: item.color }}>{item.count}</div>
                          <div style={{ fontSize: 10, color: "var(--mid)", marginTop: 3, fontWeight: 600 }}>{item.label}</div>
                          <div style={{ fontSize: 9, color: "var(--dim)", marginTop: 2 }}>of {total} exams</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Per-exam cards */}
                {eduQuality.map((eq: any, idx: number) => {
                  const isOpen = eduQualityOpen === idx;
                  const depthColor = eq.overallDepthRating?.includes("Below") ? "#d08a2b"
                    : eq.overallDepthRating?.includes("Above") ? "#2563c0"
                    : eq.overallDepthRating?.includes("Mixed") ? "var(--lavender)"
                    : "var(--green)";
                  const depthBg = eq.overallDepthRating?.includes("Below") ? "var(--amber-bg)"
                    : eq.overallDepthRating?.includes("Above") ? "var(--blue-bg)"
                    : eq.overallDepthRating?.includes("Mixed") ? "var(--lav-bg)"
                    : "var(--green-bg)";

                  // Category labels
                  const catColors: Record<string, { bg: string; color: string }> = {
                    "Unit Test":     { bg: "var(--lav-bg)",   color: "var(--lavender)" },
                    "Class Test":    { bg: "var(--blue-bg)",  color: "#2563c0" },
                    "Homework":      { bg: "var(--green-bg)", color: "var(--green)" },
                    "Half Yearly":   { bg: "var(--amber-bg)", color: "var(--amber)" },
                    "Annual Exam":   { bg: "#fff0f0",         color: "var(--red)" },
                    "Quiz":          { bg: "#f0f8ff",         color: "#3a8ab0" },
                    "Assignment":    { bg: "#f5f0ff",         color: "#7c5cbf" },
                  };
                  const catStyle = catColors[eq.category] || { bg: "var(--lav-bg)", color: "var(--lavender)" };

                  // Bloom's level color
                  const bloomColors: Record<string, string> = {
                    "Remember": "#9e9e9e", "Understand": "#5c85d6", "Apply": "#2a9d6e",
                    "Analyse": "#d08a2b", "Evaluate": "#9c4dcc", "Create": "#d94f4f",
                  };

                  // Depth gauge
                  const gaugeVal = Math.min(100, Math.max(0, eq.depthScore ?? 50));
                  const gaugeColor = gaugeVal < 40 ? "#d08a2b" : gaugeVal > 65 ? "#2563c0" : "var(--green)";

                  return (
                    <div key={eq.examId} className="sf-chart-card" style={{ padding: 0, overflow: "hidden" }}>
                      {/* Exam header row */}
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", background: isOpen ? "var(--pane)" : "transparent" }}
                        onClick={() => setEduQualityOpen(isOpen ? null : idx)}
                      >
                        {/* Category pill */}
                        <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 20, background: catStyle.bg, color: catStyle.color, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>
                          {eq.category}
                        </span>

                        {/* Title */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {eq.examName}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--mid)" }}>Class {eq.className} · {eq.subject} · {eq.totalMarks} marks</div>
                        </div>

                        {/* Depth gauge bar */}
                        <div style={{ flexShrink: 0, width: 120 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--mid)", marginBottom: 3 }}>
                            <span>Below</span><span>NCERT</span><span>Above</span>
                          </div>
                          <div style={{ height: 6, background: "var(--rule)", borderRadius: 3, position: "relative" }}>
                            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", height: 10, width: 2, background: "var(--mid)", borderRadius: 1 }} />
                            <div style={{ height: "100%", width: `${gaugeVal}%`, background: gaugeColor, borderRadius: 3, transition: "width 0.6s" }} />
                          </div>
                        </div>

                        {/* Overall rating badge */}
                        <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: depthBg, color: depthColor, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>
                          {eq.overallDepthRating}
                        </span>

                        {/* Expand toggle */}
                        <svg style={{ width: 16, height: 16, color: "var(--mid)", flexShrink: 0, transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </div>

                      {/* Expanded content */}
                      {isOpen && (
                        <div style={{ borderTop: "1px solid var(--rule)", padding: "18px 18px 20px" }}>

                          {/* Summary */}
                          <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.65, marginBottom: 16, padding: "10px 14px", background: "var(--pane)", borderRadius: 10, borderLeft: `3px solid ${depthColor}` }}>
                            {eq.summary}
                          </div>

                          {/* Two-column: Strengths + Concerns */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                            <div style={{ background: "var(--green-bg)", border: "1px solid rgba(42,157,110,0.2)", borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", marginBottom: 8 }}>✅ STRENGTHS</div>
                              {(eq.strengths || []).length === 0
                                ? <div style={{ fontSize: 12, color: "var(--mid)" }}>None identified</div>
                                : (eq.strengths || []).map((s: string, i: number) => (
                                  <div key={i} style={{ fontSize: 12, color: "var(--ink)", marginBottom: 5, display: "flex", gap: 6 }}>
                                    <span style={{ color: "var(--green)", flexShrink: 0 }}>→</span>{s}
                                  </div>
                                ))}
                            </div>
                            <div style={{ background: "#fff8ed", border: "1px solid rgba(208,138,43,0.2)", borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", marginBottom: 8 }}>⚠ CONCERNS</div>
                              {(eq.concerns || []).length === 0
                                ? <div style={{ fontSize: 12, color: "var(--mid)" }}>None identified</div>
                                : (eq.concerns || []).map((c: string, i: number) => (
                                  <div key={i} style={{ fontSize: 12, color: "var(--ink)", marginBottom: 5, display: "flex", gap: 6 }}>
                                    <span style={{ color: "var(--amber)", flexShrink: 0 }}>→</span>{c}
                                  </div>
                                ))}
                            </div>
                          </div>

                          {/* Question-level analysis table */}
                          {(eq.questionAnalysis || []).length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", letterSpacing: "0.08em", marginBottom: 10 }}>QUESTION-BY-QUESTION DEPTH ANALYSIS</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {eq.questionAnalysis.map((qa: any, qi: number) => {
                                  const dlColor = qa.depthLevel === "Below" ? "#d08a2b" : qa.depthLevel === "Above" ? "#2563c0" : qa.depthLevel === "Beyond Syllabus" ? "#d94f4f" : "var(--green)";
                                  const dlBg = qa.depthLevel === "Below" ? "var(--amber-bg)" : qa.depthLevel === "Above" ? "var(--blue-bg)" : qa.depthLevel === "Beyond Syllabus" ? "#fff0f0" : "var(--green-bg)";
                                  const bloomColor = bloomColors[qa.bloomsLevel] || "var(--mid)";
                                  return (
                                    <div key={qi} style={{ border: "1.5px solid var(--rule)", borderRadius: 10, padding: "10px 14px", background: "var(--card)" }}>
                                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                        <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--lav-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--lavender)", flexShrink: 0 }}>Q{qi + 1}</div>
                                        <div style={{ flex: 1 }}>
                                          <div style={{ fontSize: 12, color: "var(--ink)", marginBottom: 6 }}>{qa.questionSnippet}</div>
                                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: dlBg, color: dlColor, fontWeight: 700 }}>{qa.depthLevel}</span>
                                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: `${bloomColor}18`, color: bloomColor, fontWeight: 700 }}>Bloom's: {qa.bloomsLevel}</span>
                                            {qa.ncertChapter && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "var(--pane)", color: "var(--mid)", border: "1px solid var(--rule)" }}>📖 {qa.ncertChapter}</span>}
                                          </div>
                                          {qa.concern && <div style={{ fontSize: 11, color: "#d08a2b", marginTop: 6, display: "flex", gap: 5 }}><span>⚠</span>{qa.concern}</div>}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Recommendations */}
                          {(eq.recommendations || []).length > 0 && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", letterSpacing: "0.08em", marginBottom: 8 }}>RECOMMENDATIONS</div>
                              {eq.recommendations.map((r: string, i: number) => (
                                <div key={i} style={{ fontSize: 12, color: "var(--ink)", marginBottom: 6, display: "flex", gap: 8, padding: "8px 12px", background: "var(--blue-bg)", borderRadius: 8 }}>
                                  <span style={{ color: "#2563c0", flexShrink: 0 }}>💡</span>{r}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── AI INSIGHTS TAB ── */}
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
