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
import ProfileDrawer from "@/components/ProfileDrawer";
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
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
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
  const [expandedEWStudent, setExpandedEWStudent] = useState<string | null>(null);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [bulkEvaluatingId, setBulkEvaluatingId] = useState<number | null>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const avaRef = useRef<HTMLDivElement>(null);
  const [isHwDialogOpen, setIsHwDialogOpen] = useState(false);
  const [hwSubject, setHwSubject] = useState("");
  const [hwClass, setHwClass] = useState("");
  const [hwSection, setHwSection] = useState("");
  const [hwDescription, setHwDescription] = useState("");
  const [hwModelSolution, setHwModelSolution] = useState("");
  const [hwDueDate, setHwDueDate] = useState("");
  const [isCreatingHw, setIsCreatingHw] = useState(false);
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"subject" | "class">("subject");

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

  const { data: teacherHomework, refetch: refetchTeacherHw } = useQuery<any[]>({
    queryKey: ["/api/teacher/homework"],
    queryFn: () => fetchWithAuth("/api/teacher/homework").then(r => r.json()),
    enabled: activeSection === "homework",
  });

  const { data: teacherOptions } = useQuery<{ subjects: string[]; classes: string[]; sections: string[] }>({
    queryKey: ["/api/teacher/options"],
    queryFn: () => fetchWithAuth("/api/teacher/options").then(r => r.json()),
  });

  const createHomework = useMutation({
    mutationFn: () => fetchWithAuth("/api/teacher/homework", {
      method: "POST",
      body: JSON.stringify({ subject: hwSubject, studentClass: hwClass, section: hwSection, description: hwDescription, modelSolution: hwModelSolution, dueDate: hwDueDate }),
    }),
    onSuccess: () => {
      toast({ title: "Homework assigned!", description: "Students in the class can now submit." });
      setIsHwDialogOpen(false);
      setHwSubject(""); setHwClass(""); setHwSection(""); setHwDescription(""); setHwModelSolution(""); setHwDueDate("");
      refetchTeacherHw();
    },
    onError: () => toast({ title: "Error", description: "Could not create homework.", variant: "destructive" }),
    onSettled: () => setIsCreatingHw(false),
  });

  const analyticsUrl = `/api/analytics?class=${classFilter}&subject=${subjectFilter}&viewMode=${viewMode}`;
  const { data: analytics } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics", classFilter, subjectFilter, viewMode],
    queryFn: async () => { const res = await fetchWithAuth(analyticsUrl); return res.json(); },
  });

  const { data: filterOptions } = useQuery<{ classes: string[]; subjects: string[] }>({
    queryKey: ["/api/analytics/filter-options"],
    queryFn: async () => { const res = await fetchWithAuth("/api/analytics/filter-options"); return res.json(); },
  });

  const { data: teacherScope } = useQuery<{
    isClassTeacher: boolean;
    classTeacherOf: string;
    subjectsAssigned: string[];
    classesAssigned: string[];
  }>({
    queryKey: ["/api/teacher/scope"],
    queryFn: () => fetchWithAuth("/api/teacher/scope").then(r => r.json()),
  });

  const { data: questionQuality, isLoading: isLoadingQQ } = useQuery<any[]>({
    queryKey: ["/api/teacher/question-quality"],
    queryFn: () => fetchWithAuth("/api/teacher/question-quality").then(r => r.json()),
    enabled: activeSection === "overview",
  });

  const { data: earlyWarnings, isLoading: isLoadingEW } = useQuery<any[]>({
    queryKey: ["/api/teacher/early-warning"],
    queryFn: () => fetchWithAuth("/api/teacher/early-warning").then(r => r.json()),
    enabled: activeSection === "overview" || activeSection === "early-warning",
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
      const res = await fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`, { method: "POST", body: JSON.stringify({ content, viewMode }) });
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
  const barsData = classAverages.map((ca, i) => ({
    label: ca.subject.slice(0, 4),
    pct: ca.totalMarks > 0 ? Math.round(ca.avgMarks / ca.totalMarks * 100) : 0,
    height: ca.totalMarks > 0 ? Math.round((ca.avgMarks / ca.totalMarks) * maxBarHeight) : 10,
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));

  const topStudents = studentPerformance.slice(0, 4).map((s, i) => ({
    rank: i + 1,
    initials: getInitials(s.studentName),
    name: s.studentName,
    pct: s.pct,
  }));

  const trendPoints: { x: number; y: number }[] = improvementTrends.length >= 2
    ? improvementTrends.slice(-5).map((t, i, arr) => ({
        x: Math.round((i / (arr.length - 1)) * 320),
        y: Math.round(82 - (t.avgPct / 100) * 72),
      }))
    : [];
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
          <button className={`sf-nav-tab${activeSection === "homework" ? " on" : ""}`} onClick={() => setActiveSection("homework")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Homework
          </button>
          <button className={`sf-nav-tab${activeSection === "early-warning" ? " on" : ""}`} onClick={() => setActiveSection("early-warning")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Early Warning
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
          <button className="sf-nav-tab" onClick={() => setIsProfilePanelOpen(true)}>
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
          <button className={`sf-stab${activeSection === "homework" ? " on" : ""}`} onClick={() => setActiveSection("homework")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Homework
          </button>
          <button className={`sf-stab${activeSection === "sheets" ? " on" : ""}`} onClick={() => setActiveSection("sheets")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Answer Sheets
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
            {/* Analytics head */}
            <div className="sf-analytics-head">
              <div>
                <div className="sf-section-title">Analytics</div>
                <div className="sf-section-sub">
                  {viewMode === "class" && teacherScope?.isClassTeacher
                    ? `Class ${teacherScope.classTeacherOf} — all subjects view`
                    : "Live data from evaluated answer sheets"}
                </div>
              </div>
              <div className="sf-filter-row">
                {teacherScope?.isClassTeacher && (
                  <div style={{ display: "flex", gap: 4, padding: "2px", background: "var(--cream2)", borderRadius: 10, border: "1.5px solid var(--rule)" }}>
                    <button
                      data-testid="button-view-subject"
                      onClick={() => setViewMode("subject")}
                      style={{
                        padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: viewMode === "subject" ? "var(--card)" : "transparent",
                        color: viewMode === "subject" ? "var(--ink)" : "var(--mid)",
                        border: viewMode === "subject" ? "1.5px solid var(--rule)" : "1.5px solid transparent",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      Subject View
                    </button>
                    <button
                      data-testid="button-view-class"
                      onClick={() => setViewMode("class")}
                      style={{
                        padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: viewMode === "class" ? "var(--card)" : "transparent",
                        color: viewMode === "class" ? "var(--ink)" : "var(--mid)",
                        border: viewMode === "class" ? "1.5px solid var(--rule)" : "1.5px solid transparent",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      Class View
                    </button>
                  </div>
                )}
                {viewMode !== "class" && (
                  <>
                    <select className="sf-fsel" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
                      <option value="">All Classes</option>
                      {(filterOptions?.classes || []).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="sf-fsel" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
                      <option value="">All Subjects</option>
                      {(filterOptions?.subjects || []).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </>
                )}
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
                  {barsData.length > 0 ? barsData.map((b, i) => (
                    <div key={i} className="sf-bar-col">
                      <div className="sf-bar" style={{ height: `${b.height}px`, background: b.color.bg, border: b.color.border || undefined }} data-v={`${b.pct}%`} />
                      <div className="sf-blbl">{b.label}</div>
                    </div>
                  )) : <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No evaluation data yet</div>}
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
                  <span className="sf-chart-badge sf-cb-live">Live</span>
                </div>
                <div>
                  {topStudents.length === 0 && <div style={{ textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "32px 0" }}>No evaluation data yet</div>}
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
                      {avgPerformance > 0 ? `${avgPerformance}%` : "–"}
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
                {trendPoints.length === 0 && <div style={{ textAlign: "center", fontSize: 12, color: "var(--mid)", padding: "12px 0" }}>No trend data yet — needs 2+ evaluated exams</div>}
                <div className="sf-trend-labels">
                  {improvementTrends.slice(-5).map((t, i) => <span key={i} className="sf-trend-lbl">{t.examName?.split(" ").slice(-1)[0] || `E${i + 1}`}</span>)}
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

            {/* ── EARLY WARNING SYSTEM ── */}
            <div className="sf-card" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div>
                  <div className="sf-card-title">Early Warning System</div>
                  <div className="sf-card-sub">Students flagged by score decline or low homework engagement</div>
                </div>
                <span className="sf-chart-badge sf-cb-live" style={{ fontSize: 11 }}>Auto</span>
              </div>
              {isLoadingEW ? (
                <div style={{ padding: "20px 0", textAlign: "center" }}><div className="sf-spinner" /></div>
              ) : !earlyWarnings || earlyWarnings.length === 0 ? (
                <div className="sf-empty">
                  <div className="sf-empty-icon">🟢</div>
                  No at-risk students detected. Evaluate more answer sheets to enable early warnings.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {earlyWarnings.slice(0, 6).map((w: any, i: number) => {
                    const riskColor = w.riskLevel === "HIGH" ? "#d94f4f" : w.riskLevel === "MEDIUM" ? "#d08a2b" : "#3a8a5c";
                    const riskBg = w.riskLevel === "HIGH" ? "#fff0f0" : w.riskLevel === "MEDIUM" ? "#fff8ed" : "#f0faf4";
                    const riskIcon = w.riskLevel === "HIGH" ? "🔴" : w.riskLevel === "MEDIUM" ? "🟡" : "🟢";
                    return (
                      <div
                        key={i}
                        data-testid={`ew-student-${w.admissionNumber}`}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: riskBg, border: `1.5px solid ${riskColor}22` }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${riskColor}1a`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: riskColor, flexShrink: 0 }}>
                          {w.studentName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.studentName}</div>
                          <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 1 }}>
                            Class {w.studentClass} &nbsp;·&nbsp; Score: {w.earlierAvgPct}% → {w.recentAvgPct}% &nbsp;·&nbsp; HW: {w.hwSubmitted}/{w.hwTotal} submitted
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: riskColor, display: "flex", alignItems: "center", gap: 3 }}>
                            {riskIcon} {w.riskLevel}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--mid)", marginTop: 1 }}>Risk {w.riskScore}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── QUESTION QUALITY ANALYSIS ── */}
            <div className="sf-card" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div>
                  <div className="sf-card-title">Question Quality Analysis</div>
                  <div className="sf-card-sub">AI-classified questions where student performance was poor (&lt;50%)</div>
                </div>
                <span className="sf-chart-badge" style={{ background: "var(--lav-bg)", color: "var(--ink2)", fontSize: 11 }}>AI</span>
              </div>
              {isLoadingQQ ? (
                <div style={{ padding: "20px 0", textAlign: "center" }}><div className="sf-spinner" /></div>
              ) : !questionQuality || questionQuality.length === 0 ? (
                <div className="sf-empty">
                  <div className="sf-empty-icon">📊</div>
                  No poor-performing questions found. Evaluate more answer sheets to enable quality analysis.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {questionQuality.map((q: any, i: number) => {
                    const isTeachingGap = q.flag === "Teaching Gap";
                    const flagColor = isTeachingGap ? "#d94f4f" : "#d08a2b";
                    const flagBg = isTeachingGap ? "#fff0f0" : "#fff8ed";
                    const flagIcon = isTeachingGap ? "📖" : "❓";
                    return (
                      <div
                        key={i}
                        data-testid={`qq-question-${q.examId}-${q.questionNumber}`}
                        style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, background: flagBg, border: `1.5px solid ${flagColor}22` }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${flagColor}1a`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                          {flagIcon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                            {q.examName} — Q{q.questionNumber}
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase" }}>{q.subject}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>
                            Avg score: <b style={{ color: flagColor }}>{q.avgPct}%</b> &nbsp;·&nbsp; {q.studentsAffected} student{q.studentsAffected !== 1 ? "s" : ""} affected
                          </div>
                          {q.flagReason && (
                            <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 3, fontStyle: "italic" }}>{q.flagReason}</div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: flagColor, padding: "2px 8px", borderRadius: 6, background: `${flagColor}18`, border: `1px solid ${flagColor}30` }}>
                            {q.flag}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── HOMEWORK TAB ── */}
        {activeSection === "homework" && (
          <div>
            <div className="sf-panel" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div>
                  <div className="sf-panel-title">Homework Assignments</div>
                  <div className="sf-panel-sub">Assign homework to a class — students submit photos for AI evaluation</div>
                </div>
                <Button size="sm" className="rounded-xl gap-1" onClick={() => setIsHwDialogOpen(true)} data-testid="button-assign-homework">
                  <Plus className="h-3 w-3" /> Assign Homework
                </Button>
              </div>

              {!teacherHomework ? (
                <div style={{ padding: "24px 0", textAlign: "center" }}><Spinner /></div>
              ) : teacherHomework.length === 0 ? (
                <div className="sf-empty"><div className="sf-empty-icon">📋</div>No homework assigned yet. Click "Assign Homework" to get started.</div>
              ) : (
                teacherHomework.map((hw: any) => (
                  <div key={hw.id} className="sf-exam-item" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 12 }}>
                      <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", flexShrink: 0 }}>📝</div>
                      <div className="sf-exam-info" style={{ flex: 1 }}>
                        <div className="sf-exam-name">{hw.subject} — Class {hw.studentClass}{hw.section ? ` (${hw.section})` : ""}</div>
                        <div className="sf-exam-meta">{hw.description}</div>
                        <div className="sf-exam-meta">Due: {new Date(hw.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                      </div>
                      <span className="sf-exam-status sf-es-done" style={{ flexShrink: 0 }}>{hw.submissionCount ?? 0} submitted</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Create Homework Dialog */}
            <Dialog open={isHwDialogOpen} onOpenChange={setIsHwDialogOpen}>
              <DialogContent style={{ maxWidth: 520 }}>
                <DialogHeader>
                  <DialogTitle>Assign Homework</DialogTitle>
                </DialogHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label className="sf-fld-lbl">Subject *</label>
                      <select className="sf-fsel" style={{ width: "100%" }} value={hwSubject} onChange={e => setHwSubject(e.target.value)} data-testid="select-hw-subject">
                        <option value="">Select subject…</option>
                        {(teacherOptions?.subjects || ["Mathematics", "Science", "English", "Social Studies", "Hindi"]).map(s => <option key={s} value={s}>{s}</option>)}
                        <option value="_custom">Other…</option>
                      </select>
                      {hwSubject === "_custom" && <Input placeholder="Enter subject" className="rounded-xl mt-1" onChange={e => setHwSubject(e.target.value)} data-testid="input-hw-subject-custom" />}
                    </div>
                    <div>
                      <label className="sf-fld-lbl">Class *</label>
                      <select className="sf-fsel" style={{ width: "100%" }} value={hwClass} onChange={e => setHwClass(e.target.value)} data-testid="select-hw-class">
                        <option value="">Select class…</option>
                        {(teacherOptions?.classes || ["8", "9", "10", "11", "12"]).map(c => <option key={c} value={c}>Class {c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="sf-fld-lbl">Section</label>
                      <select className="sf-fsel" style={{ width: "100%" }} value={hwSection} onChange={e => setHwSection(e.target.value)} data-testid="select-hw-section">
                        <option value="">All sections</option>
                        {(teacherOptions?.sections || ["A", "B", "C", "D"]).map(s => <option key={s} value={s}>Section {s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="sf-fld-lbl">Due Date *</label>
                      <Input type="date" value={hwDueDate} onChange={e => setHwDueDate(e.target.value)} data-testid="input-hw-due" />
                    </div>
                  </div>
                  <div>
                    <label className="sf-fld-lbl">Description / Task *</label>
                    <Textarea placeholder="Describe what students need to do…" value={hwDescription} onChange={e => setHwDescription(e.target.value)} data-testid="input-hw-description" rows={3} />
                  </div>
                  <div>
                    <label className="sf-fld-lbl">Model Solution (for AI grading)</label>
                    <Textarea placeholder="Provide the expected answer for AI to compare student submissions against…" value={hwModelSolution} onChange={e => setHwModelSolution(e.target.value)} data-testid="input-hw-solution" rows={4} />
                  </div>
                  <Button
                    disabled={isCreatingHw || !hwSubject || !hwClass || !hwDescription || !hwDueDate}
                    onClick={() => { setIsCreatingHw(true); createHomework.mutate(); }}
                    data-testid="button-create-homework"
                  >
                    {isCreatingHw ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating…</> : "Assign Homework"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* ── EARLY WARNING TAB ── */}
        {activeSection === "early-warning" && (() => {
          const highRisk = (earlyWarnings || []).filter((w: any) => w.riskLevel === "HIGH");
          const top5 = (earlyWarnings || []).filter((w: any) => w.riskLevel !== "HIGH").slice(0, 5);

          const EWStudentCard = ({ w, showSection }: { w: any; showSection?: boolean }) => {
            const isExpanded = expandedEWStudent === w.admissionNumber;
            const riskColor = w.riskLevel === "HIGH" ? "#d94f4f" : w.riskLevel === "MEDIUM" ? "#d08a2b" : "#3a8a5c";
            const riskBg = w.riskLevel === "HIGH" ? "#fff0f0" : w.riskLevel === "MEDIUM" ? "#fff8ed" : "#f0faf4";
            const riskIcon = w.riskLevel === "HIGH" ? "🔴" : w.riskLevel === "MEDIUM" ? "🟡" : "🟢";
            return (
              <div key={w.admissionNumber} data-testid={`ew-tab-student-${w.admissionNumber}`} style={{ borderRadius: 14, border: `1.5px solid ${riskColor}22`, overflow: "hidden", background: riskBg }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}
                  onClick={() => setExpandedEWStudent(isExpanded ? null : w.admissionNumber)}
                >
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${riskColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: riskColor, flexShrink: 0 }}>
                    {w.studentName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{w.studentName}</div>
                    <div style={{ fontSize: 12, color: "var(--mid)", marginTop: 2 }}>
                      Class {w.studentClass} &nbsp;·&nbsp; {w.earlierAvgPct}% → {w.recentAvgPct}% &nbsp;·&nbsp; HW: {w.hwSubmitted}/{w.hwTotal}
                    </div>
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
                    {/* Risk Reason */}
                    <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(0,0,0,0.04)", borderRadius: 10, fontSize: 13, color: "var(--ink)", lineHeight: 1.6 }}>
                      <b>Why at risk:</b> {w.riskReason || "Insufficient data for detailed analysis."}
                    </div>
                    {/* Subject Breakdown */}
                    {(w.subjectBreakdown || []).length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Subject Performance</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {(w.subjectBreakdown || []).map((sb: any) => (
                            <div key={sb.subject}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                                <span style={{ color: "var(--ink)", fontWeight: 500 }}>{sb.subject}</span>
                                <span style={{ color: sb.avgPct < 50 ? "#d94f4f" : sb.avgPct < 65 ? "#d08a2b" : "#3a8a5c", fontWeight: 600 }}>{sb.avgPct}%</span>
                              </div>
                              <div style={{ height: 5, borderRadius: 3, background: "rgba(0,0,0,0.08)" }}>
                                <div style={{ height: "100%", borderRadius: 3, width: `${sb.avgPct}%`, background: sb.avgPct < 50 ? "#d94f4f" : sb.avgPct < 65 ? "#d08a2b" : "#3a8a5c", transition: "width 0.4s" }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Evaluation Timeline */}
                    {(w.evalTimeline || []).length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Evaluation History</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(w.evalTimeline || []).map((et: any, idx: number) => (
                            <div key={et.evalId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 10px", background: "rgba(255,255,255,0.5)", borderRadius: 6, fontSize: 12 }}>
                              <span style={{ color: "var(--mid)" }}>#{idx + 1} {et.examName || et.subject}</span>
                              <span style={{ fontWeight: 600, color: et.pct < 50 ? "#d94f4f" : et.pct < 65 ? "#d08a2b" : "#3a8a5c" }}>{et.pct}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* HW Stats */}
                    <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                      <div style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.5)", borderRadius: 9, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: w.hwMissRate > 50 ? "#d94f4f" : "#3a8a5c" }}>{w.hwSubmitted}/{w.hwTotal}</div>
                        <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>HW Submitted</div>
                      </div>
                      <div style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.5)", borderRadius: 9, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: w.hwMissRate > 50 ? "#d94f4f" : "#3a8a5c" }}>{w.hwMissRate}%</div>
                        <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>HW Miss Rate</div>
                      </div>
                      <div style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.5)", borderRadius: 9, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: w.scoreTrend > 5 ? "#d94f4f" : w.scoreTrend < -2 ? "#3a8a5c" : "#d08a2b" }}>
                          {w.scoreTrend > 0 ? `↓${w.scoreTrend}%` : w.scoreTrend < 0 ? `↑${Math.abs(w.scoreTrend)}%` : "→"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>Score Trend</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          };

          return (
            <div className="sf-panel">
              <div className="sf-panel-title">Early Warning System</div>
              <div className="sf-panel-sub">
                {teacherScope?.isClassTeacher
                  ? `Entire class ${teacherScope.classTeacherOf} — click any student to see a full risk explanation`
                  : "Students in your subjects — click any student to see a full risk explanation"}
              </div>
              {isLoadingEW ? (
                <div style={{ padding: "32px 0", textAlign: "center" }}><div className="sf-spinner" /></div>
              ) : !earlyWarnings || earlyWarnings.length === 0 ? (
                <div className="sf-empty"><div className="sf-empty-icon">🟢</div>No at-risk students detected. Evaluate more answer sheets to enable early warnings.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {highRisk.length > 0 && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#d94f4f" }}>🔴 High Risk Students</span>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#fff0f0", color: "#d94f4f", fontWeight: 600 }}>{highRisk.length}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {highRisk.map((w: any) => <EWStudentCard key={w.admissionNumber} w={w} />)}
                      </div>
                    </div>
                  )}
                  {top5.length > 0 && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#d08a2b" }}>⚠ Top 5 At-Risk Students</span>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#fff8ed", color: "#d08a2b", fontWeight: 600 }}>{top5.length}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {top5.map((w: any) => <EWStudentCard key={w.admissionNumber} w={w} />)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── EXAMS TAB — Repository View ── */}
        {activeSection === "exams" && (
          <div className="sf-panel">
            <div className="sf-panel-title">Exam Repository</div>
            <div className="sf-panel-sub">All your exams — expand any card to view the model answer and upload student scripts</div>
            {isLoadingExams ? (
              <div style={{ textAlign: "center", padding: "32px" }}><div className="sf-spinner" /></div>
            ) : examsList && examsList.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {examsList.map((exam: any) => {
                  const isExpanded = expandedExamId === exam.id;
                  const isThisExam = selectedExamId === String(exam.id);
                  const subjectIcon = exam.subject?.toLowerCase().includes("math") ? "📐" : exam.subject?.toLowerCase().includes("sci") ? "🔬" : exam.subject?.toLowerCase().includes("eng") ? "📖" : exam.subject?.toLowerCase().includes("phys") ? "⚛️" : exam.subject?.toLowerCase().includes("chem") ? "⚗️" : exam.subject?.toLowerCase().includes("bio") ? "🧬" : "📝";
                  const evaluated = (exam.sheetsEvaluated || 0) > 0;
                  return (
                    <div key={exam.id} style={{ border: "1.5px solid var(--rule)", borderRadius: 16, overflow: "hidden", background: isExpanded ? "var(--pane)" : "var(--card)" }}>
                      {/* Card header — always visible */}
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}
                        onClick={() => {
                          const next = isExpanded ? null : exam.id;
                          setExpandedExamId(next);
                          if (next) setSelectedExamId(String(exam.id));
                        }}
                        data-testid={`exam-card-${exam.id}`}
                      >
                        <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", flexShrink: 0 }}>{subjectIcon}</div>
                        <div className="sf-exam-info" style={{ flex: 1 }}>
                          <div className="sf-exam-name">{exam.examName || `${exam.subject} Exam`}</div>
                          <div className="sf-exam-meta">
                            Class {exam.className} · {exam.totalMarks} marks · {new Date(exam.createdAt || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {exam.sheetsEvaluated || 0} evaluated
                          </div>
                        </div>
                        <span className={`sf-exam-status ${evaluated ? "sf-es-done" : "sf-es-draft"}`}>{evaluated ? "Evaluated" : "Pending"}</span>
                        <span style={{ fontSize: 16, color: "var(--mid)", marginLeft: 4 }}>{isExpanded ? "▲" : "▼"}</span>
                      </div>

                      {/* Expanded body */}
                      {isExpanded && (
                        <div style={{ padding: "0 18px 20px", borderTop: "1px solid var(--rule)" }}>
                          {/* Model Answer */}
                          <div style={{ marginTop: 16, marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Model Answer</div>
                            <div style={{ fontSize: 13, color: "var(--ink)", background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 10, padding: "12px 14px", whiteSpace: "pre-wrap", lineHeight: 1.7, maxHeight: 160, overflowY: "auto" }}>
                              {exam.modelAnswerText || "No model answer provided."}
                            </div>
                          </div>

                          {/* Upload area */}
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Upload Answer Sheets</div>
                          <DropZone onFile={handleAnswerSheetUpload} isProcessing={processingId !== null} />

                          {/* Bulk upload */}
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                            <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => bulkInputRef.current?.click()} data-testid={`button-bulk-upload-${exam.id}`}>
                              <Upload className="h-3 w-3" /> Add bulk images
                            </Button>
                            <input ref={bulkInputRef} type="file" accept="image/*" multiple className="hidden"
                              onChange={e => { const files = Array.from(e.target.files || []); setBulkFiles(prev => [...prev, ...files]); e.target.value = ""; }} />
                            {bulkFiles.length > 0 && (
                              <Button size="sm" className="rounded-xl gap-2" disabled={isBulkUploading} onClick={handleBulkUpload} data-testid={`button-bulk-submit-${exam.id}`}>
                                {isBulkUploading ? <><Loader2 className="h-3 w-3 animate-spin" /> Processing…</> : `Upload ${bulkFiles.length} images`}
                              </Button>
                            )}
                          </div>
                          {bulkFiles.length > 0 && <p style={{ fontSize: 12, color: "var(--mid)", marginTop: 6 }}>{bulkFiles.length} file(s): {bulkFiles.map(f => f.name).join(", ")}</p>}

                          {/* Answer sheets for this exam */}
                          {isThisExam && answerSheets && answerSheets.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Submitted Sheets</div>
                              {answerSheets.map((sheet: any) => (
                                <div key={sheet.id} className="sf-exam-item" style={{ cursor: "default" }}>
                                  <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", fontSize: 12 }}>{getInitials(sheet.studentName || sheet.admissionNumber)}</div>
                                  <div className="sf-exam-info">
                                    <div className="sf-exam-name">{sheet.studentName || sheet.admissionNumber}</div>
                                    <div className="sf-exam-meta">{sheet.admissionNumber} · {sheet.status}</div>
                                  </div>
                                  {sheet.status === "evaluated" ? (
                                    <span className="sf-exam-status sf-es-done">{sheet.totalMarks}/{sheet.maxMarks}</span>
                                  ) : (
                                    <Button size="sm" className="rounded-xl gap-1" disabled={evaluatingId === sheet.id} onClick={() => handleEvaluate(sheet.id)} data-testid={`button-evaluate-${sheet.id}`}>
                                      {evaluatingId === sheet.id ? <><Loader2 className="h-3 w-3 animate-spin" /> Evaluating…</> : <><Star className="h-3 w-3" /> Evaluate</>}
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Merged bulk scripts */}
                          {isThisExam && mergedScripts && mergedScripts.length > 0 && (
                            <div style={{ marginTop: 14 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Bulk Scripts</div>
                              {mergedScripts.map((ms: any) => (
                                <div key={ms.id} className="sf-exam-item" style={{ cursor: "default" }}>
                                  <div className="sf-exam-subj" style={{ background: "var(--blue-bg)", fontSize: 12 }}>{getInitials(ms.studentName || ms.admissionNumber)}</div>
                                  <div className="sf-exam-info">
                                    <div className="sf-exam-name">{ms.studentName || ms.admissionNumber}</div>
                                    <div className="sf-exam-meta">{ms.totalPages} pages · {ms.status}</div>
                                  </div>
                                  {ms.status === "evaluated" ? (
                                    <span className="sf-exam-status sf-es-done">{ms.totalMarks}/{ms.maxMarks}</span>
                                  ) : (
                                    <Button size="sm" className="rounded-xl gap-1" disabled={bulkEvaluatingId === ms.id} onClick={() => handleBulkEvaluate(ms.id)} data-testid={`button-bulk-evaluate-${ms.id}`}>
                                      {bulkEvaluatingId === ms.id ? <><Loader2 className="h-3 w-3 animate-spin" /> Evaluating…</> : <><Star className="h-3 w-3" /> Evaluate</>}
                                    </Button>
                                  )}
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
        <ProfileDrawer open={isProfilePanelOpen} onClose={() => setIsProfilePanelOpen(false)} />
      </div>

      {/* ── CREATE EXAM DIALOG ── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Exam</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="subject" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="rounded-xl" data-testid="select-exam-subject"><SelectValue placeholder="Select subject…" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(teacherOptions?.subjects || ["Mathematics", "Science", "English", "Social Studies", "Hindi"]).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        <SelectItem value="_custom">Other (type below)</SelectItem>
                      </SelectContent>
                    </Select>
                    {field.value === "_custom" && <Input placeholder="Enter subject name" className="rounded-xl mt-1" onChange={e => field.onChange(e.target.value)} data-testid="input-exam-subject-custom" />}
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="className" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Class</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="rounded-xl" data-testid="select-exam-class"><SelectValue placeholder="Select class…" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(teacherOptions?.classes || ["8", "9", "10", "11", "12"]).map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
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
                    {/* Hero */}
                    <div style={{ background: "#dddaf5", padding: "28px 28px 24px", textAlign: "center" }}>
                      <div style={{ width: 60, height: 60, borderRadius: 16, background: "#f5f3ee", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 12px rgba(26,26,46,0.1)" }}>
                        <TrendingUp style={{ width: 26, height: 26, color: "#1a1a2e" }} />
                      </div>
                      <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: 22, color: "#1a1a2e", marginBottom: 8, lineHeight: 1.2 }}>Class Performance</h2>
                      <p style={{ fontSize: 13.5, color: "#6b6b85", lineHeight: 1.55, maxWidth: 280, margin: "0 auto" }}>Ask any question about student progress, weak areas, or performance trends.</p>
                    </div>
                    {/* Pills */}
                    <div style={{ background: "#dddaf5", padding: "0 28px 20px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                      {["Performance", "Students", "Homework", "Trends"].map(p => (
                        <span key={p} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 20, background: "rgba(26,26,46,0.08)", color: "#4a4a7a" }}>{p}</span>
                      ))}
                    </div>
                    {/* Questions */}
                    <div style={{ padding: "20px 24px 24px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8888a8", marginBottom: 12 }}>Example Questions</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                        {EXAMPLE_QUESTIONS.map(q => (
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
                      {messages?.map(msg => (
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
                        <input placeholder="Ask about student performance…" value={chatMessage} onChange={e => setChatMessage(e.target.value)} disabled={sendMessage.isPending} style={{ flex: 1, border: "1px solid #E0DCF0", borderRadius: 7, padding: "7px 11px", fontSize: 13, fontFamily: "DM Sans, sans-serif", background: "white", color: "#1a1a2e", outline: "none" }} data-testid="input-chat-message" />
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
          <button onClick={() => setIsChatOpen(true)} style={{ width: 56, height: 56, borderRadius: "50%", background: "#1a1a2e", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 30px rgba(26,26,46,0.3)", transition: "transform 0.2s" }}>
            <MessageSquare style={{ width: 22, height: 22, color: "white" }} />
          </button>
        </motion.div>
      )}
    </div>
  );
}
