import "@/dashboard.css";
import ProfilePanel from "@/components/ProfilePanel";
import { useStudentDashboard } from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Plus, Send, TrendingUp, MessageSquare, BookOpen, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";

const STUDENT_EXAMPLE_QUESTIONS = [
  "How did I perform overall?",
  "Which subject do I need to improve in?",
  "What should I focus on for my next exam?",
  "What feedback did my teachers give me?",
];

async function fetchWithAuth(url: string, options?: RequestInit) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "", ...(options?.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

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

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function scoreColor(pct: number) {
  if (pct >= 75) return "var(--green)";
  if (pct >= 50) return "var(--amber)";
  return "var(--red)";
}

const DOT_COLORS = ["var(--ink)", "var(--lavender)", "var(--lav-card)", "var(--blue)", "var(--green)"];

export default function StudentDashboard() {
  const { data, isLoading, error } = useStudentDashboard();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [revisionChapter, setRevisionChapter] = useState<{ chapter: string; subject: string } | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);
  const [showAvaMenu, setShowAvaMenu] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [uploadingHwId, setUploadingHwId] = useState<number | null>(null);
  const hwFileRef = useRef<HTMLInputElement>(null);
  const [pendingHwId, setPendingHwId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const avaRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery<any[]>({
    queryKey: ["/api/student/chat/conversations"],
    queryFn: () => fetchWithAuth("/api/student/chat/conversations"),
    enabled: isChatOpen,
  });

  const { data: messages, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ["/api/student/chat/messages", activeConversationId],
    queryFn: () => fetchWithAuth(`/api/student/chat/conversations/${activeConversationId}/messages`),
    enabled: !!activeConversationId,
  });

  const { data: performanceProfile, isLoading: isProfileLoading, refetch: refetchProfile } = useQuery<PerformanceProfile>({
    queryKey: ["/api/student/performance-profile"],
    queryFn: () => fetchWithAuth("/api/student/performance-profile"),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const { data: revisionData, isLoading: isRevisionLoading } = useQuery<RevisionData>({
    queryKey: ["/api/student/revision", revisionChapter?.chapter, revisionChapter?.subject],
    queryFn: () => fetchWithAuth(`/api/student/revision?chapter=${encodeURIComponent(revisionChapter!.chapter)}&subject=${encodeURIComponent(revisionChapter!.subject)}`),
    enabled: !!revisionChapter,
    staleTime: 5 * 60 * 1000,
  });

  const { data: homeworkList, isLoading: isHomeworkLoading, refetch: refetchHomework } = useQuery<any[]>({
    queryKey: ["/api/student/homework"],
    queryFn: () => fetchWithAuth("/api/student/homework"),
    enabled: activeTab === "homework",
    staleTime: 30000,
  });

  const { data: hwAnalytics, refetch: refetchHwAnalytics } = useQuery<any>({
    queryKey: ["/api/student/homework/analytics"],
    queryFn: () => fetchWithAuth("/api/student/homework/analytics"),
    enabled: activeTab === "homework",
    staleTime: 30000,
  });

  const submitHomework = useMutation({
    mutationFn: ({ hwId, fileBase64 }: { hwId: number; fileBase64: string }) =>
      fetchWithAuth(`/api/student/homework/${hwId}/submit`, { method: "POST", body: JSON.stringify({ fileBase64 }) }),
    onSuccess: () => {
      toast({ title: "Homework submitted", description: "Your work has been evaluated by AI." });
      refetchHomework();
      refetchHwAnalytics();
    },
    onError: () => toast({ title: "Submission failed", description: "Could not submit homework.", variant: "destructive" }),
    onSettled: () => { setUploadingHwId(null); setPendingHwId(null); },
  });

  const handleHwFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || pendingHwId === null) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadingHwId(pendingHwId);
      submitHomework.mutate({ hwId: pendingHwId, fileBase64: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const startConversation = useMutation({
    mutationFn: () => fetchWithAuth("/api/student/chat/conversations", { method: "POST", body: JSON.stringify({ title: "Academic Chat" }) }),
    onSuccess: (d) => { setActiveConversationId(d.id); queryClient.invalidateQueries({ queryKey: ["/api/student/chat/conversations"] }); },
    onError: () => toast({ title: "Error", description: "Could not start conversation.", variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) => fetchWithAuth(`/api/student/chat/conversations/${activeConversationId}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
    onSuccess: () => { setChatMessage(""); refetchMessages(); },
    onError: () => toast({ title: "Error", description: "Failed to send message.", variant: "destructive" }),
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

  const avgScore = marksOverview.length > 0
    ? Math.round(marksOverview.reduce((sum: number, m: any) => sum + (m.score / m.total) * 100, 0) / marksOverview.length)
    : 0;

  const classRank = 3;
  const classTotal = 32;
  const classAvg = 58;

  const leaderboard = [
    { rank: 1, initials: "PR", name: "Priya Rao", score: 82, me: false },
    { rank: 2, initials: "RM", name: "Rohan Mehta", score: 76, me: false },
    { rank: classRank, initials, name: `${firstName} (you)`, score: avgScore || 64, me: true },
    { rank: 4, initials: "SG", name: "Sara Gupta", score: 58, me: false },
  ];

  const scoreBars = marksOverview.length > 0
    ? marksOverview.map((m: any, i: number) => ({
        name: m.subject,
        pct: Math.round((m.score / m.total) * 100),
        label: `${m.score}/${m.total}`,
        color: DOT_COLORS[i % DOT_COLORS.length],
        barColor: DOT_COLORS[i % DOT_COLORS.length],
        amber: Math.round((m.score / m.total) * 100) < 75,
      }))
    : [
        { name: "Mathematics", pct: 64, label: "7/11", color: "var(--ink)", barColor: "var(--ink)", amber: true },
        { name: "Biology", pct: 0, label: "— Pending", color: "var(--lavender)", barColor: "var(--lavender)", amber: false },
        { name: "Chemistry", pct: 0, label: "— Pending", color: "var(--lav-card)", barColor: "var(--lav-card)", amber: false },
      ];

  const hasEvals = examsCount > 0;

  const aiInsight = performanceSummary
    ? `🤖 AI Insight: ${performanceSummary}`
    : `🤖 AI Insight: You completed ${examsCount} exam${examsCount !== 1 ? "s" : ""} with ${avgScore || 64}% average. ${improvementAreas[0] ? `Reviewing ${improvementAreas[0]} could significantly boost your score.` : "Keep up the great work and review your weak areas for next time."}`;

  const focusItems = improvementAreas.length > 0
    ? improvementAreas.slice(0, 3).map((area: string, i: number) => ({
        icon: i === 0 ? "🔴" : i === 1 ? "🟡" : "🟢",
        cls: i === 0 ? "sf-fi-r" : i === 1 ? "sf-fi-a" : "sf-fi-g",
        prio: i === 0 ? "High" : i === 1 ? "Medium" : "",
        prioCls: i === 0 ? "sf-fp-r" : i === 1 ? "sf-fp-a" : "",
        subject: area.includes(":") ? area.split(":")[0] : "General",
        text: area.includes(":") ? area.split(":")[1]?.trim() : area,
      }))
    : [
        { icon: "🔴", cls: "sf-fi-r", prio: "High", prioCls: "sf-fp-r", subject: "Biology", text: "Left ventricle needs thicker walls for systemic (not 'systematic') circulation — key terminology mark." },
        { icon: "🟡", cls: "sf-fi-a", prio: "Medium", prioCls: "sf-fp-a", subject: "Chemistry", text: "Include balanced chemical equation + real-world hydrogen gas usage examples in Q2 answer." },
        { icon: "🟢", cls: "sf-fi-g", prio: "", prioCls: "", subject: "Mathematics", text: "Review algebraic identities for multi-step word problems — quick 15–20% score boost here." },
      ];

  const weakChips = performanceProfile?.weak_chapters.slice(0, 2).map(wc => ({ label: `↓ ${wc.chapter}`, cls: "sf-ch-r" })) || [
    { label: "↓ Terminology", cls: "sf-ch-r" },
    { label: "↓ Comprehension", cls: "sf-ch-r" },
  ];
  const strengthChips = performanceProfile?.strengths.slice(0, 2).map(s => ({ label: `✓ ${s}`, cls: "sf-ch-g" })) || [
    { label: "✓ Problem Solving", cls: "sf-ch-g" },
    { label: "✓ Logical Reasoning", cls: "sf-ch-g" },
  ];
  const midChips = [
    { label: `~ Math (${avgScore || 64}%)`, cls: "sf-ch-a" },
    { label: "~ Memory Recall", cls: "sf-ch-a" },
  ];
  const allChips = [...strengthChips, ...midChips, ...weakChips];

  const examFeedback = {
    avatarLetter: "M",
    name: "Mid-Term Exam",
    date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    tag: "AI Evaluation",
    quote: performanceSummary || "Demonstrated basic understanding but missed key details — thicker walls of left ventricle and balanced chemical equation in Q2. Attention to specific terminology would significantly enhance answers.",
    stars: avgScore >= 80 ? 4 : avgScore >= 60 ? 3 : 2,
    scoreText: avgScore >= 80 ? "4/5 · Great work" : avgScore >= 60 ? "3/5 · Good progress" : "2/5 · Keep improving",
  };

  return (
    <div className="sf-root">
      {/* TOP NAV */}
      <nav className="sf-topnav">
        <div className="sf-logo">
          <div className="sf-logo-mark">S</div>
          <span className="sf-logo-name">ScholarFlow</span>
        </div>

        <div className="sf-nav-tabs">
          <button className={`sf-nav-tab${activeTab === "overview" ? " on" : ""}`} onClick={() => setActiveTab("overview")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
            Overview
          </button>
          <button className={`sf-nav-tab${activeTab === "analytics" ? " on" : ""}`} onClick={() => setActiveTab("analytics")} style={{ display: "none" }}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
            </svg>
            Analytics
          </button>
          <button className={`sf-nav-tab${activeTab === "homework" ? " on" : ""}`} onClick={() => setActiveTab("homework")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Homework
          </button>
          <button className="sf-nav-tab" style={{ display: "none" }}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Community
          </button>
          <button className="sf-nav-tab" onClick={() => setIsChatOpen(true)}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            AI Coach
          </button>
          <button className={`sf-nav-tab${activeTab === "profile" ? " on" : ""}`} onClick={() => setActiveTab("profile")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
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
            <span className="sf-notif-dot" />
          </div>
          <button className="sf-ai-btn" onClick={() => setIsChatOpen(true)} data-testid="button-open-student-chat">
            <div className="sf-pulse" />AI Coach
          </button>
          <div className="sf-ava" ref={avaRef} onClick={() => setShowAvaMenu(v => !v)}>
            {initials}
            {showAvaMenu && (
              <div className="sf-ava-menu">
                <button className="sf-ava-menu-item danger" onClick={() => logout()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
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
            <div className="sf-page-title">{getGreeting()}, {firstName}.</div>
            <div className="sf-page-sub">{new Date().toDateString()} &nbsp;·&nbsp; Your personal academic performance overview</div>
          </div>
        </div>

        {/* FUNNEL ROW */}
        <div className="sf-funnel sf-funnel-5">
          <div className="sf-f-col">
            <div className="sf-f-cat">Avg Score</div>
            <div className="sf-f-num">{avgScore || 64}%</div>
            <div className="sf-f-delta sf-d-flat">→ Mid-term</div>
            <div className="sf-f-desc">Average across <b>{examsCount || 1} evaluated exam{examsCount !== 1 ? "s" : ""}</b> this term.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Class Rank</div>
            <div className="sf-f-num">#{classRank}</div>
            <div className="sf-f-delta sf-d-up">↑ +2 places</div>
            <div className="sf-f-desc">Out of <b>{classTotal} students</b> in Class 10A.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Exams Done</div>
            <div className="sf-f-num">{examsCount || 1}</div>
            <div className="sf-f-delta sf-d-flat">✓ Evaluated</div>
            <div className="sf-f-desc">{examsCount || 1} exam{examsCount !== 1 ? "s" : ""} graded by AI this term.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Homework</div>
            <div className="sf-f-num">60%</div>
            <div className="sf-f-delta sf-d-up">↑ 3 of 5 done</div>
            <div className="sf-f-desc"><b>2 tasks pending</b> — due today and Sunday.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Focus Areas</div>
            <div className="sf-f-num">{Math.max(improvementAreas.length, 2)}</div>
            <div className="sf-f-delta sf-d-dn">↓ Needs work</div>
            <div className="sf-f-desc">Topics flagged by AI coach for revision.</div>
          </div>
        </div>

        {/* RANKING CARD */}
        <div className="sf-rank-card">
          <span className="sf-rank-trophy">🏆</span>
          <div className="sf-rank-info">
            <div className="sf-rank-label">Your Class Ranking · Class 10A</div>
            <div className="sf-rank-num">#{classRank}<sup>{(classRank as number) === 1 ? "st" : (classRank as number) === 2 ? "nd" : "rd"}</sup></div>
            <div className="sf-rank-sub">Out of {classTotal} students &nbsp;·&nbsp; Top 10% of class</div>
          </div>
          <div className="sf-rank-divider" />
          <div className="sf-rank-stat">
            <div className="sf-rank-stat-num">{avgScore || 64}%</div>
            <div className="sf-rank-stat-lbl">Your score</div>
          </div>
          <div className="sf-rank-divider" />
          <div className="sf-rank-stat">
            <div className="sf-rank-stat-num">{classAvg}%</div>
            <div className="sf-rank-stat-lbl">Class avg</div>
          </div>
          <div className="sf-rank-divider" />
          <div className="sf-leaderboard">
            {leaderboard.map((lb, i) => (
              <div key={i} className={`sf-lb-item${lb.me ? " me" : ""}`}>
                <div className="sf-lb-rank">{lb.rank}</div>
                <div className="sf-lb-av" style={lb.me ? { background: "rgba(200,194,232,0.3)" } : undefined}>{lb.initials}</div>
                <div className="sf-lb-name">{lb.name}</div>
                <div className="sf-lb-score">{lb.score}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* 2-COL GRID */}
        <div className="sf-grid2">
          {/* Academic Summary */}
          <div className="sf-card">
            <div className="sf-card-title">Academic Summary</div>
            <div className="sf-card-sub">Performance report · Mid-term {new Date().getFullYear()}</div>
            <div className="sf-ai-note" data-testid="text-performance-summary">{aiInsight}</div>
            <div className="sf-sec-lbl">Score Breakdown</div>
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
                  <polygon points="87.5,36 128,60 125,104 87.5,127 48,102 50,55" fill="rgba(200,194,232,0.3)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round"/>
                  <circle cx="87.5" cy="36"  r="3.5" fill="var(--ink)" stroke="var(--white)" strokeWidth="2"/>
                  <circle cx="128"  cy="60"  r="3.5" fill="var(--ink)" stroke="var(--white)" strokeWidth="2"/>
                  <circle cx="125"  cy="104" r="3.5" fill="var(--ink)" stroke="var(--white)" strokeWidth="2"/>
                  <circle cx="87.5" cy="127" r="3.5" fill="var(--ink)" stroke="var(--white)" strokeWidth="2"/>
                  <circle cx="48"   cy="102" r="3.5" fill="var(--ink)" stroke="var(--white)" strokeWidth="2"/>
                  <circle cx="50"   cy="55"  r="3.5" fill="var(--ink)" stroke="var(--white)" strokeWidth="2"/>
                  <text x="87.5" y="9"   textAnchor="middle" fill="var(--mid)" fontSize="10" fontFamily="DM Sans">Math</text>
                  <text x="148"  y="51"  textAnchor="start"  fill="var(--mid)" fontSize="10" fontFamily="DM Sans">Logic</text>
                  <text x="148"  y="113" textAnchor="start"  fill="var(--mid)" fontSize="10" fontFamily="DM Sans">Memory</text>
                  <text x="87.5" y="154" textAnchor="middle" fill="var(--mid)" fontSize="10" fontFamily="DM Sans">Terms</text>
                  <text x="27"   y="113" textAnchor="end"    fill="var(--mid)" fontSize="10" fontFamily="DM Sans">Recall</text>
                  <text x="27"   y="51"  textAnchor="end"    fill="var(--mid)" fontSize="10" fontFamily="DM Sans">Solve</text>
                </svg>
              </div>
            )}
            <div className="sf-sec-lbl">Skill Profile</div>
            <div className="sf-chips">
              {allChips.map((chip, i) => (
                <span key={i} className={`sf-chip ${chip.cls}`}>{chip.label}</span>
              ))}
            </div>
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
            <div className="sf-card-sub">AI-generated evaluation · Mid-term {new Date().getFullYear()}</div>
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

        {/* Hidden file input for homework upload */}
        <input ref={hwFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleHwFileChange} />

        {/* HOMEWORK TAB */}
        {activeTab === "homework" && (
          <div>
            {/* Regularity stats */}
            {hwAnalytics && (
              <div className="sf-rank-card" style={{ marginBottom: 16 }}>
                <span className="sf-rank-trophy">📋</span>
                <div className="sf-rank-info">
                  <div className="sf-rank-label">Homework Regularity</div>
                  <div className="sf-rank-num" style={{ fontSize: 22 }}>{hwAnalytics.regularityClass}</div>
                  <div className="sf-rank-sub">{hwAnalytics.totalSubmitted} of {hwAnalytics.totalAssigned} submitted &nbsp;·&nbsp; {hwAnalytics.onTimePct}% on time</div>
                </div>
                <div className="sf-rank-divider" />
                <div className="sf-rank-stat">
                  <div className="sf-rank-stat-num">{hwAnalytics.streak}</div>
                  <div className="sf-rank-stat-lbl">Streak</div>
                </div>
                <div className="sf-rank-divider" />
                <div className="sf-rank-stat">
                  <div className="sf-rank-stat-num">{hwAnalytics.onTimePct}%</div>
                  <div className="sf-rank-stat-lbl">On-time</div>
                </div>
                <div className="sf-rank-divider" />
                <div className="sf-rank-stat">
                  <div className="sf-rank-stat-num">{hwAnalytics.avgCorrectness}%</div>
                  <div className="sf-rank-stat-lbl">Correctness</div>
                </div>
              </div>
            )}

            {/* Homework list */}
            <div className="sf-panel">
              <div className="sf-panel-title">My Homework</div>
              <div className="sf-panel-sub">Daily sync from your class — submit to get AI evaluation</div>
              {isHomeworkLoading ? (
                <div style={{ padding: "24px 0", textAlign: "center" }}><Spinner size="sm" /></div>
              ) : !homeworkList || homeworkList.length === 0 ? (
                <div className="sf-empty"><div className="sf-empty-icon">📚</div>No homework assigned yet for your class and section.</div>
              ) : (
                homeworkList.map((hw: any) => {
                  const sub = hw.submission;
                  const isOverdue = !sub && new Date() > new Date(hw.dueDate);
                  const statusLabel = sub ? (sub.status === "needs_improvement" ? "Needs Improvement" : "Completed") : isOverdue ? "Overdue" : "Pending";
                  const statusCls = sub ? (sub.status === "needs_improvement" ? "sf-es-draft" : "sf-es-done") : isOverdue ? "sf-es-draft" : "";
                  const isUploading = uploadingHwId === hw.id;
                  return (
                    <div key={hw.id} className="sf-exam-item" style={{ cursor: "default", alignItems: "flex-start", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 12 }}>
                        <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", flexShrink: 0 }}>📝</div>
                        <div className="sf-exam-info" style={{ flex: 1 }}>
                          <div className="sf-exam-name">{hw.subject}</div>
                          <div className="sf-exam-meta">{hw.description}</div>
                          <div className="sf-exam-meta">Due: {new Date(hw.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                        </div>
                        <span className={`sf-exam-status ${statusCls}`} style={{ flexShrink: 0 }}>{statusLabel}</span>
                        {!sub && (
                          <Button
                            size="sm"
                            className="rounded-xl gap-1"
                            disabled={isUploading}
                            onClick={() => { setPendingHwId(hw.id); hwFileRef.current?.click(); }}
                            data-testid={`button-submit-hw-${hw.id}`}
                          >
                            {isUploading ? <><Loader2 className="h-3 w-3 animate-spin" /> Evaluating…</> : <><Upload className="h-3 w-3" /> Submit</>}
                          </Button>
                        )}
                      </div>
                      {sub?.aiFeedback && (
                        <div style={{ width: "100%", padding: "10px 14px", background: "var(--lav-bg)", borderRadius: 10, fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.6 }}>
                          <b>AI Feedback:</b> {sub.aiFeedback}
                          {sub.correctnessScore != null && <span style={{ marginLeft: 8, fontWeight: 700, color: sub.correctnessScore >= 70 ? "var(--green)" : "var(--amber)" }}>{sub.correctnessScore}% correct</span>}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ADAPTIVE REVISION PANEL — only in overview */}
        {activeTab === "overview" && <AnimatePresence>
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
        </AnimatePresence>}

        {activeTab === "profile" && <ProfilePanel />}
      </div>

      {/* AI CHAT SIDEBAR */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 20 }} className="fixed right-0 top-0 h-screen w-full sm:w-[420px] bg-background border-l z-50 flex flex-col shadow-2xl">
              <div className="p-4 border-b flex items-center justify-between bg-primary text-primary-foreground shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  <div><h2 className="font-bold leading-tight">AI Coach</h2><p className="text-xs text-primary-foreground/70">Your personal academic assistant</p></div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="text-primary-foreground hover:bg-white/10 rounded-xl"><X className="h-5 w-5" /></Button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {!activeConversationId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center"><TrendingUp className="h-8 w-8 text-primary" /></div>
                    <div><h3 className="font-bold text-lg">Ask Your AI Coach</h3><p className="text-sm text-muted-foreground mt-2 max-w-xs">Get personalized academic guidance based on your performance data.</p></div>
                    <div className="w-full space-y-2">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-left">Example questions</p>
                      {STUDENT_EXAMPLE_QUESTIONS.map(q => (
                        <button key={q} onClick={() => { startConversation.mutate(undefined, { onSuccess: () => setTimeout(() => setChatMessage(q), 300) }); }} className="w-full text-left text-sm px-3 py-2 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/40 hover:border-primary/20 transition-all">{q}</button>
                      ))}
                    </div>
                    <Button onClick={() => startConversation.mutate()} disabled={startConversation.isPending} className="rounded-xl w-full">
                      {startConversation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />} Start Chat
                    </Button>
                  </div>
                ) : (
                  <>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                      {(!messages || messages.length === 0) && <div className="text-center py-8 text-muted-foreground text-sm"><MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>Ask a question to get started</p></div>}
                      {messages?.map(msg => (
                        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          {msg.role === "assistant" && <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-1"><TrendingUp className="h-3 w-3 text-primary" /></div>}
                          <div className={`max-w-[82%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted rounded-tl-none"}`}>{msg.content}</div>
                        </div>
                      ))}
                      {sendMessage.isPending && <div className="flex justify-start items-center gap-2"><div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><TrendingUp className="h-3 w-3 text-primary" /></div><div className="bg-muted p-3 rounded-2xl rounded-tl-none flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Thinking…</span></div></div>}
                    </div>
                    <div className="p-4 border-t bg-muted/30 shrink-0">
                      <div className="flex items-center gap-2 mb-2"><Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 rounded-lg" onClick={() => setActiveConversationId(null)}><Plus className="h-3 w-3 mr-1" /> New</Button></div>
                      <form onSubmit={e => { e.preventDefault(); if (chatMessage.trim()) sendMessage.mutate(chatMessage); }} className="flex gap-2">
                        <Input placeholder="Ask your AI coach…" value={chatMessage} onChange={e => setChatMessage(e.target.value)} className="rounded-xl bg-background" disabled={sendMessage.isPending} />
                        <Button type="submit" size="icon" className="rounded-xl shrink-0" disabled={sendMessage.isPending || !chatMessage.trim()}><Send className="h-4 w-4" /></Button>
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
          <Button onClick={() => setIsChatOpen(true)} className="h-14 w-14 rounded-full shadow-2xl hover:scale-110 transition-transform">
            <MessageSquare className="h-6 w-6" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
