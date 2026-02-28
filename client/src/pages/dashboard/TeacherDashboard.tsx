import "@/dashboard.css";
import { useTeacherDashboard } from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, X, Upload, MessageSquare, TrendingUp, Send, Star, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExamSchema, type Exam } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { api, buildUrl } from "@shared/routes";
import { fetchWithAuth } from "@/lib/fetcher";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";

interface OcrResult {
  sheetId: number;
  examId: number;
  admissionNumber: string;
  studentName: string;
  answers: Array<{ question_number: number; answer_text: string }>;
}

interface AnalyticsData {
  classAverages: { subject: string; avgMarks: number; totalMarks: number; examCount: number }[];
  studentPerformance: { studentName: string; totalMarks: number; maxMarks: number; examName: string; subject: string; pct: number }[];
  marksDistribution: { range: string; count: number }[];
  improvementTrends: { examName: string; subject: string; avgMarks: number; maxMarks: number; avgPct: number }[];
  chapterWeakness: { chapter: string; subject: string; avgScore: number; totalQuestions: number; studentsAffected: number }[];
}

const EXAMPLE_QUESTIONS = [
  "Which students need improvement?",
  "Who scored highest in the last exam?",
  "Give me a class performance summary.",
  "What are the weakest areas across all students?",
];

const EXAM_CATEGORIES = [
  { value: "mid_term", label: "Mid Term" },
  { value: "unit_test", label: "Unit Test" },
  { value: "end_sem", label: "End Sem" },
  { value: "class_test", label: "Class Test" },
];

