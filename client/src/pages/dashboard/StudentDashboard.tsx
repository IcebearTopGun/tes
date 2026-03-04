import "@/dashboard.css";
import ProfileDrawer from "@/components/ProfileDrawer";
import StudentTopNav from "@/components/student/StudentTopNav";
import CustomInsights from "@/components/CustomInsights";
import { useStudentDashboard } from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchJsonWithAuth } from "@/lib/fetcher";
import { getInitials } from "@/shared/utils/identity";
import { useLocation } from "wouter";
import { useStudentHomeworkWorkspace } from "@/features/student/homework/hooks/useStudentHomeworkWorkspace";
import { useStudentEvaluationsWorkspace } from "@/features/student/evaluations/hooks/useStudentEvaluationsWorkspace";

interface PerformanceProfile {
  strengths: string[];
  weak_chapters: { chapter: string; reason: string; score_pct: number }[];
  recurring_mistakes: string[];
  attendance_impact: string;
  performance_trend: string;
  recommended_focus_areas: string[];
}

interface RevisionData {
  chapter: string;
  subject: string;
  revision_focus: string;
  key_concepts: string[];
  practice_questions: { question_number: number; question: string; hint: string; marks: number }[];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const DOT_COLORS = ["var(--ink)", "var(--lavender)", "var(--lav-card)", "var(--blue)", "var(--green)"];

export default function StudentDashboard() {
  const { data, isLoading } = useStudentDashboard();
  const { user } = useAuth();
  const [location] = useLocation();
  const activeSection = new URLSearchParams(location.split("?")[1] || "").get("tab") === "ai-insights" ? "ai-insights" : "overview";

  const [revisionChapter, setRevisionChapter] = useState<{ chapter: string; subject: string } | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const { analyticsQuery } = useStudentHomeworkWorkspace();
  const { evaluationsQuery } = useStudentEvaluationsWorkspace();

  const { data: performanceProfile, isLoading: isProfileLoading, refetch: refetchProfile } = useQuery<PerformanceProfile>({
    queryKey: ["/api/student/performance-profile"],
    queryFn: () => fetchJsonWithAuth("/api/student/performance-profile"),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const { data: revisionData, isLoading: isRevisionLoading } = useQuery<RevisionData>({
    queryKey: ["/api/student/revision", revisionChapter?.chapter, revisionChapter?.subject],
    queryFn: () =>
      fetchJsonWithAuth(
        `/api/student/revision?chapter=${encodeURIComponent(revisionChapter!.chapter)}&subject=${encodeURIComponent(revisionChapter!.subject)}`,
      ),
    enabled: !!revisionChapter,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="sf-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const userName = (user as any)?.name || "Student";
  const firstName = userName.split(" ")[0];
  const initials = getInitials(userName);

  const marksOverview = data?.marksOverview || [];
  const improvementAreas = data?.improvementAreas || [];
  const examsCount = data?.assignments || 0;
  const performanceSummary = data?.performanceSummary || "";
  const evaluations = evaluationsQuery.data || [];
  const homeworkAnalytics = analyticsQuery.data;

  const avgScore = marksOverview.length > 0
    ? Math.round(marksOverview.reduce((sum: number, m: any) => sum + (m.score / m.total) * 100, 0) / marksOverview.length)
    : 0;

  const classRank = data?.classRank ?? null;
  const classTotal = data?.classTotal ?? 0;
  const classAvg = data?.classAvg ?? 0;
  const leaderboard = data?.leaderboard ?? [];

  const scoreBars = marksOverview.length > 0
    ? marksOverview.map((m: any, i: number) => ({
        name: m.subject,
        pct: Math.round((m.score / m.total) * 100),
        label: `${m.score}/${m.total}`,
        color: DOT_COLORS[i % DOT_COLORS.length],
        barColor: DOT_COLORS[i % DOT_COLORS.length],
        amber: Math.round((m.score / m.total) * 100) < 75,
      }))
    : [];

  const hasEvals = examsCount > 0;

  const aiInsight = performanceSummary
    ? `🤖 AI Insight: ${performanceSummary}`
    : `🤖 AI Insight: You completed ${examsCount} exam${examsCount !== 1 ? "s" : ""} with ${avgScore}% average. ${improvementAreas[0] ? `Reviewing ${improvementAreas[0]} could significantly boost your score.` : "Keep up the momentum with regular revisions."}`;

  const focusItems = improvementAreas.length > 0
    ? improvementAreas.slice(0, 3).map((area: string, i: number) => ({
        icon: i === 0 ? "🔴" : i === 1 ? "🟡" : "🟢",
        cls: i === 0 ? "sf-fi-r" : i === 1 ? "sf-fi-a" : "sf-fi-g",
        prio: i === 0 ? "High" : i === 1 ? "Medium" : "",
        prioCls: i === 0 ? "sf-fp-r" : i === 1 ? "sf-fp-a" : "",
        subject: area.includes(":") ? area.split(":")[0] : "General",
        text: area.includes(":") ? area.split(":")[1]?.trim() : area,
      }))
    : [];

  const weakChips = performanceProfile?.weak_chapters.slice(0, 3).map(wc => ({ label: `↓ ${wc.chapter}`, cls: "sf-ch-r" })) || [];
  const strengthChips = performanceProfile?.strengths.slice(0, 3).map(s => ({ label: `✓ ${s}`, cls: "sf-ch-g" })) || [];
  const midChips = avgScore > 0 ? [{ label: `~ Current Avg (${avgScore}%)`, cls: "sf-ch-a" }] : [];
  const allChips = [...strengthChips, ...midChips, ...weakChips];

  const homeworkPct = homeworkAnalytics?.totalAssigned
    ? Math.round((homeworkAnalytics.totalSubmitted / homeworkAnalytics.totalAssigned) * 100)
    : 0;

  const radarLabelsRaw = scoreBars.map((s) => s.name).slice(0, 6);
  while (radarLabelsRaw.length < 6) radarLabelsRaw.push(`Axis ${radarLabelsRaw.length + 1}`);
  const radarScores = scoreBars.map((s) => s.pct).slice(0, 6);
  while (radarScores.length < 6) radarScores.push(avgScore || 0);
  const radarAngles = [0, 60, 120, 180, 240, 300];
  const pointAt = (score: number, angle: number, rMax = 56) => {
    const radius = (Math.max(0, Math.min(100, score)) / 100) * rMax;
    const rad = (Math.PI / 180) * (angle - 90);
    const x = 87.5 + radius * Math.cos(rad);
    const y = 87.5 + radius * Math.sin(rad);
    return `${x},${y}`;
  };
  const radarPolygonPoints = radarScores.map((score, i) => pointAt(score, radarAngles[i])).join(" ");
  const radarNodes = radarScores.map((score, i) => {
    const [x, y] = pointAt(score, radarAngles[i]).split(",").map(Number);
    return { x, y };
  });

  const examFeedback = {
    avatarLetter: marksOverview[0]?.subject?.[0]?.toUpperCase() || "E",
    name: evaluations[0]?.examName || "Latest Evaluation",
    date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    tag: "AI Evaluation",
    quote: evaluations[0]?.overallFeedback || performanceSummary || "No detailed feedback available yet.",
    stars: avgScore >= 80 ? 4 : avgScore >= 60 ? 3 : 2,
    scoreText: avgScore >= 80 ? "4/5 · Great work" : avgScore >= 60 ? "3/5 · Good progress" : "2/5 · Keep improving",
  };

  return (
    <div className="sf-root">
      <StudentTopNav activeTab={activeSection} initials={initials} onProfileClick={() => setIsProfilePanelOpen(true)} />

      {/* PAGE */}
      <div className="sf-page">
        {activeSection === "overview" && (
          <>
        <div className="sf-page-head">
          <div>
            <div className="sf-page-title">{getGreeting()}, {firstName}.</div>
            <div className="sf-page-sub">{new Date().toDateString()} &nbsp;·&nbsp; Your personal academic performance overview</div>
          </div>
        </div>

        {/* FUNNEL ROW */}
        <div className="sf-funnel sf-funnel-5">
          <div className="sf-f-col">
            <div className="sf-f-cat">Avg Score</div>
            <div className="sf-f-num">{avgScore}%</div>
            <div className="sf-f-delta sf-d-flat">→ Current Performance</div>
            <div className="sf-f-desc">Average across <b>{examsCount} evaluated exam{examsCount !== 1 ? "s" : ""}</b>.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Class Rank</div>
            <div className="sf-f-num">{classRank ? `#${classRank}` : "—"}</div>
            <div className="sf-f-delta sf-d-flat">{classRank ? "✓ Live ranking" : "→ Awaiting class data"}</div>
            <div className="sf-f-desc">Out of <b>{classTotal || 0} students</b> in your class.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Exams Done</div>
            <div className="sf-f-num">{examsCount}</div>
            <div className="sf-f-delta sf-d-flat">✓ Evaluated</div>
            <div className="sf-f-desc">{examsCount} exam{examsCount !== 1 ? "s" : ""} graded by AI.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Homework</div>
            <div className="sf-f-num">{homeworkPct}%</div>
            <div className="sf-f-delta sf-d-flat">✓ {homeworkAnalytics?.totalSubmitted || 0} of {homeworkAnalytics?.totalAssigned || 0} submitted</div>
            <div className="sf-f-desc"><b>{Math.max((homeworkAnalytics?.totalAssigned || 0) - (homeworkAnalytics?.totalSubmitted || 0), 0)} pending</b> homework items.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Focus Areas</div>
            <div className="sf-f-num">{improvementAreas.length}</div>
            <div className="sf-f-delta sf-d-dn">{improvementAreas.length > 0 ? "↓ Needs work" : "✓ Stable"}</div>
            <div className="sf-f-desc">Topics flagged by AI tutor for revision.</div>
          </div>
        </div>

        {/* RANKING CARD */}
        <div className="sf-rank-card">
          <span className="sf-rank-trophy">🏆</span>
          <div className="sf-rank-info">
            <div className="sf-rank-label">Your Class Ranking</div>
            <div className="sf-rank-num">{classRank ? `#${classRank}` : "—"}</div>
            <div className="sf-rank-sub">Out of {classTotal || 0} students</div>
          </div>
          <div className="sf-rank-divider" />
          <div className="sf-rank-stat">
            <div className="sf-rank-stat-num">{avgScore}%</div>
            <div className="sf-rank-stat-lbl">Your score</div>
          </div>
          <div className="sf-rank-divider" />
          <div className="sf-rank-stat">
            <div className="sf-rank-stat-num">{classAvg}%</div>
            <div className="sf-rank-stat-lbl">Class avg</div>
          </div>
          <div className="sf-rank-divider" />
          <div className="sf-leaderboard">
            {(leaderboard || []).map((lb, i) => (
              <div key={i} className={`sf-lb-item${lb.me ? " me" : ""}`}>
                <div className="sf-lb-rank">{lb.rank}</div>
                <div className="sf-lb-av" style={lb.me ? { background: "rgba(200,194,232,0.3)" } : undefined}>{lb.initials}</div>
                <div className="sf-lb-name">{lb.name}</div>
                <div className="sf-lb-score">{lb.score}%</div>
              </div>
            ))}
            {leaderboard.length === 0 && <div className="sf-empty" style={{ margin: 0, padding: "10px 0" }}>Ranking will appear after class evaluations are available.</div>}
          </div>
        </div>

        {/* 2-COL GRID */}
        <div className="sf-grid2">
          {/* Academic Summary */}
          <div className="sf-card">
            <div className="sf-card-title">Academic Summary</div>
            <div className="sf-card-sub">Performance report</div>
            <div className="sf-ai-note" data-testid="text-performance-summary">{aiInsight}</div>
            <div className="sf-sec-lbl">Score Breakdown</div>
            {scoreBars.length === 0 && <div className="sf-empty" style={{ margin: 0, padding: "10px 0" }}>No evaluated marks available yet.</div>}
            {scoreBars.map((bar, i) => (
              <div key={i} className="sf-sbar">
                <div className="sf-sbar-top">
                  <div className="sf-sbar-name">
                    <span className="sf-sbar-dot" style={{ background: bar.color }} />
                    {bar.name}
                  </div>
                  <div className="sf-sbar-val" style={bar.pct > 0 && bar.amber ? { color: "var(--amber)", fontWeight: 700 } : { color: "var(--dim)" }}>
                    {bar.pct > 0 ? `${bar.label} · ${bar.pct}%` : bar.label}
                  </div>
                </div>
                <div className="sf-sbar-track">
                  <div className="sf-sbar-fill" style={{ width: `${bar.pct}%`, background: bar.barColor }} />
                </div>
              </div>
            ))}
          </div>

          {/* AI Performance Profile (Radar) */}
          <div className="sf-card">
            <div className="sf-card-title">AI Performance Profile</div>
            <div className="sf-card-sub">Skill radar from your exam answers</div>
            {isProfileLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <Skeleton style={{ width: 175, height: 175, borderRadius: "50%" }} />
              </div>
            ) : (
              <div className="sf-radar-wrap">
                <svg width="175" height="175" viewBox="0 0 175 175">
                  <polygon points="87.5,16 136,47 136,108 87.5,139 39,108 39,47" fill="none" stroke="var(--cream2)" strokeWidth="1.5"/>
                  <polygon points="87.5,36 120,57 120,98 87.5,119 55,98 55,57" fill="none" stroke="var(--cream2)" strokeWidth="1.5"/>
                  <polygon points="87.5,57 103,67 103,88 87.5,98 72,88 72,67" fill="none" stroke="var(--cream2)" strokeWidth="1.5"/>
                  <line x1="87.5" y1="16" x2="87.5" y2="87.5" stroke="var(--cream2)" strokeWidth="1"/>
                  <line x1="136" y1="47" x2="87.5" y2="87.5" stroke="var(--cream2)" strokeWidth="1"/>
                  <line x1="136" y1="108" x2="87.5" y2="87.5" stroke="var(--cream2)" strokeWidth="1"/>
                  <line x1="87.5" y1="139" x2="87.5" y2="87.5" stroke="var(--cream2)" strokeWidth="1"/>
                  <line x1="39" y1="108" x2="87.5" y2="87.5" stroke="var(--cream2)" strokeWidth="1"/>
                  <line x1="39" y1="47" x2="87.5" y2="87.5" stroke="var(--cream2)" strokeWidth="1"/>
                  <polygon points={radarPolygonPoints} fill="rgba(200,194,232,0.3)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round"/>
                  {radarNodes.map((n, i) => (
                    <circle key={i} cx={n.x} cy={n.y} r="3.5" fill="var(--ink)" stroke="var(--white)" strokeWidth="2"/>
                  ))}
                  <text x="87.5" y="9"   textAnchor="middle" fill="var(--mid)" fontSize="10" fontFamily="DM Sans">{radarLabelsRaw[0]}</text>
                  <text x="148"  y="51"  textAnchor="start"  fill="var(--mid)" fontSize="10" fontFamily="DM Sans">{radarLabelsRaw[1]}</text>
                  <text x="148"  y="113" textAnchor="start"  fill="var(--mid)" fontSize="10" fontFamily="DM Sans">{radarLabelsRaw[2]}</text>
                  <text x="87.5" y="154" textAnchor="middle" fill="var(--mid)" fontSize="10" fontFamily="DM Sans">{radarLabelsRaw[3]}</text>
                  <text x="27"   y="113" textAnchor="end"    fill="var(--mid)" fontSize="10" fontFamily="DM Sans">{radarLabelsRaw[4]}</text>
                  <text x="27"   y="51"  textAnchor="end"    fill="var(--mid)" fontSize="10" fontFamily="DM Sans">{radarLabelsRaw[5]}</text>
                </svg>
              </div>
            )}
            <div className="sf-sec-lbl">Skill Profile</div>
            <div className="sf-chips">
              {allChips.map((chip, i) => (
                <span key={i} className={`sf-chip ${chip.cls}`}>{chip.label}</span>
              ))}
            </div>
            {allChips.length === 0 && <div className="sf-empty" style={{ margin: 0, padding: "10px 0" }}>Profile insights will appear after evaluation analysis.</div>}
            {hasEvals && (
              <div style={{ marginTop: 14 }}>
                <button
                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: 9, padding: "5px 12px", fontSize: 11, color: "var(--mid)", cursor: "pointer", fontFamily: "DM Sans, sans-serif", transition: "all .18s" }}
                  onClick={() => refetchProfile()}
                  data-testid="button-refresh-profile"
                >
                  ↻ Refresh Analysis
                </button>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ROW */}
        <div className="sf-bottom">
          {/* Focus Areas */}
          <div className="sf-card">
            <div className="sf-card-title">AI Focus Areas</div>
            <div className="sf-card-sub">Topics to review before your next exam</div>
            {focusItems.length === 0 && <div className="sf-empty" style={{ margin: 0, padding: "10px 0" }}>No specific focus areas detected from current data.</div>}
            {focusItems.map((item, i) => (
              <div key={i} className="sf-fitem" data-testid={`item-improvement-${i}`}>
                <div className={`sf-fitem-ico ${item.cls}`}>{item.icon}</div>
                <div>
                  <div className="sf-fitem-subj">
                    {item.subject}
                    {item.prio && <span className={`sf-fprio ${item.prioCls}`}>{item.prio}</span>}
                  </div>
                  <div className="sf-fitem-text">{item.text}</div>
                </div>
              </div>
            ))}
            {/* Weak chapters as practice buttons */}
            {hasEvals && performanceProfile && performanceProfile.weak_chapters.length > 0 && (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div className="sf-sec-lbl" style={{ marginBottom: 8 }}>Weak Chapters — Practice</div>
                {performanceProfile.weak_chapters.slice(0, 3).map((wc, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{wc.chapter}</span>
                      <span style={{ fontSize: 11, color: "var(--mid)", marginLeft: 8 }}>{wc.score_pct}%</span>
                    </div>
                    <button
                      onClick={() => setRevisionChapter({ chapter: wc.chapter, subject: marksOverview[0]?.subject || "General" })}
                      style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "var(--mid)", cursor: "pointer", fontFamily: "DM Sans, sans-serif", transition: "all .15s" }}
                      data-testid={`button-practice-${i}`}
                    >
                      <BookOpen style={{ width: 12, height: 12 }} /> Practice
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exam Feedback */}
          <div className="sf-card">
            <div className="sf-card-title">Exam Feedback</div>
            <div className="sf-card-sub">AI-generated evaluation</div>
            {examsCount > 0 ? (
              <div className="sf-fb-item">
                <div className="sf-fb-hd">
                  <div className="sf-fb-meta">
                    <div className="sf-fb-av">{examFeedback.avatarLetter}</div>
                    <div>
                      <div className="sf-fb-nm">{examFeedback.name}</div>
                      <div className="sf-fb-dt">{examFeedback.date}</div>
                    </div>
                  </div>
                  <span className="sf-fb-tag">{examFeedback.tag}</span>
                </div>
                <div className="sf-fb-quote">{examFeedback.quote}</div>
                <div className="sf-fb-score">
                  <span className="sf-fb-score-lbl">Overall</span>
                  <div className="sf-stars">
                    {[1,2,3,4,5].map(n => (
                      <span key={n} className={n <= examFeedback.stars ? "sf-s-on" : "sf-s-off"}>★</span>
                    ))}
                  </div>
                  <span className="sf-fb-score-txt">{examFeedback.scoreText}</span>
                </div>
              </div>
            ) : (
              <div className="sf-empty" style={{ padding: "32px 0" }}>
                <div className="sf-empty-icon">📝</div>
                No evaluated exams yet. Your feedback will appear here once a teacher evaluates your answer sheets.
              </div>
            )}

            {/* AI Profile Performance Trend */}
            {hasEvals && performanceProfile && (
              <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--lav-bg)", borderRadius: 11, fontSize: 12.5, lineHeight: 1.6, color: "var(--ink2)" }}>
                <b>📈 Performance Trend:</b> {performanceProfile.performance_trend}
              </div>
            )}
          </div>
        </div>

        {/* ADAPTIVE REVISION PANEL — only in overview */}
        <AnimatePresence>
          {revisionChapter && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              style={{ marginTop: 20, borderRadius: 18, border: "1px solid var(--border)", boxShadow: "var(--shadow2)", overflow: "hidden" }}
            >
              <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, rgba(220,216,242,0.3), rgba(207,201,236,0.2))", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <BookOpen style={{ width: 16, height: 16, color: "var(--blue)" }} /> Practice: {revisionChapter.chapter}
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--mid)", marginTop: 3 }}>AI-generated revision questions based on your gaps</p>
                </div>
                <button onClick={() => setRevisionChapter(null)} style={{ width: 32, height: 32, border: "none", background: "var(--cream)", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} data-testid="button-close-revision">
                  <X style={{ width: 14, height: 14, color: "var(--mid)" }} />
                </button>
              </div>
              <div style={{ padding: "20px 24px", background: "var(--white)" }}>
                {isRevisionLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <Skeleton style={{ height: 16, width: "60%", marginBottom: 12 }} />
                    <Skeleton style={{ height: 80, width: "100%", marginBottom: 8 }} />
                    <Skeleton style={{ height: 80, width: "100%" }} />
                  </div>
                ) : revisionData ? (
                  <>
                    <div style={{ padding: "12px 14px", background: "rgba(37,99,192,0.07)", borderRadius: 10, border: "1px solid rgba(37,99,192,0.12)", marginBottom: 16 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--blue)", marginBottom: 4 }}>Revision Focus</p>
                      <p style={{ fontSize: 13, color: "var(--ink2)" }}>{revisionData.revision_focus}</p>
                    </div>
                    {revisionData.key_concepts?.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div className="sf-sec-lbl">Key Concepts</div>
                        <div className="sf-chips">
                          {revisionData.key_concepts.map((c, i) => <span key={i} className="sf-chip sf-ch-a">{c}</span>)}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="sf-sec-lbl">Practice Questions</div>
                      {revisionData.practice_questions?.map((q, i) => (
                        <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 8 }} data-testid={`practice-q-${i}`}>
                          <button
                            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "DM Sans, sans-serif" }}
                            onClick={() => setExpandedQuestion(expandedQuestion === i ? null : i)}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                              <span style={{ fontWeight: 700, color: "var(--blue)", flexShrink: 0, fontSize: 13 }}>Q{q.question_number}.</span>
                              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{q.question}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                              <span style={{ fontSize: 10, background: "var(--lav-bg)", color: "var(--ink2)", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{q.marks}m</span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mid)" strokeWidth="2">{expandedQuestion === i ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}</svg>
                            </div>
                          </button>
                          {expandedQuestion === i && (
                            <div style={{ padding: "12px 16px", paddingTop: 0, borderTop: "1px solid var(--border)", background: "var(--cream)" }}>
                              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--dim)", marginBottom: 4 }}>Hint</p>
                              <p style={{ fontSize: 12.5, color: "var(--mid)", lineHeight: 1.5 }}>{q.hint}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--mid)", textAlign: "center", padding: "24px 0" }}>No revision data available for this chapter.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
          </>
        )}

        {activeSection === "ai-insights" && (
          <div className="sf-panel">
            <CustomInsights role="student" />
          </div>
        )}

        <ProfileDrawer open={isProfilePanelOpen} onClose={() => setIsProfilePanelOpen(false)} />
      </div>
    </div>
  );
}
