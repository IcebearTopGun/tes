import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useStudentDashboard } from "@/hooks/use-dashboard";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  Target,
  MessageSquare,
  ArrowUpRight,
  X,
  Plus,
  Loader2,
  Bot,
  Send,
  Brain,
  TrendingUp,
  BookOpen,
  Star,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(options?.headers || {}),
    },
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

export default function StudentDashboard() {
  const { data, isLoading, error } = useStudentDashboard();
  const { toast } = useToast();

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [revisionChapter, setRevisionChapter] = useState<{ chapter: string; subject: string } | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const startConversation = useMutation({
    mutationFn: () => fetchWithAuth("/api/student/chat/conversations", { method: "POST", body: JSON.stringify({ title: "Academic Chat" }) }),
    onSuccess: (data) => {
      setActiveConversationId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/student/chat/conversations"] });
    },
    onError: () => toast({ title: "Error", description: "Could not start conversation.", variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      fetchWithAuth(`/api/student/chat/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => { setChatMessage(""); refetchMessages(); },
    onError: () => toast({ title: "Error", description: "Failed to send message.", variant: "destructive" }),
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    const msg = chatMessage.trim();
    if (!msg || sendMessage.isPending) return;
    sendMessage.mutate(msg);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold">Failed to load analytics</h2>
          <p className="text-muted-foreground mt-2">Please check your connection and try again.</p>
        </div>
      </DashboardLayout>
    );
  }

  const hasEvals = (data?.assignments ?? 0) > 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytics</h1>
            <p className="text-muted-foreground mt-1">Your personal academic performance overview.</p>
          </div>
          <Button
            onClick={() => setIsChatOpen(true)}
            data-testid="button-open-student-chat"
            className="gap-2 rounded-xl"
          >
            <MessageSquare className="h-4 w-4" /> AI Coach
          </Button>
        </div>

        {/* Performance Summary */}
        <Card className="border-border/40 shadow-premium rounded-2xl overflow-hidden bg-card/30 backdrop-blur-sm border-none">
          <CardContent className="p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <Badge className="bg-primary/10 text-primary border-none rounded-lg mb-4">Performance Report</Badge>
                <h2 className="text-2xl font-bold mb-4 leading-tight">Academic Summary</h2>
                <p className="text-muted-foreground text-lg leading-relaxed italic" data-testid="text-performance-summary">
                  "{data?.performanceSummary}"
                </p>
                <div className="flex items-center gap-6 mt-8">
                  <div className="text-center">
                    <div className="text-3xl font-bold font-display text-primary" data-testid="text-exams-count">
                      {data?.assignments ?? 0}
                    </div>
                    <div className="text-xs uppercase font-bold tracking-widest text-muted-foreground mt-1">Exams Done</div>
                  </div>
                  <div className="h-10 w-px bg-border/40"></div>
                  <div className="text-center">
                    <div className="text-3xl font-bold font-display text-emerald-600" data-testid="text-subjects-count">
                      {data?.marksOverview?.length ?? 0}
                    </div>
                    <div className="text-xs uppercase font-bold tracking-widest text-muted-foreground mt-1">Subjects</div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {data?.marksOverview && data.marksOverview.length > 0 ? (
                  data.marksOverview.map((mark: any, i: number) => (
                    <Card key={i} className="border-border/40 shadow-premium rounded-xl bg-background/50" data-testid={`card-mark-${i}`}>
                      <CardContent className="p-4">
                        <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{mark.subject}</div>
                        <div className="text-2xl font-bold mt-1 font-display">{mark.score}/{mark.total}</div>
                        <Progress value={(mark.score / mark.total) * 100} className="h-1.5 mt-3" />
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="border-border/40 rounded-xl bg-background/50 col-span-2">
                    <CardContent className="p-6 text-center text-muted-foreground text-sm">
                      No evaluated exams yet. Your scores will appear here once a teacher evaluates your answer sheets.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Secondary Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Focus Areas */}
          <Card className="border-border/40 shadow-premium rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-orange-600" /> Focus Areas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data?.improvementAreas?.map((area: string, i: number) => (
                <div key={i} className="group p-4 rounded-xl bg-muted/30 hover:bg-primary/5 border border-transparent hover:border-primary/10 transition-all cursor-default" data-testid={`item-improvement-${i}`}>
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold">{area}</p>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Marks Breakdown */}
          <Card className="border-border/40 shadow-premium rounded-2xl lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-600" /> Score Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.marksOverview && data.marksOverview.length > 0 ? (
                <div className="space-y-6">
                  {data.marksOverview.map((mark: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-4" data-testid={`row-score-${i}`}>
                      <div className="flex-1">
                        <div className="flex justify-between items-end mb-2">
                          <span className="font-bold text-sm">{mark.subject}</span>
                          <span className="text-xs font-bold text-muted-foreground">{mark.score}/{mark.total}</span>
                        </div>
                        <Progress value={(mark.score / mark.total) * 100} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No scores recorded yet. Submit answer sheets to see your progress.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Performance Profile */}
        {hasEvals && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Brain className="h-5 w-5 text-indigo-600" /> AI Performance Profile
              </h2>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5 text-xs"
                onClick={() => refetchProfile()}
                data-testid="button-refresh-profile"
              >
                <RefreshCw className="h-3 w-3" /> Refresh Analysis
              </Button>
            </div>

            {isProfileLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="border-border/40 rounded-2xl">
                    <CardContent className="p-6 space-y-3">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : performanceProfile ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Strengths */}
                <Card className="border-border/40 shadow-premium rounded-2xl border-l-4 border-l-emerald-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Star className="h-4 w-4 text-emerald-600" /> Strengths
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {performanceProfile.strengths.length > 0 ? (
                      performanceProfile.strengths.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm" data-testid={`strength-${i}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                          <span>{s}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No strengths identified yet.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Performance Trend */}
                <Card className="border-border/40 shadow-premium rounded-2xl border-l-4 border-l-violet-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-violet-600" /> Performance Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm" data-testid="text-performance-trend">{performanceProfile.performance_trend}</p>
                    <div className="pt-2 border-t border-border/40">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Attendance</p>
                      <p className="text-xs text-muted-foreground">{performanceProfile.attendance_impact}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Recurring Mistakes */}
                <Card className="border-border/40 shadow-premium rounded-2xl border-l-4 border-l-amber-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" /> Recurring Patterns
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {performanceProfile.recurring_mistakes.length > 0 ? (
                      performanceProfile.recurring_mistakes.map((m, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm" data-testid={`mistake-${i}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                          <span>{m}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No recurring mistakes detected.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Weak Chapters with Revision Buttons */}
                {performanceProfile.weak_chapters.length > 0 && (
                  <Card className="border-border/40 shadow-premium rounded-2xl lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-rose-600" /> Weak Chapters
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {performanceProfile.weak_chapters.map((wc, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-rose-50 transition-colors" data-testid={`weak-chapter-${i}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{wc.chapter}</span>
                              <Badge variant="secondary" className="rounded-lg border-none text-xs">{wc.score_pct}%</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{wc.reason}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-xs gap-1.5 shrink-0 ml-3"
                            onClick={() => setRevisionChapter({ chapter: wc.chapter, subject: data?.marksOverview?.[0]?.subject || "General" })}
                            data-testid={`button-practice-${i}`}
                          >
                            <BookOpen className="h-3 w-3" /> Practice
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Recommended Focus Areas */}
                {performanceProfile.recommended_focus_areas.length > 0 && (
                  <Card className="border-border/40 shadow-premium rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Target className="h-4 w-4 text-indigo-600" /> Recommended Focus
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {performanceProfile.recommended_focus_areas.map((area, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm" data-testid={`focus-area-${i}`}>
                          <span className="text-indigo-600 font-bold shrink-0">{i + 1}.</span>
                          <span>{area}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="border-border/40 border-dashed rounded-2xl">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Brain className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Could not load profile. Try refreshing.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Adaptive Revision Panel */}
        <AnimatePresence>
          {revisionChapter && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="rounded-2xl border border-border/40 shadow-premium overflow-hidden"
            >
              <div className="p-6 bg-gradient-to-r from-indigo-500/5 to-violet-500/5 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-indigo-600" />
                      Practice: {revisionChapter.chapter}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">AI-generated revision questions based on your gaps</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setRevisionChapter(null)} className="rounded-xl" data-testid="button-close-revision">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="p-6 space-y-6">
                {isRevisionLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : revisionData ? (
                  <>
                    {/* Revision Focus */}
                    <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                      <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 mb-1">Revision Focus</p>
                      <p className="text-sm text-indigo-900">{revisionData.revision_focus}</p>
                    </div>

                    {/* Key Concepts */}
                    {revisionData.key_concepts?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Key Concepts</p>
                        <div className="flex flex-wrap gap-2">
                          {revisionData.key_concepts.map((c, i) => (
                            <Badge key={i} variant="secondary" className="rounded-lg border-none text-xs">{c}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Practice Questions */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Practice Questions</p>
                      <div className="space-y-3">
                        {revisionData.practice_questions?.map((q, i) => (
                          <div key={i} className="border border-border/40 rounded-xl overflow-hidden" data-testid={`practice-q-${i}`}>
                            <button
                              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                              onClick={() => setExpandedQuestion(expandedQuestion === i ? null : i)}
                            >
                              <div className="flex items-start gap-3">
                                <span className="font-bold text-indigo-600 shrink-0">Q{q.question_number}.</span>
                                <span className="text-sm font-medium">{q.question}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                <Badge variant="secondary" className="rounded-lg border-none text-xs">{q.marks}m</Badge>
                                {expandedQuestion === i ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            </button>
                            <AnimatePresence>
                              {expandedQuestion === i && (
                                <motion.div
                                  initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-4 pt-0 border-t border-border/40 bg-muted/10">
                                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Hint</p>
                                    <p className="text-sm text-muted-foreground italic">{q.hint}</p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Could not generate revision content.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Teacher Feedback */}
        {data?.feedback && data.feedback.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-violet-600" /> Exam Feedback
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.feedback.map((item: any, i: number) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                >
                  <Card className="border-border/40 shadow-premium rounded-2xl hover:border-primary/20 transition-all" data-testid={`card-feedback-${i}`}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 font-bold">
                            {(item.from || "E")[0]}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{item.from}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.date}</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="rounded-lg border-none text-[10px] uppercase font-bold tracking-widest px-2">
                          Evaluation
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-sm italic leading-relaxed">
                        "{item.comment}"
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI Chat Panel */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsChatOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 20 }}
              className="fixed right-0 top-0 h-screen w-full sm:w-[420px] bg-background border-l z-50 flex flex-col shadow-2xl"
            >
              <div className="p-4 border-b flex items-center justify-between bg-primary text-primary-foreground shrink-0">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  <div>
                    <h2 className="font-bold leading-tight">AI Academic Coach</h2>
                    <p className="text-xs text-primary-foreground/70">Personalised advice based on your results</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="text-primary-foreground hover:bg-white/10 rounded-xl" data-testid="button-close-chat">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {!activeConversationId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Bot className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Your Personal Coach</h3>
                      <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                        Ask about your performance, get study tips, or understand your evaluation feedback.
                      </p>
                    </div>
                    <div className="w-full space-y-2">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-left">Example questions</p>
                      {STUDENT_EXAMPLE_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            startConversation.mutate(undefined, {
                              onSuccess: () => setTimeout(() => setChatMessage(q), 300),
                            });
                          }}
                          className="w-full text-left text-sm px-3 py-2 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/40 hover:border-primary/20 transition-all"
                          data-testid={`button-example-question-${q.slice(0, 10)}`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                    <Button
                      onClick={() => startConversation.mutate()}
                      disabled={startConversation.isPending}
                      className="rounded-xl w-full"
                      data-testid="button-start-conversation"
                    >
                      {startConversation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Start Conversation
                    </Button>
                  </div>
                ) : (
                  <>
                    {conversations && conversations.length > 1 && (
                      <div className="px-4 py-2 border-b bg-muted/20">
                        <select
                          className="w-full text-xs bg-transparent text-muted-foreground outline-none cursor-pointer"
                          value={activeConversationId}
                          onChange={(e) => setActiveConversationId(Number(e.target.value))}
                          data-testid="select-conversation"
                        >
                          {conversations.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                      {(!messages || messages.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p>Ask me anything about your performance</p>
                          <div className="mt-4 space-y-2">
                            {STUDENT_EXAMPLE_QUESTIONS.slice(0, 2).map((q) => (
                              <button
                                key={q}
                                onClick={() => setChatMessage(q)}
                                className="w-full text-left text-xs px-3 py-2 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/40 transition-all"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {messages?.map((msg: any) => (
                        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          {msg.role === "assistant" && (
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-1">
                              <Bot className="h-3 w-3 text-primary" />
                            </div>
                          )}
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted rounded-bl-sm"
                            }`}
                            data-testid={`msg-${msg.role}-${msg.id}`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {sendMessage.isPending && (
                        <div className="flex justify-start">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-1">
                            <Bot className="h-3 w-3 text-primary" />
                          </div>
                          <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 border-t bg-background/80 shrink-0">
                      <div className="flex gap-2 items-end">
                        <Textarea
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                          placeholder="Ask your coach anything..."
                          className="resize-none rounded-xl text-sm min-h-[44px] max-h-[120px]"
                          rows={1}
                          data-testid="input-chat-message"
                        />
                        <Button
                          size="icon"
                          onClick={handleSend}
                          disabled={!chatMessage.trim() || sendMessage.isPending}
                          className="rounded-xl shrink-0 h-11 w-11"
                          data-testid="button-send-message"
                        >
                          {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                      <button
                        onClick={() => { setActiveConversationId(null); startConversation.mutate(); }}
                        className="mt-2 text-xs text-muted-foreground hover:text-primary transition-colors"
                        data-testid="button-new-conversation"
                      >
                        + New conversation
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