const BAR_COLORS = [
  { bg: "var(--lav-card)", border: "" },
  { bg: "var(--green-bg)", border: "1.5px solid rgba(42,157,110,.3)" },
  { bg: "var(--amber-bg)", border: "1.5px solid rgba(196,122,30,.3)" },
  { bg: "var(--blue-bg)", border: "1.5px solid rgba(37,99,192,.2)" },
  { bg: "#fce4ef", border: "1.5px solid rgba(212,65,126,.2)" },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function DropZone({ onFile, isProcessing }: { onFile: (dataUrl: string, filename: string) => void; isProcessing: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Only image files are supported (JPG, PNG, WEBP).");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    onFile(dataUrl, file.name);
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isProcessing && inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all min-h-[180px] ${isDragging ? "border-primary bg-primary/5" : "border-border/50 bg-muted/20 hover:border-primary/40"} ${isProcessing ? "pointer-events-none opacity-60" : ""}`}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) { await processFile(f); e.target.value = ""; } }} />
      {isProcessing ? (
        <><Loader2 className="h-8 w-8 text-primary animate-spin" /><p className="text-sm font-semibold text-muted-foreground">Processing with AI OCR…</p></>
      ) : (
        <>
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center"><Upload className="h-6 w-6 text-primary" /></div>
          <div className="text-center px-4">
            <p className="font-semibold text-sm">Drop the answer sheet here</p>
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP only</p>
          </div>
        </>
      )}
    </div>
  );
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

function pctColor(pct: number) {
  if (pct >= 75) return "var(--green)";
  if (pct >= 50) return "var(--amber)";
  return "var(--red)";
}

export default function TeacherDashboard() {
  const { data, isLoading } = useTeacherDashboard();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [activeSection, setActiveSection] = useState("overview");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [isOcrDialogOpen, setIsOcrDialogOpen] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [classFilter, setClassFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [showAvaMenu, setShowAvaMenu] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [bulkEvaluatingId, setBulkEvaluatingId] = useState<number | null>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const avaRef = useRef<HTMLDivElement>(null);

  const { data: examsList, isLoading: isLoadingExams } = useQuery<Exam[]>({
    queryKey: [api.exams.list.path],
    queryFn: async () => { const res = await fetchWithAuth(api.exams.list.path); return res.json(); },
  });

  const { data: answerSheets, refetch: refetchSheets } = useQuery<any[]>({
    queryKey: ["/api/exams", selectedExamId, "answer-sheets"],
    queryFn: async () => { const res = await fetchWithAuth(`/api/exams/${selectedExamId}/answer-sheets`); return res.json(); },
    enabled: !!selectedExamId,
  });

  const { data: mergedScripts, refetch: refetchMergedScripts } = useQuery<any[]>({
    queryKey: ["/api/exams/merged-scripts", selectedExamId],
    queryFn: async () => { const res = await fetchWithAuth(`/api/exams/${selectedExamId}/merged-scripts`); return res.json(); },
    enabled: !!selectedExamId,
  });

  const { data: conversations } = useQuery<any[]>({
    queryKey: ["/api/chat/conversations"],
    queryFn: async () => { const res = await fetchWithAuth("/api/chat/conversations"); return res.json(); },
    enabled: isChatOpen,
  });

  const { data: messages, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ["/api/chat/messages", activeConversationId],
    queryFn: async () => { const res = await fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`); return res.json(); },
    enabled: !!activeConversationId,
  });

  const analyticsUrl = `/api/analytics${classFilter || subjectFilter ? `?class=${classFilter}&subject=${subjectFilter}` : ""}`;
  const { data: analytics } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics", classFilter, subjectFilter],
    queryFn: async () => { const res = await fetchWithAuth(analyticsUrl); return res.json(); },
  });

  const { data: filterOptions } = useQuery<{ classes: string[]; subjects: string[] }>({
    queryKey: ["/api/analytics/filter-options"],
    queryFn: async () => { const res = await fetchWithAuth("/api/analytics/filter-options"); return res.json(); },
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
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/chat/conversations", { method: "POST", body: JSON.stringify({ title: "New Analysis" }) });
      return res.json();
    },
    onSuccess: (d) => { setActiveConversationId(d.id); queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] }); },
    onError: () => toast({ title: "Error", description: "Could not start conversation.", variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`, { method: "POST", body: JSON.stringify({ content }) });
      return res.json();
    },
    onSuccess: () => { setChatMessage(""); refetchMessages(); },
    onError: () => toast({ title: "Error", description: "Failed to send message.", variant: "destructive" }),
  });

  const handleAnswerSheetUpload = async (dataUrl: string, _filename: string) => {
    if (!selectedExamId) return;
    const examId = parseInt(selectedExamId);
    setProcessingId(examId);
    try {
      const res = await fetchWithAuth(buildUrl(api.exams.processAnswerSheet.path, { id: examId }), { method: "POST", body: JSON.stringify({ imageBase64: dataUrl }) });
      const result = await res.json();
      if (!res.ok) { toast({ title: "Upload Failed", description: result.message || "Failed to process answer sheet", variant: "destructive" }); return; }
      setOcrResult({ ...result, sheetId: result.id, examId });
      setIsOcrDialogOpen(true);
      refetchSheets();
      toast({ title: "OCR Complete", description: `Mapped to: ${result.studentName}` });
    } catch { toast({ title: "Error", description: "Failed to process answer sheet", variant: "destructive" }); }
    finally { setProcessingId(null); }
  };

  const handleEvaluate = async (sheetId: number) => {
    setEvaluatingId(sheetId);
    try {
      const res = await fetchWithAuth(buildUrl(api.exams.evaluate.path, { id: sheetId }), { method: "POST" });
      const result = await res.json();
      toast({ title: "Evaluation Complete", description: `${result.studentName} scored ${result.totalMarks} marks.` });
      setIsOcrDialogOpen(false); setOcrResult(null); refetchSheets();
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
    } catch { toast({ title: "Error", description: "Failed to evaluate", variant: "destructive" }); }
    finally { setEvaluatingId(null); }
  };

  const handleBulkUpload = async () => {
    if (!selectedExamId || bulkFiles.length === 0) return;
    setIsBulkUploading(true); setBulkResult(null);
    try {
      const images = await Promise.all(bulkFiles.map(file => new Promise<{ imageBase64: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ imageBase64: reader.result as string });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));
      const res = await fetchWithAuth(`/api/exams/${selectedExamId}/bulk-upload`, { method: "POST", body: JSON.stringify({ images }) });
      const result = await res.json();
      setBulkResult(result); refetchMergedScripts();
      toast({ title: "Bulk upload complete", description: `${result.pagesProcessed} pages processed.` });
    } catch (err: any) { toast({ title: "Upload failed", description: err?.message || "Something went wrong", variant: "destructive" }); }
    finally { setIsBulkUploading(false); setBulkFiles([]); }
  };

  const handleBulkEvaluate = async (scriptId: number) => {
    setBulkEvaluatingId(scriptId);
    try {
      await fetchWithAuth(`/api/merged-scripts/${scriptId}/evaluate`, { method: "POST" });
      refetchMergedScripts(); refetchSheets();
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
      toast({ title: "Evaluation complete" });
    } catch { toast({ title: "Evaluation failed", variant: "destructive" }); }
    finally { setBulkEvaluatingId(null); }
  };

  const form = useForm({
    resolver: zodResolver(insertExamSchema.extend({
      totalMarks: z.coerce.number().min(1, "Must be at least 1"),
      teacherId: z.number().optional(),
      examName: z.string().optional(),
      questionText: z.string().optional(),
      modelAnswerText: z.string().optional(),
      markingSchemeText: z.string().optional(),
      category: z.string().default("unit_test"),
    })),
    defaultValues: { subject: "", className: "", examName: "", category: "unit_test", totalMarks: 0, questionText: "", modelAnswerText: "", markingSchemeText: "" },
  });

  const watchedSubject = form.watch("subject");
  const watchedClass = form.watch("className");
  const watchedCategory = form.watch("category");
  const generatedExamName = (() => {
    const date = new Date().toISOString().split("T")[0];
    const subj = watchedSubject || "Subject";
    const cat = EXAM_CATEGORIES.find(c => c.value === watchedCategory)?.label?.replace(/\s+/g, "") || "Exam";
    const cls = watchedClass || "Class";
    return `${date}-${subj}-${cat}-${cls}`;
  })();

  const onSubmit = async (values: any) => {
    try {
      await apiRequest("POST", api.exams.create.path, { ...values, examName: generatedExamName, questionText: values.questionText || null, modelAnswerText: values.modelAnswerText || null, markingSchemeText: values.markingSchemeText || null });
      queryClient.invalidateQueries({ queryKey: [api.exams.list.path] });
      toast({ title: "Exam created" }); setIsDialogOpen(false); form.reset();
    } catch { toast({ title: "Error", description: "Failed to create exam", variant: "destructive" }); }
  };

  const userName = (user as any)?.name || "Teacher";
  const initials = getInitials(userName);
  const totalExams = examsList?.length || 0;
  const sheetsEvaluated = data?.sheetsEvaluated || 0;
  const avgPerformance = data?.avgPerformance || 0;
  const totalStudents = data?.totalStudents || 0;

  const classAverages = analytics?.classAverages || [];
  const studentPerformance = analytics?.studentPerformance || [];
  const marksDistribution = analytics?.marksDistribution || [];
  const improvementTrends = analytics?.improvementTrends || [];

  const totalDistCount = marksDistribution.reduce((s, d) => s + d.count, 0);
  const distParts = [
    { label: "80–100%", color: "var(--green)", pct: totalDistCount ? Math.round((marksDistribution.find(d => d.range === "80-100")?.count || 0) / totalDistCount * 100) : 25 },
    { label: "60–79%",  color: "var(--amber)", pct: totalDistCount ? Math.round((marksDistribution.find(d => d.range === "60-79")?.count || 0) / totalDistCount * 100) : 35 },
    { label: "40–59%",  color: "var(--lavender)", pct: totalDistCount ? Math.round((marksDistribution.find(d => d.range === "40-59")?.count || 0) / totalDistCount * 100) : 25 },
    { label: "<40%",   color: "var(--red)", pct: totalDistCount ? Math.round((marksDistribution.find(d => d.range === "0-39")?.count || 0) / totalDistCount * 100) : 15 },
  ];

  const circumference = 2 * Math.PI * 38;
  let donutOffset = 0;
  const donutSegments = distParts.map(d => {
    const dash = (d.pct / 100) * circumference;
    const seg = { ...d, dash, dashOffset: -donutOffset };
    donutOffset += dash;
    return seg;
  });

  const maxBarHeight = 100;
  const barsData = classAverages.length > 0 ? classAverages.map((ca, i) => ({
    label: ca.subject.slice(0, 4),
    pct: ca.totalMarks > 0 ? Math.round(ca.avgMarks / ca.totalMarks * 100) : 0,
    height: ca.totalMarks > 0 ? Math.round((ca.avgMarks / ca.totalMarks) * maxBarHeight) : 10,
    color: BAR_COLORS[i % BAR_COLORS.length],
  })) : [
    { label: "Math", pct: 64, height: 64, color: BAR_COLORS[0] },
    { label: "Bio",  pct: 80, height: 80, color: BAR_COLORS[1] },
    { label: "Chem", pct: 50, height: 50, color: BAR_COLORS[2] },
    { label: "Phys", pct: 72, height: 72, color: BAR_COLORS[3] },
    { label: "Eng",  pct: 60, height: 60, color: BAR_COLORS[4] },
  ];

  const topStudents = studentPerformance.length > 0
    ? studentPerformance.slice(0, 4).map((s, i) => ({
        rank: i + 1,
        initials: getInitials(s.studentName),
        name: s.studentName,
        pct: s.pct,
      }))
    : [
        { rank: 1, initials: "PR", name: "Priya Rao", pct: 82 },
        { rank: 2, initials: "RM", name: "Rohan Mehta", pct: 76 },
        { rank: 3, initials: "AK", name: "Alex Kim", pct: 64 },
        { rank: 4, initials: "SG", name: "Sara Gupta", pct: 51 },
      ];

  const trendPoints: { x: number; y: number }[] = [];
  if (improvementTrends.length >= 2) {
    improvementTrends.slice(-5).forEach((t, i, arr) => {
      trendPoints.push({ x: Math.round((i / (arr.length - 1)) * 320), y: Math.round(82 - (t.avgPct / 100) * 72) });
    });
  } else {
    trendPoints.push({ x: 0, y: 70 }, { x: 90, y: 43 }, { x: 180, y: 33 }, { x: 280, y: 13 }, { x: 320, y: 10 });
  }
  const trendPath = `M${trendPoints.map(p => `${p.x},${p.y}`).join(" C")}`;
  const trendLine = trendPoints.length > 1
    ? `M${trendPoints[0].x},${trendPoints[0].y}` + trendPoints.slice(1).map(p => ` L${p.x},${p.y}`).join("")
    : "";
  const trendArea = trendLine ? trendLine + ` L${trendPoints[trendPoints.length - 1].x},82 L${trendPoints[0].x},82 Z` : "";

  if (isLoading) {
    return (
      <div className="sf-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="sf-root">
      {/* TOP NAV */}
      <nav className="sf-topnav">
        <div className="sf-logo">
          <div className="sf-logo-mark teacher">S</div>
          <span className="sf-logo-name">ScholarFlow</span>
          <span className="sf-teacher-pill">TEACHER</span>
        </div>

        <div className="sf-nav-tabs">
          <button className={`sf-nav-tab${activeSection === "overview" ? " on" : ""}`} onClick={() => setActiveSection("overview")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
            Overview
          </button>
          <button className="sf-nav-tab" onClick={() => setActiveSection("exams")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Homework
            <span className="sf-nav-badge sf-nb-amber">{totalExams > 0 ? `${totalExams} active` : "—"}</span>
          </button>
          <button className="sf-nav-tab" onClick={() => setIsDialogOpen(true)}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Create Exam
            <span className="sf-nav-badge sf-nb-new">New</span>
          </button>
          <button className={`sf-nav-tab${activeSection === "sheets" ? " on" : ""}`} onClick={() => setActiveSection("sheets")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
            </svg>
            Analytics
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
          <button className="sf-btn-analyst" onClick={() => setIsChatOpen(true)} data-testid="button-ai-analyst">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
            AI Analyst
          </button>
          <button className="sf-btn-create" onClick={() => setIsDialogOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create Exam
          </button>
          <div className="sf-ava teacher" ref={avaRef} onClick={() => setShowAvaMenu(v => !v)}>
            {initials}
            {showAvaMenu && (
              <div className="sf-ava-menu">
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
            <div className="sf-page-sub">{new Date().toDateString()} &nbsp;·&nbsp; Manage exams, evaluate answer sheets and track class performance</div>
          </div>
        </div>

        {/* FUNNEL */}
        <div className="sf-funnel sf-funnel-4">
          <div className="sf-f-col">
            <div className="sf-f-cat">Exams Created</div>
            <div className="sf-f-num">{totalExams}</div>
            <div className="sf-f-delta sf-d-up">↑ +12%</div>
            <div className="sf-f-desc">Mid-term exam created and <b>ready for evaluation</b>.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Sheets Evaluated</div>
            <div className="sf-f-num">{sheetsEvaluated}</div>
            <div className={`sf-f-delta ${sheetsEvaluated > 0 ? "sf-d-up" : "sf-d-flat"}`}>
              {sheetsEvaluated > 0 ? `↑ ${sheetsEvaluated} done` : "→ Pending"}
            </div>
            <div className="sf-f-desc">Upload answer sheets to see <b>class averages</b>.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Avg Performance</div>
            <div className="sf-f-num">{avgPerformance}%</div>
            <div className={`sf-f-delta ${avgPerformance > 0 ? "sf-d-up" : "sf-d-flat"}`}>
              {avgPerformance > 0 ? `↑ ${avgPerformance}% avg` : "→ Awaiting"}
            </div>
            <div className="sf-f-desc">Average score once sheets are <b>evaluated</b>.</div>
          </div>
          <div className="sf-f-col">
            <div className="sf-f-cat">Total Students</div>
            <div className="sf-f-num">{totalStudents || 32}</div>
            <div className="sf-f-delta sf-d-flat">Stable</div>
            <div className="sf-f-desc">Students enrolled across <b>active classes</b> this term.</div>
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
          <button className={`sf-stab${activeSection === "exams" ? " on" : ""}`} onClick={() => setActiveSection("exams")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            Exams
          </button>
          <button className={`sf-stab${activeSection === "sheets" ? " on" : ""}`} onClick={() => setActiveSection("sheets")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Answer Sheets
          </button>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeSection === "overview" && (
          <>
            {/* Analytics head */}
            <div className="sf-analytics-head">
              <div>
                <div className="sf-section-title">Analytics</div>
                <div className="sf-section-sub">Live data from evaluated answer sheets</div>
              </div>
              <div className="sf-filter-row">
                <select className="sf-fsel" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
                  <option value="">All Classes</option>
                  {(filterOptions?.classes || []).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="sf-fsel" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
                  <option value="">All Subjects</option>
                  {(filterOptions?.subjects || []).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* 4 charts */}
            <div className="sf-charts-grid">
              {/* Chart 1: Class Average by Subject */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-lav">📊</div>
                    <div>
                      <div className="sf-chart-name">Class Average by Subject</div>
                      <div className="sf-chart-desc">Avg marks scored vs max marks</div>
                    </div>
                  </div>
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                <div className="sf-bar-chart">
                  {barsData.map((b, i) => (
                    <div key={i} className="sf-bar-col">
                      <div
                        className="sf-bar"
                        style={{ height: `${b.height}px`, background: b.color.bg, border: b.color.border || undefined }}
                        data-v={`${b.pct}%`}
                      />
                      <div className="sf-blbl">{b.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart 2: Student Performance */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-grn">👤</div>
                    <div>
                      <div className="sf-chart-name">Student Performance</div>
                      <div className="sf-chart-desc">Score percentage per student</div>
                    </div>
                  </div>
                  <span className="sf-chart-badge sf-cb-sample">{studentPerformance.length > 0 ? "Live" : "Sample"}</span>
                </div>
                <div>
                  {topStudents.map((s, i) => (
                    <div key={i} className="sf-student-row">
                      <div className="sf-s-rank">{s.rank}</div>
                      <div className="sf-s-av">{s.initials}</div>
                      <div className="sf-s-name">{s.name}</div>
                      <div className="sf-s-score" style={{ color: pctColor(s.pct) }}>{s.pct}%</div>
                      <div className="sf-s-bar">
                        <div className="sf-s-bar-fill" style={{ width: `${s.pct}%`, background: pctColor(s.pct) }} />
                      </div>
                      <div className={`sf-s-delta ${s.pct >= 70 ? "sf-d-up" : s.pct >= 50 ? "sf-d-flat" : "sf-d-dn"}`}>
                        {s.pct >= 70 ? "↑" : s.pct >= 50 ? "→" : "↓"} {Math.abs(s.rank - 2)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart 3: Marks Distribution Donut */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-amb">🍩</div>
                    <div>
                      <div className="sf-chart-name">Marks Distribution</div>
                      <div className="sf-chart-desc">Students grouped by score range</div>
                    </div>
                  </div>
                </div>
                <div className="sf-donut-wrap">
                  <svg width="96" height="96" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="var(--cream2)" strokeWidth="14"/>
                    {donutSegments.map((seg, i) => (
                      <circle key={i} cx="50" cy="50" r="38" fill="none"
                        stroke={seg.color} strokeWidth="14"
                        strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
                        strokeDashoffset={seg.dashOffset}
                        transform="rotate(-90 50 50)"
                      />
                    ))}
                    <text x="50" y="46" textAnchor="middle" fontFamily="Fraunces,serif" fontSize="15" fontWeight="700" fill="var(--ink)">
                      {avgPerformance > 0 ? `${avgPerformance}%` : "58%"}
                    </text>
                    <text x="50" y="58" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="9" fill="var(--mid)">class avg</text>
                  </svg>
                  <div className="sf-donut-legend">
                    {distParts.map((d, i) => (
                      <div key={i} className="sf-leg-item">
                        <div className="sf-leg-dot" style={{ background: d.color }} />
                        {d.label}
                        <span className="sf-leg-val" style={{ color: d.color }}>{d.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chart 4: Improvement Trends */}
              <div className="sf-chart-card">
                <div className="sf-chart-head">
                  <div className="sf-chart-ico-row">
                    <div className="sf-chart-ico sf-ci-pnk">📈</div>
                    <div>
                      <div className="sf-chart-name">Improvement Trends</div>
                      <div className="sf-chart-desc">Average class score across exams</div>
                    </div>
                  </div>
                </div>
                <div className="sf-trend-bg">
                  <svg width="100%" height="82" viewBox="0 0 320 82" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="sf-lg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ink)" stopOpacity=".08"/>
                        <stop offset="100%" stopColor="var(--ink)" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    {trendArea && <path d={trendArea} fill="url(#sf-lg)"/>}
                    {trendLine && <path d={trendLine} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"/>}
                    {trendPoints.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={i === trendPoints.length - 1 ? 4 : 3}
                        fill={i === trendPoints.length - 1 ? "var(--ink2)" : "var(--ink)"}
                        stroke="var(--cream)" strokeWidth={i === trendPoints.length - 1 ? 2 : 1.5}
                      />
                    ))}
                  </svg>
                </div>
                <div className="sf-trend-labels">
                  {improvementTrends.length >= 2
                    ? improvementTrends.slice(-5).map((t, i) => <span key={i} className="sf-trend-lbl">{t.examName?.split("-").slice(-1)[0] || `E${i + 1}`}</span>)
                    : ["Unit 1", "Mid-term", "Unit 2", "Final", "Now"].map(l => <span key={l} className="sf-trend-lbl">{l}</span>)
                  }
                </div>
              </div>
            </div>

            {/* BOTTOM ROW */}
            <div className="sf-bottom-row">
              {/* Recent Exams */}
              <div className="sf-card">
                <div className="sf-card-title">Recent Exams</div>
                <div className="sf-card-sub">Created exams and their current status</div>
                {isLoadingExams ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}><div className="sf-spinner" /></div>
                ) : examsList && examsList.length > 0 ? (
                  examsList.slice(0, 4).map((exam: any, i) => {
                    const evaluated = (exam.sheetsEvaluated || 0) > 0;
                    const subjectEmoji = exam.subject?.toLowerCase().includes("bio") ? "🧬" : exam.subject?.toLowerCase().includes("chem") ? "⚗️" : exam.subject?.toLowerCase().includes("math") ? "📐" : exam.subject?.toLowerCase().includes("phys") ? "⚛️" : "📝";
                    return (
                      <div key={exam.id} className="sf-exam-item" onClick={() => { setSelectedExamId(String(exam.id)); setActiveSection("sheets"); }}>
                        <div className="sf-exam-subj" style={{ background: "var(--lav-bg)" }}>{subjectEmoji}</div>
                        <div className="sf-exam-info">
                          <div className="sf-exam-name">{exam.examName || `${exam.subject} Exam`}</div>
                          <div className="sf-exam-meta">{new Date(exam.createdAt || Date.now()).toDateString()} · {exam.totalMarks} marks · {exam.sheetsEvaluated || 0} evaluated</div>
                        </div>
                        <span className={`sf-exam-status ${evaluated ? "sf-es-done" : "sf-es-draft"}`}>{evaluated ? "Evaluated" : "Pending"}</span>
                        <div className="sf-exam-score">
                          {evaluated ? `${exam.avgScore || "—"}%` : "—"}
                          <span>{evaluated ? "class avg" : "pending"}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="sf-empty"><div className="sf-empty-icon">📋</div>No exams created yet. Create your first exam above.</div>
                )}
              </div>

              {/* AI Class Insights */}
              <div className="sf-card">
                <div className="sf-card-title">AI Class Insights</div>
                <div className="sf-card-sub">Auto-generated from evaluated exams</div>
                {(analytics?.chapterWeakness || []).length > 0 ? (
                  (analytics?.chapterWeakness || []).slice(0, 3).map((cw, i) => {
                    const cls = cw.avgScore < 40 ? "sf-ins-r" : cw.avgScore < 60 ? "sf-ins-a" : "sf-ins-g";
                    const icon = cw.avgScore < 40 ? "🔴" : cw.avgScore < 60 ? "🟡" : "🟢";
                    const sev = cw.avgScore < 40 ? "Class-wide gap" : cw.avgScore < 60 ? "Needs attention" : "Strong area";
                    return (
                      <div key={i} className={`sf-insight-item ${cls}`}>
                        <div className="sf-ins-label">{icon} {cw.chapter}</div>
                        <div className="sf-ins-text">{sev} in {cw.subject} — avg {Math.round(cw.avgScore)}% across {cw.studentsAffected} student{cw.studentsAffected !== 1 ? "s" : ""}.</div>
                      </div>
                    );
                  })
                ) : (
                  <>
                    <div className="sf-insight-item sf-ins-r">
                      <div className="sf-ins-label">🔴 Class-wide gap</div>
                      <div className="sf-ins-text">Evaluate answer sheets to see AI-generated class insights here.</div>
                    </div>
                    <div className="sf-insight-item sf-ins-a">
                      <div className="sf-ins-label">🟡 Chemistry Q2</div>
                      <div className="sf-ins-text">Most students missed the balanced chemical equation. Add a worked example in the next class.</div>
                    </div>
                    <div className="sf-insight-item sf-ins-g">
                      <div className="sf-ins-label">🟢 Strong area</div>
                      <div className="sf-ins-text">Logical reasoning and problem-solving were answered well. Continue reinforcing this strength.</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── EXAMS TAB ── */}
        {activeSection === "exams" && (
          <div className="sf-panel">
            <div className="sf-panel-title">Exam Management</div>
            <div className="sf-panel-sub">Select an exam to upload and evaluate answer sheets</div>
            {isLoadingExams ? (
              <div style={{ textAlign: "center", padding: "32px" }}><div className="sf-spinner" /></div>
            ) : examsList && examsList.length > 0 ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <select
                    className="sf-fsel"
                    style={{ width: "100%", marginBottom: 16 }}
                    value={selectedExamId}
                    onChange={e => setSelectedExamId(e.target.value)}
                  >
                    <option value="">— Select an exam —</option>
                    {examsList.map((e: any) => <option key={e.id} value={e.id}>{e.examName || `${e.subject} Exam`} ({e.totalMarks} marks)</option>)}
                  </select>
                </div>
                {selectedExamId && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <DropZone onFile={handleAnswerSheetUpload} isProcessing={processingId !== null} />
                    </div>
                    {/* Bulk upload */}
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => bulkInputRef.current?.click()}>
                          <Upload className="h-3 w-3" /> Add bulk images
                        </Button>
                        <input ref={bulkInputRef} type="file" accept="image/*" multiple className="hidden"
                          onChange={e => { const files = Array.from(e.target.files || []); setBulkFiles(prev => [...prev, ...files]); e.target.value = ""; }} />
                        {bulkFiles.length > 0 && (
                          <Button size="sm" className="rounded-xl gap-2" disabled={isBulkUploading} onClick={handleBulkUpload}>
                            {isBulkUploading ? <><Loader2 className="h-3 w-3 animate-spin" /> Processing…</> : `Upload ${bulkFiles.length} images`}
                          </Button>
                        )}
                      </div>
                      {bulkFiles.length > 0 && <p style={{ fontSize: 12, color: "var(--mid)" }}>{bulkFiles.length} file(s) selected: {bulkFiles.map(f => f.name).join(", ")}</p>}
                    </div>
                    {/* Answer sheets list */}
                    {answerSheets && answerSheets.length > 0 && (
                      <div>
                        <div className="sf-panel-title" style={{ fontSize: 14, marginBottom: 8 }}>Individual Answer Sheets</div>
                        {answerSheets.map((sheet: any) => (
                          <div key={sheet.id} className="sf-exam-item" style={{ cursor: "default" }}>
                            <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", fontSize: 12 }}>{getInitials(sheet.studentName || sheet.admissionNumber)}</div>
                            <div className="sf-exam-info">
                              <div className="sf-exam-name">{sheet.studentName || sheet.admissionNumber}</div>
                              <div className="sf-exam-meta">Status: {sheet.status} · {sheet.admissionNumber}</div>
                            </div>
                            {sheet.status === "evaluated" ? (
                              <span className="sf-exam-status sf-es-done">Evaluated · {sheet.totalMarks}/{sheet.maxMarks}</span>
                            ) : (
                              <Button size="sm" className="rounded-xl gap-1" disabled={evaluatingId === sheet.id} onClick={() => handleEvaluate(sheet.id)}>
                                {evaluatingId === sheet.id ? <><Loader2 className="h-3 w-3 animate-spin" /> Evaluating…</> : <><Star className="h-3 w-3" /> Evaluate</>}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Merged scripts */}
                    {mergedScripts && mergedScripts.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div className="sf-panel-title" style={{ fontSize: 14, marginBottom: 8 }}>Bulk Merged Scripts</div>
                        {mergedScripts.map((ms: any) => (
                          <div key={ms.id} className="sf-exam-item" style={{ cursor: "default" }}>
                            <div className="sf-exam-subj" style={{ background: "var(--blue-bg)", fontSize: 12 }}>{getInitials(ms.studentName || ms.admissionNumber)}</div>
                            <div className="sf-exam-info">
                              <div className="sf-exam-name">{ms.studentName || ms.admissionNumber}</div>
                              <div className="sf-exam-meta">{ms.totalPages} pages · {ms.status}</div>
                            </div>
                            {ms.status === "evaluated" ? (
                              <span className="sf-exam-status sf-es-done">Evaluated · {ms.totalMarks}/{ms.maxMarks}</span>
                            ) : (
                              <Button size="sm" className="rounded-xl gap-1" disabled={bulkEvaluatingId === ms.id} onClick={() => handleBulkEvaluate(ms.id)}>
                                {bulkEvaluatingId === ms.id ? <><Loader2 className="h-3 w-3 animate-spin" /> Evaluating…</> : <><Star className="h-3 w-3" /> Evaluate</>}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="sf-empty"><div className="sf-empty-icon">📝</div>No exams yet. Create your first exam using the button above.</div>
            )}
          </div>
        )}

        {/* ── SHEETS TAB (Analytics detail) ── */}
        {activeSection === "sheets" && (
          <div className="sf-panel">
            <div className="sf-panel-title">Answer Sheets & Evaluation</div>
            <div className="sf-panel-sub">Upload and evaluate individual answer sheets per exam</div>
            <select className="sf-fsel" style={{ width: "100%", marginBottom: 16 }} value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}>
              <option value="">— Select an exam —</option>
              {(examsList || []).map((e: any) => <option key={e.id} value={e.id}>{e.examName || `${e.subject} Exam`}</option>)}
            </select>
            {selectedExamId && (
              <>
                <DropZone onFile={handleAnswerSheetUpload} isProcessing={processingId !== null} />
                {answerSheets && answerSheets.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    {answerSheets.map((sheet: any) => (
                      <div key={sheet.id} className="sf-exam-item" style={{ cursor: "default" }}>
                        <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", fontSize: 12 }}>{getInitials(sheet.studentName || "?")}</div>
                        <div className="sf-exam-info">
                          <div className="sf-exam-name">{sheet.studentName || sheet.admissionNumber}</div>
                          <div className="sf-exam-meta">{sheet.admissionNumber} · {sheet.status}</div>
                        </div>
                        {sheet.status === "evaluated" ? (
                          <span className="sf-exam-status sf-es-done">{sheet.totalMarks}/{sheet.maxMarks}</span>
                        ) : (
                          <Button size="sm" className="rounded-xl gap-1" disabled={evaluatingId === sheet.id} onClick={() => handleEvaluate(sheet.id)}>
                            {evaluatingId === sheet.id ? <><Loader2 className="h-3 w-3 animate-spin" /> Evaluating…</> : <><Star className="h-3 w-3" /> Evaluate</>}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── CREATE EXAM DIALOG ── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Exam</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="subject" render={({ field }) => (
                  <FormItem><FormLabel>Subject</FormLabel><FormControl><Input placeholder="Mathematics" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="className" render={({ field }) => (
                  <FormItem><FormLabel>Class</FormLabel><FormControl><Input placeholder="10-A" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Exam Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="rounded-xl" data-testid="select-exam-category"><SelectValue placeholder="Select category…" /></SelectTrigger></FormControl>
                    <SelectContent>{EXAM_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="p-3 bg-muted/30 rounded-xl border border-border/30">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-bold mb-1">Auto-generated Exam Name</p>
                <p className="text-sm font-mono font-semibold text-primary">{generatedExamName}</p>
              </div>
              <FormField control={form.control} name="totalMarks" render={({ field }) => (
                <FormItem><FormLabel>Total Marks</FormLabel><FormControl><Input type="number" placeholder="100" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="questionText" render={({ field }) => (
                <FormItem><FormLabel>Questions</FormLabel><FormControl><Textarea placeholder={"Q1 (10 marks): Explain photosynthesis.\nQ2 (10 marks): State Newton's First Law."} className="rounded-xl min-h-[90px] text-sm" data-testid="input-question-text" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="modelAnswerText" render={({ field }) => (
                <FormItem><FormLabel>Model Answer Key</FormLabel><FormControl><Textarea placeholder={"Q1: Photosynthesis is the process by which plants use sunlight, CO₂, and water…"} className="rounded-xl min-h-[90px] text-sm" data-testid="input-model-answer-text" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="markingSchemeText" render={({ field }) => (
                <FormItem><FormLabel>Marking Scheme <span className="text-muted-foreground font-normal">(optional)</span></FormLabel><FormControl><Textarea placeholder={"Award full marks for complete accurate answers.\nPartial marks for partial answers."} className="rounded-xl min-h-[70px] text-sm" data-testid="input-marking-scheme-text" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <Button type="submit" className="w-full rounded-xl" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Exam"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── OCR RESULT DIALOG ── */}
      <Dialog open={isOcrDialogOpen} onOpenChange={v => { if (!v) { setIsOcrDialogOpen(false); setOcrResult(null); } }}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl">
          <DialogHeader><DialogTitle>OCR Result — Confirm & Evaluate</DialogTitle></DialogHeader>
          {ocrResult && (
            <div className="space-y-4 pt-1">
              <div className="p-4 rounded-xl bg-muted/30 border border-border/30 space-y-1">
                <p className="text-sm font-bold">{ocrResult.studentName}</p>
                <p className="text-xs text-muted-foreground">{ocrResult.admissionNumber}</p>
              </div>
              <div className="rounded-xl border border-border/30 overflow-hidden">
                <div className="px-4 py-2 bg-muted/20 flex items-center justify-between border-b border-border/30">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Extracted Answers ({ocrResult.answers?.length || 0})</span>
                </div>
                <div className="divide-y divide-border/30 max-h-52 overflow-y-auto">
                  {ocrResult.answers?.map((ans) => (
                    <div key={ans.question_number} className="px-4 py-2 flex gap-4 text-sm">
                      <span className="font-bold text-primary shrink-0">Q{ans.question_number}</span>
                      <span className="text-muted-foreground line-clamp-2">{ans.answer_text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setIsOcrDialogOpen(false); setOcrResult(null); }}>Close</Button>
                <Button className="flex-1 rounded-xl gap-2" disabled={evaluatingId === ocrResult.sheetId} onClick={() => handleEvaluate(ocrResult.sheetId)}>
                  {evaluatingId === ocrResult.sheetId ? <><Loader2 className="h-4 w-4 animate-spin" /> Evaluating…</> : <><Star className="h-4 w-4" /> Evaluate with AI</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── AI CHAT SIDEBAR ── */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 20 }} className="fixed right-0 top-0 h-screen w-full sm:w-[420px] bg-background border-l z-50 flex flex-col shadow-2xl">
              <div className="p-4 border-b flex items-center justify-between bg-primary text-primary-foreground shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  <div><h2 className="font-bold leading-tight">AI Performance Analyst</h2><p className="text-xs text-primary-foreground/70">RAG-powered analytics</p></div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="text-primary-foreground hover:bg-white/10 rounded-xl"><X className="h-5 w-5" /></Button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {!activeConversationId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center"><TrendingUp className="h-8 w-8 text-primary" /></div>
                    <div><h3 className="font-bold text-lg">Analyze Class Performance</h3><p className="text-sm text-muted-foreground mt-2 max-w-xs">Ask any question about student progress, weak areas, or performance trends.</p></div>
                    <div className="w-full space-y-2">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-left">Example questions</p>
                      {EXAMPLE_QUESTIONS.map(q => (
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
                      {messages?.map(msg => (
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
                        <Input placeholder="Ask about student performance…" value={chatMessage} onChange={e => setChatMessage(e.target.value)} className="rounded-xl bg-background" disabled={sendMessage.isPending} />
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
