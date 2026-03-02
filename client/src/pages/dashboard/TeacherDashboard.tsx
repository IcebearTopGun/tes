import "@/dashboard.css";
import { useTeacherDashboard } from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, X, Upload, MessageSquare, TrendingUp, Send, Star, Plus, BookOpen as BookOpenIcon, BarChart2, ChevronDown, ChevronUp, Info } from "lucide-react";
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

interface StructuredSubject {
  name: string;
  code: string;
  className: string;
  section: string;
}

interface ClassSection {
  className: string;
  section: string;
}

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

type ScriptEntry = {
  admissionNumber: string;
  studentName: string;
  pages: number;
  status: "pending" | "evaluating" | "done" | "error";
  scriptId?: number;
  marks?: string;
  maxMarks?: number;
};

function BulkUploadZone({
  examId,
  onUploadComplete,
}: {
  examId: number;
  onUploadComplete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"" | "reading" | "ocr" | "done">("");
  const [readDone, setReadDone] = useState(0);
  const [grouped, setGrouped] = useState<ScriptEntry[]>([]);
  const { toast } = useToast();

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const imgs = Array.from(incoming).filter(f => f.type.startsWith("image/"));
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...imgs.filter(f => !names.has(f.name))];
    });
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const handleUpload = async () => {
    if (!files.length) return;
    setIsUploading(true);
    setUploadPhase("reading");
    setReadDone(0);
    try {
      const images: { imageBase64: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        images.push({ imageBase64: await readFileAsDataUrl(files[i]) });
        setReadDone(i + 1);
      }
      setUploadPhase("ocr");
      const res = await fetchWithAuth(`/api/exams/${examId}/bulk-upload`, {
        method: "POST",
        body: JSON.stringify({ images }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Upload failed");

      const scripts: any[] = result.mergedScripts || [];
      const ocrDetails: any[] = result.ocrDetails || [];
      const errors: string[] = result.errors || [];

      // Log OCR details for debugging
      if (ocrDetails.length > 0) {
        console.log("[BULK] OCR details:", ocrDetails);
      }

      setGrouped(prev => {
        const map = new Map(prev.map(e => [e.admissionNumber, e]));
        for (const s of scripts) {
          let pageCount = 1;
          try {
            const ids = typeof s.pageIds === "string" ? JSON.parse(s.pageIds) : s.pageIds;
            pageCount = Array.isArray(ids) ? ids.length : 1;
          } catch {}
          map.set(s.admissionNumber, {
            admissionNumber: s.admissionNumber,
            studentName: s.studentName,
            pages: pageCount,
            status: "pending",
            scriptId: s.id,
          });
        }
        return Array.from(map.values());
      });
      setFiles([]);
      setUploadPhase("done");

      if (scripts.length === 0 && ocrDetails.length > 0) {
        // OCR ran but grouping produced nothing — show diagnostic
        const names = ocrDetails.map((d: any) => `${d.studentName} (adm: ${d.admissionNumber})`).join(", ");
        toast({
          title: "Pages read but not grouped",
          description: `AI read ${ocrDetails.length} page(s): ${names}. ${errors.length > 0 ? errors.join("; ") : "Check that each page clearly shows the student's admission number."}`,
          variant: "destructive",
        });
      } else if (scripts.length === 0) {
        toast({
          title: "No scripts grouped",
          description: errors.length > 0 ? errors.join("; ") : "AI could not read student information from the pages. Ensure each page shows Name and Admission Number clearly.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Upload complete", description: `${scripts.length} student script${scripts.length !== 1 ? "s" : ""} grouped — click Evaluate to grade.` });
      }
      onUploadComplete();
    } catch (err: any) {
      setUploadPhase("");
      toast({ title: "Upload failed", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const evaluateScript = async (idx: number) => {
    const g = grouped[idx];
    if (!g.scriptId) return;
    setGrouped(prev => prev.map((s, i) => i === idx ? { ...s, status: "evaluating" } : s));
    try {
      const res = await fetchWithAuth(`/api/merged-scripts/${g.scriptId}/evaluate`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Evaluation failed");
      setGrouped(prev => prev.map((s, i) => i === idx
        ? { ...s, status: "done", marks: String(result.totalMarks ?? "?"), maxMarks: result.maxMarks }
        : s));
      onUploadComplete();
      toast({ title: "Evaluated", description: `${g.studentName} scored ${result.totalMarks ?? "?"} marks.` });
    } catch (err: any) {
      setGrouped(prev => prev.map((s, i) => i === idx ? { ...s, status: "error" } : s));
      toast({ title: "Evaluation failed", description: err.message, variant: "destructive" });
    }
  };

  const evaluateAll = async () => {
    const pending = grouped.map((g, i) => ({ g, i })).filter(({ g }) => g.status === "pending");
    for (const { i } of pending) {
      await evaluateScript(i);
    }
  };

  const pendingCount = grouped.filter(g => g.status === "pending").length;
  const doneCount = grouped.filter(g => g.status === "done").length;

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? "var(--lavender)" : "var(--rule)"}`,
          borderRadius: 16,
          padding: "28px 20px",
          textAlign: "center",
          cursor: isUploading ? "default" : "pointer",
          background: isDragging ? "var(--lav-bg)" : "var(--cream)",
          transition: "all 0.15s",
        }}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
        <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
          Drop all answer sheet pages here
        </div>
        <div style={{ fontSize: 12, color: "var(--mid)", marginTop: 6, lineHeight: 1.5, maxWidth: 360, margin: "6px auto 0" }}>
          Upload multiple images at once. Each page must clearly show the student's <strong>name</strong>, <strong>admission number</strong>, and <strong>page number</strong> — AI will read and group them per student automatically.
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 6, justifyContent: "center" }}>
          {["JPG", "PNG", "WEBP"].map(fmt => (
            <span key={fmt} style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "var(--lav-bg)", color: "var(--ink2)" }}>{fmt}</span>
          ))}
        </div>
      </div>

      {/* Selected file list */}
      {files.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {files.length} page{files.length !== 1 ? "s" : ""} selected
            </span>
            <button onClick={() => setFiles([])} style={{ fontSize: 11, color: "#d94f4f", background: "none", border: "none", cursor: "pointer" }}>
              Remove all
            </button>
          </div>

          {/* Scrollable file list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflowY: "auto", marginBottom: 12, padding: "2px 0" }}>
            {files.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "var(--card)", border: "1px solid var(--rule)" }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>🖼</span>
                <span style={{ flex: 1, fontSize: 12, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                <span style={{ fontSize: 11, color: "var(--mid)", flexShrink: 0 }}>{f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)}MB` : `${(f.size / 1024).toFixed(0)}KB`}</span>
                <button
                  onClick={e => { e.stopPropagation(); removeFile(i); }}
                  style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "#fff0f0", color: "#b03030", cursor: "pointer", fontSize: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                >×</button>
              </div>
            ))}
          </div>

          {/* Upload progress bar */}
          {isUploading && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--mid)", marginBottom: 5 }}>
                <span>
                  {uploadPhase === "reading" ? `Reading files… (${readDone}/${files.length})` : "AI OCR — reading handwriting and grouping by student…"}
                </span>
                {uploadPhase === "reading" && <span>{Math.round((readDone / files.length) * 100)}%</span>}
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "var(--cream2)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  background: uploadPhase === "ocr" ? "var(--lavender)" : "var(--ink2)",
                  width: uploadPhase === "ocr" ? "100%" : `${files.length > 0 ? (readDone / files.length) * 100 : 0}%`,
                  transition: "width 0.3s",
                  animation: uploadPhase === "ocr" ? "pulse 1.5s ease-in-out infinite" : "none",
                }} />
              </div>
            </div>
          )}

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={isUploading}
            style={{
              width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
              background: isUploading ? "var(--cream2)" : "var(--ink)",
              color: isUploading ? "var(--mid)" : "white",
              fontSize: 13, fontWeight: 700, cursor: isUploading ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {isUploading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {uploadPhase === "reading" ? "Reading files…" : "AI is reading handwriting & grouping…"}</>
              : <><Upload className="h-4 w-4" /> Process {files.length} page{files.length !== 1 ? "s" : ""} with AI OCR</>
            }
          </button>
        </div>
      )}

      {/* Grouped scripts panel */}
      {grouped.length > 0 && (
        <div style={{ marginTop: 20, borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                {grouped.length} student script{grouped.length !== 1 ? "s" : ""} grouped
              </div>
              <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>
                {doneCount}/{grouped.length} evaluated
              </div>
            </div>
            {pendingCount > 0 && (
              <button
                onClick={evaluateAll}
                style={{
                  fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 8,
                  background: "var(--ink)", color: "white", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <Star className="h-3 w-3" /> Evaluate All ({pendingCount})
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {grouped.map((g, i) => {
              const pct = g.marks && g.maxMarks ? Math.round((parseInt(g.marks) / g.maxMarks) * 100) : null;
              const barColor = pct !== null ? (pct >= 75 ? "#2a9d6e" : pct >= 50 ? "#d08a2b" : "#d94f4f") : "var(--lavender)";
              const statusBg = g.status === "done" ? "#f0faf4" : g.status === "error" ? "#fff0f0" : g.status === "evaluating" ? "#fff8ed" : "var(--card)";
              const statusBorder = g.status === "done" ? "#2a9d6e30" : g.status === "error" ? "#d94f4f30" : "var(--rule)";

              return (
                <div key={g.admissionNumber} style={{ borderRadius: 12, border: `1.5px solid ${statusBorder}`, background: statusBg, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
                    {/* Avatar */}
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--lav-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "var(--ink2)", flexShrink: 0 }}>
                      {g.studentName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "??"}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.studentName}</div>
                      <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 1 }}>
                        {g.admissionNumber} &nbsp;·&nbsp; {g.pages} page{g.pages !== 1 ? "s" : ""}
                      </div>
                    </div>
                    {/* Status / score */}
                    {g.status === "done" && (
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: barColor }}>{g.marks}{g.maxMarks ? `/${g.maxMarks}` : ""}</div>
                        {pct !== null && <div style={{ fontSize: 10, color: "var(--mid)" }}>{pct}%</div>}
                      </div>
                    )}
                    {g.status === "evaluating" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#d08a2b", flexShrink: 0 }}>
                        <Loader2 className="h-3 w-3 animate-spin" /> Evaluating…
                      </div>
                    )}
                    {g.status === "error" && (
                      <div style={{ fontSize: 12, color: "#d94f4f", flexShrink: 0 }}>✗ Error</div>
                    )}
                    {g.status === "pending" && (
                      <button
                        onClick={() => evaluateScript(i)}
                        style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8, background: "var(--ink)", color: "white", border: "none", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <Star className="h-3 w-3" /> Evaluate
                      </button>
                    )}
                  </div>
                  {/* Score bar for done */}
                  {g.status === "done" && pct !== null && (
                    <div style={{ height: 3, background: "var(--cream2)" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.5s" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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

// ─── Rich Text Mini-Editor ────────────────────────────────────────────────────
// A lightweight contenteditable-based rich text editor that stores HTML
function RichTextEditor({
  value, onChange, placeholder, minHeight = 120, "data-testid": testId
}: { value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: number; "data-testid"?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);

  // Sync external value changes only on first mount
  useEffect(() => {
    if (ref.current && !isInitialized.current) {
      ref.current.innerHTML = value || "";
      isInitialized.current = true;
    }
  }, []);

  const execCmd = (cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    ref.current?.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const tools: { icon: string; cmd: string; val?: string; title: string }[] = [
    { icon: "B", cmd: "bold", title: "Bold" },
    { icon: "I", cmd: "italic", title: "Italic" },
    { icon: "U", cmd: "underline", title: "Underline" },
    { icon: "H₁", cmd: "formatBlock", val: "h3", title: "Heading" },
    { icon: "¶", cmd: "formatBlock", val: "p", title: "Paragraph" },
    { icon: "• —", cmd: "insertUnorderedList", title: "Bullet list" },
    { icon: "1. —", cmd: "insertOrderedList", title: "Numbered list" },
  ];

  return (
    <div style={{
      border: "1.5px solid var(--border)", borderRadius: 12, overflow: "hidden",
      background: "#fff", transition: "border-color 0.15s",
      boxShadow: "0 1px 3px rgba(0,0,0,.04)"
    }}
      onFocusCapture={e => (e.currentTarget.style.borderColor = "var(--ink)")}
      onBlurCapture={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Toolbar */}
      <div style={{
        display: "flex", gap: 2, padding: "6px 10px", background: "#f8f7f5",
        borderBottom: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center"
      }}>
        {tools.map(t => (
          <button
            key={t.cmd + (t.val || "")}
            title={t.title}
            onMouseDown={e => { e.preventDefault(); execCmd(t.cmd, t.val); }}
            style={{
              padding: "3px 8px", fontSize: 11, fontWeight: 700,
              border: "1px solid transparent", borderRadius: 5,
              background: "transparent", cursor: "pointer",
              color: "var(--ink2)", fontFamily: "inherit",
              transition: "all 0.1s",
              minWidth: 28, textAlign: "center"
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.background = "var(--cream)"; (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; (e.target as HTMLElement).style.borderColor = "transparent"; }}
          >{t.icon}</button>
        ))}
        <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }} />
        <button
          title="Clear formatting"
          onMouseDown={e => { e.preventDefault(); execCmd("removeFormat"); }}
          style={{ padding: "3px 8px", fontSize: 11, border: "1px solid transparent", borderRadius: 5, background: "transparent", cursor: "pointer", color: "var(--mid)", fontFamily: "inherit" }}
        >✕</button>
      </div>
      {/* Editable area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-testid={testId}
        data-placeholder={placeholder}
        className="hw-rte-content"
        onInput={() => { if (ref.current) onChange(ref.current.innerHTML); }}
        style={{
          minHeight, padding: "12px 14px", outline: "none",
          fontSize: 13, lineHeight: 1.65, color: "var(--ink)",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

// ─── OcrImageUploader ─────────────────────────────────────────────────────────
function OcrImageUploader({
  images,
  onImages,
  isProcessing,
  onProcess,
  label = "Upload question images",
  readFileAsDataUrl
}: {
  images: string[];
  onImages: (imgs: string[]) => void;
  isProcessing: boolean;
  onProcess: () => void;
  label?: string;
  readFileAsDataUrl: (f: File) => Promise<string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setIsUploading(true);
    const newImgs: string[] = [];
    for (const file of Array.from(files)) {
      try { newImgs.push(await readFileAsDataUrl(file)); } catch {}
    }
    onImages([...images, ...newImgs]);
    setIsUploading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); addImages(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? "var(--ink)" : "var(--border)"}`,
          borderRadius: 12, padding: "18px 16px", textAlign: "center",
          cursor: "pointer", background: isDragging ? "var(--cream)" : "#fafaf9",
          transition: "all 0.15s"
        }}
      >
        {isUploading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--mid)", fontSize: 13 }}>
            <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
            Reading images…
          </div>
        ) : (
          <div style={{ color: "var(--mid)", fontSize: 13 }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>📎</div>
            <div style={{ fontWeight: 600, color: "var(--ink2)" }}>{label}</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>Click or drag & drop · PNG, JPG, WEBP</div>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => addImages(e.target.files)} />
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
          {images.map((img, i) => (
            <div key={i} style={{
              position: "relative", borderRadius: 10, overflow: "hidden",
              border: "1.5px solid var(--border)", aspectRatio: "1",
              boxShadow: "0 1px 4px rgba(0,0,0,.06)"
            }}>
              <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button
                onClick={e => { e.stopPropagation(); onImages(images.filter((_, j) => j !== i)); }}
                style={{
                  position: "absolute", top: 4, right: 4,
                  width: 20, height: 20, borderRadius: "50%",
                  background: "#d94f4fee", color: "#fff", border: "none",
                  cursor: "pointer", fontSize: 11, display: "flex",
                  alignItems: "center", justifyContent: "center", fontWeight: 700
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* OCR button */}
      {images.length > 0 && (
        <button
          onClick={onProcess}
          disabled={isProcessing}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "8px 16px", borderRadius: 8, border: "1.5px solid var(--border)",
            background: isProcessing ? "var(--cream)" : "#fff", cursor: isProcessing ? "not-allowed" : "pointer",
            fontSize: 12, fontWeight: 600, color: "var(--ink2)", transition: "all 0.15s",
            width: "100%"
          }}
        >
          {isProcessing
            ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Processing text…</>
            : <><span style={{ fontSize: 14 }}>🔍</span> Extract text via OCR</>
          }
        </button>
      )}
    </div>
  );
}

// ─── HwTabBar ─────────────────────────────────────────────────────────────────
function HwTabBar({ active, onChange, errorTabs = [] }: {
  active: string;
  onChange: (t: "description"|"questions"|"answers") => void;
  errorTabs?: string[];
}) {
  const tabs = [
    { id: "description", icon: "📋", label: "Description" },
    { id: "questions",   icon: "❓", label: "Questions" },
    { id: "answers",     icon: "✅", label: "Model Answers" },
  ] as const;
  return (
    <div style={{ display: "flex", background: "#f5f4f1", borderRadius: 10, padding: 3, gap: 2 }}>
      {tabs.map(t => {
        const isActive = active === t.id;
        const hasError = errorTabs.includes(t.id);
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              flex: 1, padding: "7px 4px", borderRadius: 8,
              border: hasError && !isActive ? "1.5px solid #fca5a5" : "none",
              background: isActive ? (hasError ? "#fff5f5" : "#fff") : "transparent",
              boxShadow: isActive ? "0 1px 4px rgba(0,0,0,.08)" : "none",
              color: hasError ? (isActive ? "#dc2626" : "#ef4444") : (isActive ? "var(--ink)" : "var(--mid)"),
              fontWeight: isActive ? 700 : 500,
              fontSize: 12, cursor: "pointer", transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              position: "relative",
            }}
          >
            <span>{t.icon}</span>
            {t.label}
            {hasError && (
              <span style={{
                position: "absolute", top: 3, right: 5,
                width: 7, height: 7, borderRadius: "50%",
                background: "#ef4444",
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── HwAiChat ────────────────────────────────────────────────────────────────
function HwAiChat({ hw, onClose }: { hw: any; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Auto-focus on open
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    // Scroll to bottom on new message
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, loading]);

  const QUICK_PROMPTS = [
    "Summarise all submissions",
    "Who scored highest?",
    "What evaluation criteria was used?",
    "How many submitted on time?",
    "What are the common mistakes?",
  ];

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user" as const, content: text };
    setHistory(h => [...h, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/teacher/homework/${hw.id}/chat`, {
        method: "POST",
        body: JSON.stringify({ question: text, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      setHistory(h => [...h, { role: "assistant", content: data.answer }]);
    } catch (err: any) {
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
      setHistory(h => h.slice(0, -1)); // remove optimistic user message
    } finally {
      setLoading(false);
    }
  };

  const isPastDue = hw.dueDate < new Date().toISOString().split("T")[0];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
      pointerEvents: "none",
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0, background: "rgba(26,26,46,0.22)",
          backdropFilter: "blur(3px)", pointerEvents: "all",
          animation: "hwChatFadeIn 0.18s ease",
        }}
      />
      {/* Panel */}
      <div style={{
        position: "relative", width: 400, height: "100vh",
        background: "#0f0f1e", display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.3)", pointerEvents: "all",
        animation: "hwChatSlideIn 0.22s cubic-bezier(0.22,1,0.36,1)",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "16px 20px 14px", background: "#13132a",
          borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  background: "linear-gradient(135deg, #6c47d8, #3b82f6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13,
                }}>✦</div>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Homework AI</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.3, paddingRight: 8 }}>
                {hw.subject} — Class {hw.className}{hw.section ? ` · ${hw.section}` : ""}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600,
                  background: isPastDue ? "rgba(251,191,36,0.15)" : "rgba(34,197,94,0.15)",
                  color: isPastDue ? "#fbbf24" : "#4ade80",
                  border: `1px solid ${isPastDue ? "rgba(251,191,36,0.25)" : "rgba(34,197,94,0.25)"}`,
                }}>
                  {isPastDue ? "🔒 Past due" : `📅 Due ${new Date(hw.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                </span>
                <span style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600,
                  background: "rgba(99,102,241,0.15)", color: "#a5b4fc",
                  border: "1px solid rgba(99,102,241,0.25)",
                }}>
                  👥 {hw.submissionCount ?? 0}/{hw.totalStudents ?? 0} submitted
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: "rgba(255,255,255,0.08)", border: "none",
                cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s"
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            >✕</button>
          </div>
        </div>

        {/* ── Messages ── */}
        <div ref={scrollRef} style={{
          flex: 1, overflowY: "auto", padding: "16px 16px 8px",
          display: "flex", flexDirection: "column", gap: 12,
          background: "#0d0d1f",
        }}>
          {history.length === 0 && !loading && (
            <div style={{ padding: "12px 0" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 14, textAlign: "center" }}>
                Ask anything about this homework assignment
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {QUICK_PROMPTS.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    style={{
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 10, padding: "10px 14px", textAlign: "left",
                      fontSize: 13, color: "rgba(255,255,255,0.7)", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(108,71,216,0.12)"; e.currentTarget.style.borderColor = "rgba(108,71,216,0.3)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  >
                    <span style={{ fontSize: 10, opacity: 0.5 }}>↗</span> {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {history.map((msg, i) => (
            <div key={i} style={{
              display: "flex", gap: 10, alignItems: "flex-end",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              {msg.role === "assistant" && (
                <div style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  background: "linear-gradient(135deg,#6c47d8,#3b82f6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, color: "#fff", fontWeight: 700,
                }}>✦</div>
              )}
              <div style={{
                maxWidth: "82%", padding: "10px 13px", borderRadius: 12,
                fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
                ...(msg.role === "user" ? {
                  background: "linear-gradient(135deg,#6c47d8,#4f46e5)",
                  color: "#fff", borderBottomRightRadius: 4,
                } : {
                  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.88)",
                  border: "1px solid rgba(255,255,255,0.08)", borderBottomLeftRadius: 4,
                })
              }}>{msg.content}</div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#6c47d8,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 700 }}>✦</div>
              <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px 12px 12px 4px", padding: "10px 14px", display: "flex", gap: 5 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.4)", animation: `hwDot 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Input ── */}
        <div style={{
          padding: "12px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "#13132a", flexShrink: 0
        }}>
          <form
            onSubmit={e => { e.preventDefault(); send(input); }}
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about submissions, scores, criteria…"
              disabled={loading}
              style={{
                flex: 1, background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
                padding: "10px 14px", fontSize: 13, color: "#fff",
                outline: "none", fontFamily: "inherit", transition: "border-color 0.15s",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "rgba(108,71,216,0.6)")}
              onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              style={{
                width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                background: input.trim() && !loading ? "linear-gradient(135deg,#6c47d8,#4f46e5)" : "rgba(255,255,255,0.08)",
                border: "none", cursor: input.trim() && !loading ? "pointer" : "default",
                color: "#fff", fontSize: 16, display: "flex",
                alignItems: "center", justifyContent: "center", transition: "all 0.15s",
              }}
            >↑</button>
          </form>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 8, textAlign: "center" }}>
            Powered by AI · answers are based on this homework's data only
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HwClassGroup ─────────────────────────────────────────────────────────────
// Collapsible group header for a class+section
function HwClassGroup({ label, count, activeCount, children }: {
  label: string; count: number; activeCount: number; children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(true); // start collapsed by default
  return (
    <div style={{ marginBottom: 18 }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          background: "none", border: "none", cursor: "pointer", padding: "4px 0 10px",
          textAlign: "left",
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: "var(--lav-bg)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 800, color: "var(--ink2)",
          transition: "transform 0.15s",
        }}>
          {label.replace("Class ", "").split(" ")[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{label}</div>
          <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 1 }}>
            {count} assignment{count !== 1 ? "s" : ""}
            {activeCount > 0 && <span style={{ color: "#166534", marginLeft: 6 }}>· {activeCount} active</span>}
          </div>
        </div>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: "var(--cream)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "var(--mid)", transition: "all 0.15s",
          transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
        }}>▾</div>
      </button>
      {!collapsed && (
        <div style={{ paddingLeft: 0 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── HwListItem ─────────────────────────────────────────────────────────────
function HwListItem({ hw, today, onEval, onEdit, onDelete, onChat }: {
  hw: any; today: string;
  onEval: () => void; onEdit: () => void; onDelete: () => void; onChat: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isPastDue = hw.dueDate < today;
  const subCount = hw.submissionCount ?? 0;
  const totalStu = hw.totalStudents ?? 0;
  const pct = totalStu > 0 ? Math.round((subCount / totalStu) * 100) : 0;

  return (
    <div style={{
      borderRadius: 14,
      border: `1.5px solid ${isPastDue ? "rgba(26,26,46,.07)" : "rgba(26,26,46,.1)"}`,
      marginBottom: 8, background: isPastDue ? "#fafaf8" : "#fff",
      overflow: "visible", opacity: isPastDue ? 0.85 : 1,
      transition: "box-shadow 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", padding: "13px 14px", gap: 12 }}>
        {/* Subject icon */}
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: isPastDue ? "var(--cream)" : "var(--lav-bg)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0, marginTop: 1
        }}>📝</div>

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{hw.subject}</div>
            {hw.useNcertReference ? (
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#eff6ff", color: "#1d4ed8", fontWeight: 700 }}>NCERT</span>
            ) : null}
            {(hw.questionsText || hw.questionImages) ? (
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#fefce8", color: "#854d0e", fontWeight: 700 }}>Questions</span>
            ) : null}
          </div>

          {/* Description preview */}
          <div
            style={{ fontSize: 12, color: "var(--mid)", marginTop: 3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}
            dangerouslySetInnerHTML={{ __html: hw.description }}
          />

          {/* Badges */}
          <div style={{ display: "flex", gap: 7, marginTop: 7, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
              color: isPastDue ? "#92400e" : "#166534",
              background: isPastDue ? "#fef3c7" : "#dcfce7",
              padding: "2px 8px", borderRadius: 6,
            }}>
              {isPastDue ? "🔒" : "📅"} Due {new Date(hw.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
              color: pct === 100 ? "#166534" : pct > 50 ? "#92400e" : "var(--mid)",
              background: pct === 100 ? "#dcfce7" : pct > 50 ? "#fef3c7" : "var(--cream)",
              padding: "2px 8px", borderRadius: 6,
            }}>
              👥 {subCount}/{totalStu}{totalStu > 0 ? ` (${pct}%)` : ""}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          {/* AI Chat icon — the new feature */}
          <button
            onClick={onChat}
            title="Ask AI about this homework"
            data-testid={`btn-hw-chat-${hw.id}`}
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              border: "1.5px solid rgba(108,71,216,0.25)",
              background: "linear-gradient(135deg,rgba(108,71,216,0.08),rgba(59,130,246,0.08))",
              cursor: "pointer", fontSize: 15, color: "#6c47d8",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(108,71,216,0.18)"; e.currentTarget.style.borderColor = "rgba(108,71,216,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg,rgba(108,71,216,0.08),rgba(59,130,246,0.08))"; e.currentTarget.style.borderColor = "rgba(108,71,216,0.25)"; }}
          >✦</button>

          {/* Evaluations */}
          <button
            onClick={onEval}
            data-testid={`btn-hw-eval-${hw.id}`}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 11px", borderRadius: 8,
              border: "1.5px solid var(--border)", background: "#fff",
              fontSize: 12, fontWeight: 600, color: "var(--ink2)",
              cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--lav-bg)")}
            onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
          >
            <span>📊</span> Results
          </button>

          {/* Three-dot menu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen(p => !p)}
              data-testid={`btn-hw-menu-${hw.id}`}
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: "1.5px solid var(--border)", background: "#fff",
                cursor: "pointer", fontSize: 17, color: "var(--mid)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s"
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--cream)")}
              onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
            >⋮</button>
            {menuOpen && (
              <div
                style={{
                  position: "absolute", right: 0, top: 36, zIndex: 50,
                  background: "#fff", border: "1.5px solid var(--border)", borderRadius: 12,
                  boxShadow: "0 6px 24px rgba(0,0,0,.12)", minWidth: 172, overflow: "hidden"
                }}
                onMouseLeave={() => setMenuOpen(false)}
              >
                {!isPastDue ? (
                  <button
                    style={{ width: "100%", padding: "11px 16px", textAlign: "left", fontSize: 13, fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--cream)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    onClick={() => { setMenuOpen(false); onEdit(); }}
                  ><span>✏️</span> Edit Homework</button>
                ) : (
                  <div style={{ padding: "11px 16px", fontSize: 12, color: "var(--mid)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>🔒</span> Editing locked
                  </div>
                )}
                <div style={{ height: 1, background: "var(--border)", margin: "0 12px" }} />
                {!isPastDue ? (
                  <button
                    style={{ width: "100%", padding: "11px 16px", textAlign: "left", fontSize: 13, fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", color: "#d94f4f", display: "flex", alignItems: "center", gap: 8 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#fff0f0")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    onClick={() => { setMenuOpen(false); onDelete(); }}
                  ><span>🗑️</span> Delete</button>
                ) : (
                  <div style={{ padding: "11px 16px", fontSize: 12, color: "var(--mid)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>🔒</span> Deletion locked
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {totalStu > 0 && (
        <div style={{ padding: "0 14px 10px", marginTop: -4 }}>
          <div style={{ height: 3, background: "var(--cream)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              width: `${pct}%`, transition: "width 0.5s ease",
              background: pct === 100 ? "#22c55e" : pct > 50 ? "#f59e0b" : "var(--lav-card)"
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HwFormBody ─────────────────────────────────────────────────────────────────
// Shared form body used in both Create and Edit dialogs
function HwFormBody({
  activeTab, onTabChange,
  description, onDescription,
  questionsText, onQuestionsText,
  questionImages, onQuestionImages,
  modelSolution, onModelSolution,
  modelAnswerImages, onModelAnswerImages,
  useNcert, onUseNcert,
  hwClass, hwSubject,
  readFileAsDataUrl,
  requiredTabs = [],
}: {
  activeTab: "description"|"questions"|"answers";
  onTabChange: (t: "description"|"questions"|"answers") => void;
  description: string; onDescription: (v: string) => void;
  questionsText: string; onQuestionsText: (v: string) => void;
  questionImages: string[]; onQuestionImages: (v: string[]) => void;
  modelSolution: string; onModelSolution: (v: string) => void;
  modelAnswerImages: string[]; onModelAnswerImages: (v: string[]) => void;
  useNcert: boolean; onUseNcert: (v: boolean) => void;
  hwClass: string; hwSubject: string;
  readFileAsDataUrl: (f: File) => Promise<string>;
  requiredTabs?: string[];
}) {
  const [isOcrQProcessing, setIsOcrQProcessing] = useState(false);
  const [isOcrAProcessing, setIsOcrAProcessing] = useState(false);

  const simulateOcr = async (
    images: string[],
    currentText: string,
    onText: (v: string) => void,
    setProcessing: (v: boolean) => void
  ) => {
    if (!images.length) return;
    setProcessing(true);
    // In production this would call a real OCR endpoint
    // For now we simulate with a delay and append a placeholder
    await new Promise(r => setTimeout(r, 1400));
    onText(currentText + (currentText ? "\n" : "") + "[OCR text extracted from images — replace with actual OCR integration]");
    setProcessing(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Compute which required tabs are still empty */}
      {(() => {
        const isEmpty = (v: string) => !v || v === "<br>" || v === "<p><br></p>" || v.trim() === "";
        const errorTabs = requiredTabs.filter(t =>
          (t === "description" && isEmpty(description)) ||
          (t === "questions"   && isEmpty(questionsText))
        );
        return <HwTabBar active={activeTab} onChange={onTabChange} errorTabs={errorTabs} />;
      })()}

      {/* ── DESCRIPTION TAB ── */}
      {activeTab === "description" && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label className="sf-fld-lbl">Task Description</label>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#fee2e2", color: "#dc2626", fontWeight: 700 }}>Required</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 1 }}>Describe what students need to do. Rich formatting is supported.</div>
          </div>
          <RichTextEditor
            value={description}
            onChange={onDescription}
            placeholder="e.g. Read Chapter 3 and answer the following questions…"
            minHeight={140}
            data-testid="input-hw-description"
          />
        </div>
      )}

      {/* ── QUESTIONS TAB ── */}
      {activeTab === "questions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <label className="sf-fld-lbl">Write Questions</label>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#fee2e2", color: "#dc2626", fontWeight: 700 }}>Required</span>
            </div>
            <RichTextEditor
              value={questionsText}
              onChange={onQuestionsText}
              placeholder="Q1. Define photosynthesis.&#10;Q2. Explain the process of…"
              minHeight={130}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>or upload images</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <OcrImageUploader
            images={questionImages}
            onImages={onQuestionImages}
            isProcessing={isOcrQProcessing}
            onProcess={() => simulateOcr(questionImages, questionsText, onQuestionsText, setIsOcrQProcessing)}
            label="Upload question paper images"
            readFileAsDataUrl={readFileAsDataUrl}
          />
        </div>
      )}

      {/* ── ANSWERS TAB ── */}
      {activeTab === "answers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="sf-fld-lbl" style={{ marginBottom: 6, display: "block" }}>Model Answer (rich text)</label>
            <RichTextEditor
              value={modelSolution}
              onChange={onModelSolution}
              placeholder="Provide the expected answer for AI to grade against…"
              minHeight={130}
              data-testid="input-hw-solution"
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>or upload images</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <OcrImageUploader
            images={modelAnswerImages}
            onImages={onModelAnswerImages}
            isProcessing={isOcrAProcessing}
            onProcess={() => simulateOcr(modelAnswerImages, modelSolution, onModelSolution, setIsOcrAProcessing)}
            label="Upload model answer images"
            readFileAsDataUrl={readFileAsDataUrl}
          />

          {/* NCERT toggle */}
          <button
            type="button"
            onClick={() => onUseNcert(!useNcert)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 14px", borderRadius: 12, cursor: "pointer",
              border: `1.5px solid ${useNcert ? "#3b82f6" : "var(--border)"}`,
              background: useNcert ? "#eff6ff" : "#fafaf9",
              textAlign: "left", width: "100%", transition: "all 0.15s"
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 5, marginTop: 1, flexShrink: 0,
              border: `2px solid ${useNcert ? "#3b82f6" : "var(--border)"}`,
              background: useNcert ? "#3b82f6" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {useNcert && <span style={{ color: "#fff", fontSize: 11, fontWeight: 900 }}>✓</span>}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>📚 Reference NCERT books for evaluation</div>
              <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>
                AI will use the NCERT textbook for Class {hwClass || "—"}, {hwSubject || "—"} when grading student submissions.
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── EditHwForm ─────────────────────────────────────────────────
function EditHwForm({ hw, teacherOptions, onSave, isSaving, sectionsForClass, subjectsForClassSection, readFileAsDataUrl }: {
  hw: any;
  teacherOptions: any;
  onSave: (data: any) => void;
  isSaving: boolean;
  sectionsForClass: (cls: string) => string[];
  subjectsForClassSection: (cls: string, sec: string) => string[];
  readFileAsDataUrl: (file: File) => Promise<string>;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [cls, setCls] = useState(hw.className || "");
  const [sec, setSec] = useState(hw.section || "");
  const [subj, setSubj] = useState(hw.subject || "");
  const [desc, setDesc] = useState(hw.description || "");
  const [qText, setQText] = useState(hw.questionsText || "");
  const [qImgs, setQImgs] = useState<string[]>(() => { try { return hw.questionImages ? JSON.parse(hw.questionImages) : []; } catch { return []; } });
  const [mText, setMText] = useState(hw.modelSolutionText || "");
  const [mImgs, setMImgs] = useState<string[]>(() => { try { return hw.modelAnswerImages ? JSON.parse(hw.modelAnswerImages) : []; } catch { return []; } });
  const [ncert, setNcert] = useState(!!hw.useNcertReference);
  const [dueDate, setDueDate] = useState(hw.dueDate || "");
  const [activeTab, setActiveTab] = useState<"description"|"questions"|"answers">("description");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
      {/* Header fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label className="sf-fld-lbl">Class *</label>
          <select className="sf-fsel" style={{ width: "100%", marginTop: 4 }} value={cls}
            onChange={e => { setCls(e.target.value); setSec(""); setSubj(""); }}>
            {(teacherOptions?.classSections?.length
              ? [...new Set(teacherOptions.classSections.map((cs: any) => cs.className))].sort()
              : teacherOptions?.classes || []
            ).map((c: string) => <option key={c} value={c}>Class {c}</option>)}
          </select>
        </div>
        <div>
          <label className="sf-fld-lbl">Section *</label>
          <select className="sf-fsel" style={{ width: "100%", marginTop: 4 }} value={sec}
            onChange={e => { setSec(e.target.value); setSubj(""); }}>
            {sectionsForClass(cls).map((s: string) => <option key={s} value={s}>Section {s}</option>)}
          </select>
        </div>
        <div>
          <label className="sf-fld-lbl">Subject *</label>
          <select className="sf-fsel" style={{ width: "100%", marginTop: 4 }} value={subj}
            onChange={e => setSubj(e.target.value)}>
            {subjectsForClassSection(cls, sec).map((s: string) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="sf-fld-lbl">Due Date *</label>
          <Input type="date" value={dueDate} min={today} onChange={e => setDueDate(e.target.value)} style={{ marginTop: 4 }} />
        </div>
      </div>

      <HwFormBody
        activeTab={activeTab} onTabChange={setActiveTab}
        description={desc} onDescription={setDesc}
        questionsText={qText} onQuestionsText={setQText}
        questionImages={qImgs} onQuestionImages={setQImgs}
        modelSolution={mText} onModelSolution={setMText}
        modelAnswerImages={mImgs} onModelAnswerImages={setMImgs}
        useNcert={ncert} onUseNcert={setNcert}
        hwClass={cls} hwSubject={subj}
        readFileAsDataUrl={readFileAsDataUrl}
      />

      <Button
        disabled={isSaving || !subj || !cls || !sec || !desc || !dueDate}
        onClick={() => onSave({ subject: subj, studentClass: cls, section: sec, description: desc,
          questionsText: qText, questionImages: qImgs, modelSolution: mText,
          modelAnswerImages: mImgs, useNcertReference: ncert, dueDate })}
        style={{ marginTop: 4 }}
      >
        {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save Changes"}
      </Button>
    </div>
  );
}

// ─── HwEvaluationsModal ─────────────────────────────────────────────────────
function HwEvaluationsModal({ hwId, onClose }: { hwId: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data: evals, isLoading } = useQuery<any[]>({
    queryKey: ["/api/teacher/homework", hwId, "evaluations"],
    queryFn: () => fetchWithAuth(`/api/teacher/homework/${hwId}/evaluations`).then(r => r.json()),
    enabled: !!hwId,
  });

  const downloadExcel = () => {
    if (!evals?.length) return;
    const rows = [
      ["Admission No.", "Student Name", "Score (/100)", "Status", "On Time", "Submitted At", "AI Feedback"],
      ...evals.map(e => [
        e.admissionNumber, e.studentName || "—", e.correctnessScore ?? "Pending", e.status,
        e.isOnTime ? "Yes" : "No",
        e.submittedAt ? new Date(e.submittedAt).toLocaleString("en-IN") : "—",
        (e.aiFeedback || "—").replace(/"/g, "'")
      ])
    ];
    const csv = rows.map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `homework_${hwId}_evaluations.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded!", description: "Evaluation results exported." });
  };

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent style={{ maxWidth: 700, maxHeight: "88vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>📊</span> Homework Evaluations
          </DialogTitle>
        </DialogHeader>
        <div style={{ marginTop: 8 }}>
          {isLoading ? (
            <div style={{ padding: "32px 0", textAlign: "center" }}><Spinner /></div>
          ) : !evals?.length ? (
            <div className="sf-empty">
              <div className="sf-empty-icon">📭</div>
              No submissions yet for this homework.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "var(--cream)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                  {evals.length} submission{evals.length !== 1 ? "s" : ""}
                  <span style={{ fontWeight: 400, color: "var(--mid)", marginLeft: 8 }}>
                    Avg score: {evals.filter(e => e.correctnessScore != null).length > 0
                      ? Math.round(evals.filter(e => e.correctnessScore != null).reduce((a, e) => a + e.correctnessScore, 0) / evals.filter(e => e.correctnessScore != null).length)
                      : "—"}/100
                  </span>
                </div>
                <button
                  onClick={downloadExcel}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 8,
                    border: "1.5px solid var(--border)", background: "#fff",
                    fontSize: 12, fontWeight: 600, color: "var(--ink2)",
                    cursor: "pointer", transition: "all 0.15s"
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--lav-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                >
                  <span>⬇️</span> Export CSV
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {evals.map((e: any) => {
                  const score = e.correctnessScore;
                  const scoreBg = score == null ? "#f3f4f6" : score >= 75 ? "#f0faf4" : score >= 50 ? "#fff8ed" : "#fff0f0";
                  const scoreColor = score == null ? "#6b7280" : score >= 75 ? "#1a7a54" : score >= 50 ? "#d08a2b" : "#d94f4f";
                  return (
                    <div key={e.submissionId} style={{
                      borderRadius: 12, border: "1.5px solid var(--border)",
                      padding: "12px 14px", background: "#fff",
                      transition: "box-shadow 0.15s"
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        {/* Score circle */}
                        <div style={{
                          width: 44, height: 44, borderRadius: "50%",
                          background: scoreBg, display: "flex", alignItems: "center",
                          justifyContent: "center", fontSize: 13, fontWeight: 800,
                          color: scoreColor, flexShrink: 0, border: `2px solid ${scoreColor}22`
                        }}>
                          {score != null ? score : "—"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                              {e.studentName || e.admissionNumber}
                            </div>
                            <span style={{ fontSize: 11, color: "var(--mid)" }}>{e.admissionNumber}</span>
                            <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 5, fontWeight: 600,
                              background: e.isOnTime ? "#dcfce7" : "#fef3c7",
                              color: e.isOnTime ? "#166534" : "#92400e"
                            }}>
                              {e.isOnTime ? "✅ On time" : "⏰ Late"}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 3 }}>
                            Submitted: {e.submittedAt ? new Date(e.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                          </div>
                          {e.aiFeedback && (
                            <div style={{ fontSize: 11.5, color: "var(--ink2)", marginTop: 6, fontStyle: "italic", lineHeight: 1.5, background: "#fafaf9", padding: "6px 10px", borderRadius: 8, borderLeft: `3px solid ${scoreColor}` }}>
                              "{e.aiFeedback.slice(0, 200)}{e.aiFeedback.length > 200 ? "…" : ""}"
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{
                            fontSize: 15, fontWeight: 800,
                            color: scoreColor, padding: "4px 10px",
                            borderRadius: 8, background: scoreBg,
                            border: `1.5px solid ${scoreColor}22`
                          }}>
                            {score != null ? `${score}/100` : "Pending"}
                          </div>
                          {e.fileBase64 && (
                            <a href={e.fileBase64} target="_blank" rel="noopener noreferrer"
                              style={{ display: "block", fontSize: 11, color: "var(--mid)", marginTop: 6, textDecoration: "underline" }}>
                              📄 View sheet
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const [hoveredExamId, setHoveredExamId] = useState<number | null>(null);
  const [showPaperModal, setShowPaperModal] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const avaRef = useRef<HTMLDivElement>(null);
  const [isHwDialogOpen, setIsHwDialogOpen] = useState(false);
  const [hwSubject, setHwSubject] = useState("");
  const [hwClass, setHwClass] = useState("");
  const [hwSection, setHwSection] = useState("");
  const [hwDescription, setHwDescription] = useState("");
  const [hwQuestionsText, setHwQuestionsText] = useState("");
  const [hwQuestionImages, setHwQuestionImages] = useState<string[]>([]);
  const [hwModelSolution, setHwModelSolution] = useState("");
  const [hwModelAnswerImages, setHwModelAnswerImages] = useState<string[]>([]);
  const [hwUseNcert, setHwUseNcert] = useState(false);
  const [hwDueDate, setHwDueDate] = useState("");
  const [hwActiveTab, setHwActiveTab] = useState<"description"|"questions"|"answers">("description");
  const [isCreatingHw, setIsCreatingHw] = useState(false);
  const [isUploadingHwQImg, setIsUploadingHwQImg] = useState(false);
  const [isUploadingHwAImg, setIsUploadingHwAImg] = useState(false);
  const hwQuestionImgRef = useRef<HTMLInputElement>(null);
  const hwAnswerImgRef = useRef<HTMLInputElement>(null);
  // Edit homework
  const [editingHw, setEditingHw] = useState<any | null>(null);
  const [isHwEditDialogOpen, setIsHwEditDialogOpen] = useState(false);
  // Evaluations modal
  const [hwEvalId, setHwEvalId] = useState<number | null>(null);
  const [isHwEvalOpen, setIsHwEvalOpen] = useState(false);
  const [hwChatHw, setHwChatHw] = useState<any | null>(null); // AI chat target homework
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"subject" | "class">("subject");
  // Exam create form enhancements
  const [examSection, setExamSection] = useState("");
  const [examSubjectCode, setExamSubjectCode] = useState("");
  const [useNcert, setUseNcert] = useState(false);
  const [questionImages, setQuestionImages] = useState<string[]>([]);
  const [modelAnswerImages, setModelAnswerImages] = useState<string[]>([]);
  const [isUploadingQImg, setIsUploadingQImg] = useState(false);
  const [isUploadingAImg, setIsUploadingAImg] = useState(false);
  const questionImgRef = useRef<HTMLInputElement>(null);
  const modelAnswerImgRef = useRef<HTMLInputElement>(null);
  // Results view
  const [selectedResultExamId, setSelectedResultExamId] = useState<number | null>(null);
  const [selectedStudentResult, setSelectedStudentResult] = useState<any | null>(null);

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

  const { data: teacherOptions } = useQuery<{
    subjects: string[];
    structuredSubjects: StructuredSubject[];
    classes: string[];
    classSections: ClassSection[];
    sections: string[];
  }>({
    queryKey: ["/api/teacher/options"],
    queryFn: () => fetchWithAuth("/api/teacher/options").then(r => r.json()),
  });

  // Results query for selected exam
  const { data: examResults, isLoading: isLoadingResults } = useQuery<any>({
    queryKey: ["/api/exams", selectedResultExamId, "results"],
    queryFn: () => fetchWithAuth(`/api/exams/${selectedResultExamId}/results`).then(r => r.json()),
    enabled: !!selectedResultExamId,
  });

  const resetHwForm = () => {
    setHwSubject(""); setHwClass(""); setHwSection(""); setHwDescription("");
    setHwQuestionsText(""); setHwQuestionImages([]); setHwModelSolution("");
    setHwModelAnswerImages([]); setHwUseNcert(false); setHwDueDate("");
    setHwActiveTab("description");
  };

  const createHomework = useMutation({
    mutationFn: () => fetchWithAuth("/api/teacher/homework", {
      method: "POST",
      body: JSON.stringify({
        subject: hwSubject, studentClass: hwClass, section: hwSection,
        description: hwDescription, questionsText: hwQuestionsText,
        questionImages: hwQuestionImages.length ? hwQuestionImages : undefined,
        modelSolution: hwModelSolution,
        modelAnswerImages: hwModelAnswerImages.length ? hwModelAnswerImages : undefined,
        useNcertReference: hwUseNcert, dueDate: hwDueDate
      }),
    }),
    onSuccess: () => {
      toast({ title: "Homework assigned!", description: "Students in the class can now submit." });
      setIsHwDialogOpen(false);
      resetHwForm();
      refetchTeacherHw();
    },
    onError: () => toast({ title: "Error", description: "Could not create homework.", variant: "destructive" }),
    onSettled: () => setIsCreatingHw(false),
  });

  const updateHomework = useMutation({
    mutationFn: (data: any) => fetchWithAuth(`/api/teacher/homework/${editingHw?.id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({ title: "Homework updated!" });
      setIsHwEditDialogOpen(false);
      setEditingHw(null);
      refetchTeacherHw();
    },
    onError: (err: any) => toast({ title: "Error", description: "Could not update homework.", variant: "destructive" }),
  });

  const deleteHomework = useMutation({
    mutationFn: (id: number) => fetchWithAuth(`/api/teacher/homework/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Homework deleted." });
      refetchTeacherHw();
    },
    onError: () => toast({ title: "Error", description: "Could not delete homework.", variant: "destructive" }),
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

  const { data: examStats } = useQuery<any>({
    queryKey: ["/api/exams", hoveredExamId, "stats"],
    queryFn: () => fetchWithAuth(`/api/exams/${hoveredExamId}/stats`).then(r => r.json()),
    enabled: !!hoveredExamId,
    staleTime: 60000,
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
      await apiRequest("POST", api.exams.create.path, {
        ...values,
        examName: generatedExamName,
        questionText: values.questionText || null,
        modelAnswerText: values.modelAnswerText || null,
        markingSchemeText: values.markingSchemeText || null,
        questionImages: questionImages.length > 0 ? JSON.stringify(questionImages) : null,
        modelAnswerImages: modelAnswerImages.length > 0 ? JSON.stringify(modelAnswerImages) : null,
        section: examSection || null,
        subjectCode: examSubjectCode || null,
        useNcert: useNcert ? 1 : 0,
      });
      queryClient.invalidateQueries({ queryKey: [api.exams.list.path] });
      toast({ title: "Exam created" });
      setIsDialogOpen(false);
      form.reset();
      setExamSection(""); setExamSubjectCode(""); setUseNcert(false);
      setQuestionImages([]); setModelAnswerImages([]);
    } catch { toast({ title: "Error", description: "Failed to create exam", variant: "destructive" }); }
  };

  // Handle image upload for questions/model answers
  const handleImageUpload = async (files: FileList | null, target: "question" | "answer") => {
    if (!files) return;
    const setter = target === "question" ? setQuestionImages : setModelAnswerImages;
    const setLoading = target === "question" ? setIsUploadingQImg : setIsUploadingAImg;
    setLoading(true);
    try {
      const base64s = await Promise.all(Array.from(files).map(f => readFileAsDataUrl(f)));
      setter(prev => [...prev, ...base64s]);
    } finally { setLoading(false); }
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
          <button className={`sf-nav-tab${activeSection === "results" ? " on" : ""}`} onClick={() => setActiveSection("results")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Results
          </button>
        </div>

        <div className="sf-nav-right">
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
            <div className="sf-page-sub">{new Date().toDateString()} &nbsp;·&nbsp; Manage exams, evaluate answer sheets and track class performance</div>
          </div>
        </div>

        {/* FUNNEL — overview only */}
        {activeSection === "overview" && (
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
        )}



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
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <div className="sf-exam-name">{exam.examName || `${exam.subject} Exam`}</div>
                            {exam.category && (() => {
                              const clr: Record<string, string> = { unit_test: "#6c47d8", class_test: "#2563c0", homework: "#1a7a54", half_yearly: "#92400e", annual: "#b91c1c", quiz: "#1e40af", assignment: "#7e22ce" };
                              const lbl: Record<string, string> = { unit_test: "Unit Test", class_test: "Class Test", homework: "Homework", half_yearly: "Half Yearly", annual: "Annual Exam", quiz: "Quiz", assignment: "Assignment" };
                              return <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: `${clr[exam.category] || "#6c47d8"}18`, color: clr[exam.category] || "#6c47d8", fontWeight: 700, border: `1px solid ${clr[exam.category] || "#6c47d8"}30` }}>{lbl[exam.category] || exam.category}</span>;
                            })()}
                          </div>
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
        {activeSection === "homework" && (() => {
          const today = new Date().toISOString().split("T")[0];

          const assignedClasses = teacherOptions?.classSections?.length
            ? [...new Set(teacherOptions.classSections.map((cs: ClassSection) => cs.className))].sort()
            : teacherOptions?.classes || [];

          const sectionsForClass = (cls: string) =>
            teacherOptions?.classSections?.length
              ? [...new Set(teacherOptions.classSections.filter((cs: ClassSection) => cs.className === cls).map((cs: ClassSection) => cs.section))]
              : teacherOptions?.sections || [];

          const subjectsForClassSection = (cls: string, sec: string) => {
            if (!teacherOptions?.structuredSubjects?.length) return teacherOptions?.subjects || [];
            const filtered = teacherOptions.structuredSubjects.filter(
              (s: StructuredSubject) => s.className === cls && (s.section === sec || s.section === "")
            );
            return filtered.length ? filtered.map((s: StructuredSubject) => s.name) : teacherOptions?.subjects || [];
          };

          return (
            <div>
              {/* ── STATS SUMMARY ── */}
              {teacherHomework && teacherHomework.length > 0 && (() => {
                const activeHw    = teacherHomework.filter((h: any) => h.dueDate >= today);
                const completedHw = teacherHomework.filter((h: any) => h.dueDate < today);
                const totalSubs   = teacherHomework.reduce((s: number, h: any) => s + (h.submissionCount ?? 0), 0);
                const totalSlots  = teacherHomework.reduce((s: number, h: any) => s + (h.totalStudents ?? 0), 0);
                const subRate     = totalSlots > 0 ? Math.round((totalSubs / totalSlots) * 100) : 0;
                const scoredHws   = teacherHomework.filter((h: any) => h.avgScore != null);
                const avgMarks    = scoredHws.length > 0
                  ? Math.round(scoredHws.reduce((s: number, h: any) => s + h.avgScore, 0) / scoredHws.length)
                  : null;

                const stats = [
                  {
                    icon: "🟢",
                    label: "Active Homeworks",
                    value: activeHw.length,
                    sub: "open for submission",
                    accent: "#166534",
                    bg: "#f0fdf4",
                    border: "#bbf7d0",
                  },
                  {
                    icon: "🔒",
                    label: "Completed",
                    value: completedHw.length,
                    sub: "deadline passed",
                    accent: "#92400e",
                    bg: "#fffbeb",
                    border: "#fde68a",
                  },
                  {
                    icon: "📬",
                    label: "Submission Rate",
                    value: `${subRate}%`,
                    sub: `${totalSubs} of ${totalSlots} submitted`,
                    accent: subRate >= 75 ? "#1d4ed8" : subRate >= 40 ? "#92400e" : "#991b1b",
                    bg: subRate >= 75 ? "#eff6ff" : subRate >= 40 ? "#fffbeb" : "#fef2f2",
                    border: subRate >= 75 ? "#bfdbfe" : subRate >= 40 ? "#fde68a" : "#fecaca",
                  },
                  {
                    icon: "📊",
                    label: "Average Score",
                    value: avgMarks != null ? `${avgMarks}%` : "—",
                    sub: avgMarks != null ? "across evaluated work" : "no evaluations yet",
                    accent: avgMarks == null ? "var(--mid)" : avgMarks >= 75 ? "#166534" : avgMarks >= 50 ? "#92400e" : "#991b1b",
                    bg: avgMarks == null ? "var(--cream)" : avgMarks >= 75 ? "#f0fdf4" : avgMarks >= 50 ? "#fffbeb" : "#fef2f2",
                    border: avgMarks == null ? "var(--border)" : avgMarks >= 75 ? "#bbf7d0" : avgMarks >= 50 ? "#fde68a" : "#fecaca",
                  },
                ];

                return (
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 12, marginBottom: 16,
                  }}>
                    {stats.map(s => (
                      <div key={s.label} style={{
                        borderRadius: 14, padding: "14px 16px",
                        background: s.bg, border: `1.5px solid ${s.border}`,
                        display: "flex", flexDirection: "column", gap: 6,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontSize: 16 }}>{s.icon}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: s.accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {s.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: s.accent, lineHeight: 1, fontFamily: "'Fraunces', serif" }}>
                          {s.value}
                        </div>
                        <div style={{ fontSize: 11, color: s.accent, opacity: 0.7, fontWeight: 500 }}>
                          {s.sub}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── HEADER ── */}
              <div className="sf-panel" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div className="sf-panel-title">Homework Assignments</div>
                    <div className="sf-panel-sub">
                      Assign and manage homework — students submit for AI evaluation
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-xl gap-1"
                    onClick={() => { resetHwForm(); setIsHwDialogOpen(true); }}
                    data-testid="button-assign-homework"
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <Plus className="h-3 w-3" /> Assign Homework
                  </Button>
                </div>

                {!teacherHomework ? (
                  <div style={{ padding: "28px 0", textAlign: "center" }}><Spinner /></div>
                ) : teacherHomework.length === 0 ? (
                  <div className="sf-empty" style={{ padding: "32px 0" }}>
                    <div className="sf-empty-icon">📋</div>
                    <div style={{ fontWeight: 600, color: "var(--ink2)", marginBottom: 4 }}>No homework assigned yet</div>
                    <div style={{ fontSize: 12, color: "var(--mid)" }}>Click "Assign Homework" to get started</div>
                  </div>
                ) : (() => {
                  // ── Group by className + section ──────────────────────────
                  const grouped = new Map<string, any[]>();
                  for (const hw of teacherHomework) {
                    const key = `Class ${hw.className}${hw.section ? ` · Sec ${hw.section}` : ""}`;
                    if (!grouped.has(key)) grouped.set(key, []);
                    grouped.get(key)!.push(hw);
                  }
                  // Sort groups: numerically by class, then section
                  const sortedKeys = [...grouped.keys()].sort((a, b) => {
                    const numA = parseInt(a.replace(/\D/g, "")) || 0;
                    const numB = parseInt(b.replace(/\D/g, "")) || 0;
                    return numA !== numB ? numA - numB : a.localeCompare(b);
                  });

                  return sortedKeys.map(groupKey => {
                    const items = grouped.get(groupKey)!;
                    // Sort within group: active (ascending due date) first, then past-due (ascending)
                    const active = items.filter(h => h.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
                    const pastDue = items.filter(h => h.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
                    const sorted = [...active, ...pastDue];
                    return (
                      <HwClassGroup
                        key={groupKey}
                        label={groupKey}
                        count={sorted.length}
                        activeCount={active.length}
                      >
                        {sorted.map((hw: any) => (
                          <HwListItem
                            key={hw.id}
                            hw={hw}
                            today={today}
                            onEval={() => { setHwEvalId(hw.id); setIsHwEvalOpen(true); }}
                            onEdit={() => { setEditingHw(hw); setIsHwEditDialogOpen(true); }}
                            onDelete={() => {
                              if (confirm("Delete this homework? All student submissions will also be removed.")) {
                                deleteHomework.mutate(hw.id);
                              }
                            }}
                            onChat={() => setHwChatHw(hw)}
                          />
                        ))}
                      </HwClassGroup>
                    );
                  });
                })()}
              </div>

              {/* ── CREATE HOMEWORK DIALOG ── */}
              <Dialog open={isHwDialogOpen} onOpenChange={v => { setIsHwDialogOpen(v); if (!v) resetHwForm(); }}>
                <DialogContent style={{ maxWidth: 640, maxHeight: "92vh", overflowY: "auto" }}>
                  <DialogHeader>
                    <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>📝</span> Assign Homework
                    </DialogTitle>
                  </DialogHeader>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>

                    {/* ── Step 1: Class / Section / Subject / Date ── */}
                    <div style={{ background: "#fafaf8", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--mid)", marginBottom: 10 }}>
                        Step 1 — Class details
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label className="sf-fld-lbl">Class *</label>
                          <select className="sf-fsel" style={{ width: "100%", marginTop: 4 }} value={hwClass}
                            onChange={e => { setHwClass(e.target.value); setHwSection(""); setHwSubject(""); }}
                            data-testid="select-hw-class">
                            <option value="">Select class…</option>
                            {assignedClasses.map((c: string) => <option key={c} value={c}>Class {c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="sf-fld-lbl">Section *</label>
                          <select className="sf-fsel" style={{ width: "100%", marginTop: 4 }} value={hwSection}
                            onChange={e => { setHwSection(e.target.value); setHwSubject(""); }}
                            disabled={!hwClass}
                            data-testid="select-hw-section">
                            <option value="">Select section…</option>
                            {hwClass && sectionsForClass(hwClass).map((s: string) => <option key={s} value={s}>Section {s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="sf-fld-lbl">Subject *</label>
                          <select className="sf-fsel" style={{ width: "100%", marginTop: 4 }} value={hwSubject}
                            onChange={e => setHwSubject(e.target.value)}
                            disabled={!hwClass || !hwSection}
                            data-testid="select-hw-subject">
                            <option value="">Select subject…</option>
                            {(hwClass && hwSection ? subjectsForClassSection(hwClass, hwSection) : []).map((s: string) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          {hwClass && hwSection && subjectsForClassSection(hwClass, hwSection).length === 0 && (
                            <div style={{ fontSize: 11, color: "#d08a2b", marginTop: 4 }}>No subjects assigned for this class/section.</div>
                          )}
                        </div>
                        <div>
                          <label className="sf-fld-lbl">Due Date *</label>
                          <Input
                            type="date"
                            value={hwDueDate}
                            min={today}
                            onChange={e => {
                              if (e.target.value < today) return;
                              setHwDueDate(e.target.value);
                            }}
                            data-testid="input-hw-due"
                            style={{ marginTop: 4 }}
                          />
                          <div style={{ fontSize: 10, color: "var(--mid)", marginTop: 3 }}>Today or future dates only</div>
                        </div>
                      </div>
                    </div>

                    {/* ── Step 2: Content tabs ── */}
                    {(() => {
                      const descMissing  = !hwDescription || hwDescription === "<br>" || hwDescription === "<p><br></p>";
                      const questMissing = !hwQuestionsText || hwQuestionsText === "<br>" || hwQuestionsText === "<p><br></p>";
                      const tabHasError  = (tab: string) =>
                        (tab === "description" && descMissing) ||
                        (tab === "questions"   && questMissing);

                      return (
                        <div style={{ background: "#fafaf8", borderRadius: 12, padding: "14px 16px", border: `1px solid ${(descMissing || questMissing) && isCreatingHw ? "#f87171" : "var(--border)"}` }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--mid)" }}>
                              Step 2 — Content &amp; questions
                            </div>
                            <div style={{ display: "flex", gap: 5 }}>
                              {["description", "questions"].map(t => (
                                tabHasError(t) ? (
                                  <span key={t} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, background: "#fee2e2", color: "#dc2626", fontWeight: 700, border: "1px solid #fca5a5" }}>
                                    {t === "description" ? "Description required" : "Questions required"}
                                  </span>
                                ) : (
                                  <span key={t} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, background: "#dcfce7", color: "#166534", fontWeight: 700, border: "1px solid #86efac" }}>
                                    ✓ {t === "description" ? "Description" : "Questions"}
                                  </span>
                                )
                              ))}
                            </div>
                          </div>
                          <HwFormBody
                            activeTab={hwActiveTab} onTabChange={setHwActiveTab}
                            description={hwDescription} onDescription={setHwDescription}
                            questionsText={hwQuestionsText} onQuestionsText={setHwQuestionsText}
                            questionImages={hwQuestionImages} onQuestionImages={setHwQuestionImages}
                            modelSolution={hwModelSolution} onModelSolution={setHwModelSolution}
                            modelAnswerImages={hwModelAnswerImages} onModelAnswerImages={setHwModelAnswerImages}
                            useNcert={hwUseNcert} onUseNcert={setHwUseNcert}
                            hwClass={hwClass} hwSubject={hwSubject}
                            readFileAsDataUrl={readFileAsDataUrl}
                            requiredTabs={["description", "questions"]}
                          />
                        </div>
                      );
                    })()}

                    {/* Validation summary — only shown after first submit attempt */}
                    {isCreatingHw === false && hwSubject && hwClass && hwSection && hwDueDate && (!hwDescription || !hwQuestionsText) && (
                      <div style={{
                        padding: "10px 14px", borderRadius: 10, background: "#fef2f2",
                        border: "1.5px solid #fca5a5", fontSize: 12, color: "#dc2626",
                        display: "flex", alignItems: "flex-start", gap: 8
                      }}>
                        <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 2 }}>Required fields missing:</div>
                          {!hwDescription && <div>• Description (in the Description tab)</div>}
                          {!hwQuestionsText && <div>• Questions (in the Questions tab)</div>}
                        </div>
                      </div>
                    )}

                    <Button
                      disabled={isCreatingHw || !hwSubject || !hwClass || !hwSection || !hwDescription || !hwQuestionsText || !hwDueDate}
                      onClick={() => { setIsCreatingHw(true); createHomework.mutate(); }}
                      data-testid="button-create-homework"
                      style={{ width: "100%" }}
                    >
                      {isCreatingHw
                        ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Assigning…</>
                        : "✓ Assign Homework"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* ── EDIT HOMEWORK DIALOG ── */}
              {editingHw && (
                <Dialog open={isHwEditDialogOpen} onOpenChange={v => { setIsHwEditDialogOpen(v); if (!v) setEditingHw(null); }}>
                  <DialogContent style={{ maxWidth: 640, maxHeight: "92vh", overflowY: "auto" }}>
                    <DialogHeader>
                      <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 20 }}>✏️</span> Edit Homework
                      </DialogTitle>
                    </DialogHeader>
                    <EditHwForm
                      hw={editingHw}
                      teacherOptions={teacherOptions}
                      onSave={(data: any) => updateHomework.mutate(data)}
                      isSaving={updateHomework.isPending}
                      sectionsForClass={sectionsForClass}
                      subjectsForClassSection={subjectsForClassSection}
                      readFileAsDataUrl={readFileAsDataUrl}
                    />
                  </DialogContent>
                </Dialog>
              )}

              {/* ── EVALUATIONS MODAL ── */}
              {isHwEvalOpen && hwEvalId && (
                <HwEvaluationsModal
                  hwId={hwEvalId}
                  onClose={() => { setIsHwEvalOpen(false); setHwEvalId(null); }}
                />
              )}

              {/* ── HOMEWORK AI CHAT ── */}
              {hwChatHw && (
                <HwAiChat
                  hw={hwChatHw}
                  onClose={() => setHwChatHw(null)}
                />
              )}
            </div>
          );
        })()}

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
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="sf-exam-name">{exam.examName || `${exam.subject} Exam`}</span>
                            {exam.category && (() => {
                              const clr: Record<string, string> = { unit_test: "#6c47d8", class_test: "#2563c0", homework: "#1a7a54", half_yearly: "#92400e", annual: "#b91c1c", quiz: "#1e40af", assignment: "#7e22ce" };
                              const lbl: Record<string, string> = { unit_test: "Unit Test", class_test: "Class Test", homework: "Homework", half_yearly: "Half Yearly", annual: "Annual Exam", quiz: "Quiz", assignment: "Assignment" };
                              return <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: `${clr[exam.category] || "#6c47d8"}18`, color: clr[exam.category] || "#6c47d8", fontWeight: 700 }}>{lbl[exam.category] || exam.category}</span>;
                            })()}
                          </div>
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

                          {/* Bulk Upload Zone */}
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, marginTop: 16 }}>Upload Answer Sheets</div>
                          <BulkUploadZone
                            examId={exam.id}
                            onUploadComplete={() => { refetchSheets(); refetchMergedScripts(); queryClient.invalidateQueries({ queryKey: ["/api/analytics"] }); }}
                          />

                          {/* Evaluated sheets (from single upload) */}
                          {isThisExam && answerSheets && answerSheets.filter((s: any) => s.status === "evaluated").length > 0 && (
                            <div style={{ marginTop: 16 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Evaluated Results</div>
                              {answerSheets.filter((s: any) => s.status === "evaluated").map((sheet: any) => (
                                <div key={sheet.id} className="sf-exam-item" style={{ cursor: "default" }}>
                                  <div className="sf-exam-subj" style={{ background: "var(--green-bg)", fontSize: 12 }}>{getInitials(sheet.studentName || sheet.admissionNumber)}</div>
                                  <div className="sf-exam-info">
                                    <div className="sf-exam-name">{sheet.studentName || sheet.admissionNumber}</div>
                                    <div className="sf-exam-meta">{sheet.admissionNumber}</div>
                                  </div>
                                  <span className="sf-exam-status sf-es-done">{sheet.evaluation?.totalMarks ?? sheet.totalMarks ?? "?"}/{exam.totalMarks}</span>
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

        {/* ── SHEETS TAB (standalone upload view) ── */}
        {activeSection === "sheets" && (
          <div className="sf-panel">
            <div className="sf-panel-title">Upload Answer Sheets</div>
            <div className="sf-panel-sub">Select an exam then upload all answer sheet pages at once — AI groups by student automatically</div>
            <select className="sf-fsel" style={{ width: "100%", marginBottom: 20 }} value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}>
              <option value="">— Select an exam —</option>
              {(examsList || []).map((e: any) => <option key={e.id} value={e.id}>{e.examName || `${e.subject} Exam`} — Class {e.className}</option>)}
            </select>
            {selectedExamId ? (
              <BulkUploadZone
                examId={parseInt(selectedExamId)}
                onUploadComplete={() => { refetchSheets(); refetchMergedScripts(); queryClient.invalidateQueries({ queryKey: ["/api/analytics"] }); }}
              />
            ) : (
              <div className="sf-empty"><div className="sf-empty-icon">📂</div>Select an exam above to upload answer sheets.</div>
            )}
          </div>
        )}
        {/* ── RESULTS TAB ── */}
        {activeSection === "results" && (
          <div className="sf-panel">
            {!selectedStudentResult ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                  <div>
                    <div className="sf-panel-title">Exam Results</div>
                    <div className="sf-panel-sub">View evaluated results, student scores and class-level analytics</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <select className="sf-fsel" style={{ minWidth: 240 }} value={selectedResultExamId || ""} onChange={e => { setSelectedResultExamId(e.target.value ? parseInt(e.target.value) : null); setSelectedStudentResult(null); setHoveredExamId(e.target.value ? parseInt(e.target.value) : null); }}>
                      <option value="">— Select an exam —</option>
                      {(examsList || []).map((e: any) => {
                        const catLabel: Record<string, string> = { unit_test: "Unit Test", class_test: "Class Test", homework: "Homework", half_yearly: "Half Yearly", annual: "Annual Exam", quiz: "Quiz", assignment: "Assignment" };
                        return <option key={e.id} value={e.id}>[{catLabel[e.category] || e.category}] {e.examName || `${e.subject} Exam`}</option>;
                      })}
                    </select>
                    {/* Exam type + stats strip */}
                    {selectedResultExamId && examStats && examStats.count > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "var(--lav-bg)", color: "var(--lavender)", fontWeight: 700, border: "1.5px solid var(--lav-card)" }}>{examStats.category}</span>
                        <span style={{ fontSize: 11, color: "var(--mid)" }}>·</span>
                        <span style={{ fontSize: 11, color: "var(--ink)", fontWeight: 600 }}>Mean: <b>{examStats.mean}%</b></span>
                        <span style={{ fontSize: 11, color: "var(--mid)" }}>·</span>
                        <span style={{ fontSize: 11, color: "var(--ink)", fontWeight: 600 }}>Median: <b>{examStats.median}%</b></span>
                        <span style={{ fontSize: 11, color: "var(--mid)" }}>·</span>
                        <span style={{ fontSize: 11, color: "var(--ink)", fontWeight: 600 }}>Mode: <b>{examStats.mode?.join(", ")}%</b></span>
                        <span style={{ fontSize: 11, color: "var(--mid)" }}>·</span>
                        <span style={{ fontSize: 11, color: "var(--ink)", fontWeight: 600 }}>σ: <b>{examStats.stdDev}%</b></span>
                        {examStats.questionText && (
                          <button onClick={() => setShowPaperModal(examStats)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "var(--ink)", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                            📄 View Paper
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {!selectedResultExamId && (
                  <div className="sf-empty"><div className="sf-empty-icon">📊</div>Select an exam above to view its results.</div>
                )}

                {selectedResultExamId && isLoadingResults && (
                  <div style={{ textAlign: "center", padding: 32 }}><div className="sf-spinner" /></div>
                )}

                {selectedResultExamId && examResults && (() => {
                  const { exam, students, classSummary } = examResults;
                  const sortedStudents = [...(students || [])].sort((a, b) => b.percentage - a.percentage);
                  const dist = classSummary?.distribution || {};
                  const distEntries = [
                    { label: "90-100%", key: "90-100", color: "#2a9d6e" },
                    { label: "75-89%", key: "75-89", color: "#3a8ab0" },
                    { label: "60-74%", key: "60-74", color: "#d08a2b" },
                    { label: "40-59%", key: "40-59", color: "#c47a1e" },
                    { label: "0-39%", key: "0-39", color: "#d94f4f" },
                  ];
                  const maxDistVal = Math.max(...distEntries.map(d => dist[d.key] || 0), 1);
                  const chapterAnalysis = classSummary?.chapterAnalysis || [];
                  const strongChapters = chapterAnalysis.filter((c: any) => c.status === "strong");
                  const weakChapters = chapterAnalysis.filter((c: any) => c.status === "weak");

                  const catColors: Record<string, { bg: string; color: string; border: string }> = {
                    "Unit Test":   { bg: "#f0edff", color: "#6c47d8", border: "#c7b8f5" },
                    "Class Test":  { bg: "#eff6ff", color: "#2563c0", border: "#93c5fd" },
                    "Homework":    { bg: "#f0faf4", color: "#1a7a54", border: "#86efac" },
                    "Half Yearly": { bg: "#fffbeb", color: "#92400e", border: "#fcd34d" },
                    "Annual Exam": { bg: "#fff0f0", color: "#b91c1c", border: "#fca5a5" },
                    "Quiz":        { bg: "#f0f8ff", color: "#1e40af", border: "#bfdbfe" },
                    "Assignment":  { bg: "#fdf4ff", color: "#7e22ce", border: "#d8b4fe" },
                  };
                  const examCat = examStats?.category || exam?.name?.toLowerCase().includes("unit") ? "Unit Test" : exam?.name?.toLowerCase().includes("class") ? "Class Test" : exam?.name?.toLowerCase().includes("homework") ? "Homework" : "Evaluation";
                  const catStyle = catColors[examCat] || { bg: "var(--lav-bg)", color: "var(--lavender)", border: "var(--lav-card)" };
                  const catEmoji = examCat === "Homework" ? "📝" : examCat === "Unit Test" ? "📋" : examCat === "Class Test" ? "✏️" : examCat === "Quiz" ? "⚡" : examCat === "Half Yearly" ? "📅" : examCat === "Annual Exam" ? "🎓" : "📄";

                  return (
                    <>
                      {/* Exam type header banner — clearly shows what type of evaluation this is */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: catStyle.bg, border: `1.5px solid ${catStyle.border}`, borderRadius: 12, marginBottom: 16 }}>
                        <div style={{ fontSize: 24 }}>{catEmoji}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: catStyle.color }}>{exam?.name}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, background: catStyle.color, color: "white", fontWeight: 700 }}>{examCat}</span>
                            <span style={{ fontSize: 11, color: "var(--mid)" }}>{exam?.subject} · Class {exam?.className}{exam?.section ? ` ${exam.section}` : ""} · {exam?.totalMarks} marks</span>
                          </div>
                        </div>
                        {examStats?.questionText && (
                          <button onClick={() => setShowPaperModal(examStats)} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 20, background: catStyle.color, color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            📄 View Full Paper
                          </button>
                        )}
                      </div>

                      {/* Exam summary strip */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
                        {[
                          { label: "Total Students", value: classSummary?.totalStudents || 0, sub: null },
                          { label: "Mean Score", value: examStats?.mean != null ? `${examStats.mean}%` : `${classSummary?.avgScore || 0}%`, sub: "arithmetic mean" },
                          { label: "Median Score", value: examStats?.median != null ? `${examStats.median}%` : "—", sub: "middle value" },
                          { label: "Mode Score", value: examStats?.mode?.length ? `${examStats.mode[0]}%` : "—", sub: "most frequent" },
                          { label: "Std Deviation", value: examStats?.stdDev != null ? `${examStats.stdDev}%` : "—", sub: "score spread" },
                          { label: "Highest", value: sortedStudents.length ? `${sortedStudents[0].percentage}%` : "—", sub: null },
                          { label: "Lowest", value: sortedStudents.length ? `${sortedStudents[sortedStudents.length - 1].percentage}%` : "—", sub: null },
                        ].map(kpi => (
                          <div key={kpi.label} style={{ background: "var(--lav-bg)", borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>{kpi.value}</div>
                            <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>{kpi.label}</div>
                            {kpi.sub && <div style={{ fontSize: 9, color: "var(--dim)", marginTop: 1 }}>{kpi.sub}</div>}
                          </div>
                        ))}
                      </div>

                      {/* Charts row */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                        {/* Score distribution bar chart */}
                        <div style={{ background: "var(--card)", border: "1px solid var(--rule)", borderRadius: 14, padding: "14px 16px" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>Score Distribution</div>
                          {distEntries.map(d => (
                            <div key={d.key} style={{ marginBottom: 8 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                                <span style={{ color: "var(--mid)" }}>{d.label}</span>
                                <span style={{ fontWeight: 700, color: d.color }}>{dist[d.key] || 0} students</span>
                              </div>
                              <div style={{ height: 7, borderRadius: 4, background: "var(--cream2)" }}>
                                <div style={{ height: "100%", borderRadius: 4, width: `${((dist[d.key] || 0) / maxDistVal) * 100}%`, background: d.color, transition: "width 0.4s" }} />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Chapter strength/weakness */}
                        <div style={{ background: "var(--card)", border: "1px solid var(--rule)", borderRadius: 14, padding: "14px 16px" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>Chapter Analysis</div>
                          {chapterAnalysis.length === 0 && <div style={{ fontSize: 12, color: "var(--mid)", textAlign: "center", paddingTop: 20 }}>No chapter data yet</div>}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                            {chapterAnalysis.map((ch: any) => (
                              <div key={ch.chapter} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 10, flexShrink: 0 }}>{ch.status === "strong" ? "🟢" : "🔴"}</span>
                                <span style={{ flex: 1, fontSize: 12, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.chapter}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: ch.status === "strong" ? "#2a9d6e" : "#d94f4f", flexShrink: 0 }}>{ch.avgPct}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Strong / Weak summary pills */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                        <div style={{ background: "#f0faf4", border: "1px solid #2a9d6e22", borderRadius: 12, padding: "12px 14px" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#2a9d6e", marginBottom: 6 }}>🟢 Strong Areas</div>
                          {strongChapters.length === 0 ? <div style={{ fontSize: 12, color: "var(--mid)" }}>None identified yet</div> : strongChapters.slice(0, 4).map((c: any) => (
                            <span key={c.chapter} style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "#2a9d6e18", color: "#1a7a54", fontWeight: 600, margin: "2px 3px 2px 0" }}>{c.chapter} ({c.avgPct}%)</span>
                          ))}
                        </div>
                        <div style={{ background: "#fff5f5", border: "1px solid #d94f4f22", borderRadius: 12, padding: "12px 14px" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#d94f4f", marginBottom: 6 }}>🔴 Weak Areas</div>
                          {weakChapters.length === 0 ? <div style={{ fontSize: 12, color: "var(--mid)" }}>None identified yet</div> : weakChapters.slice(0, 4).map((c: any) => (
                            <span key={c.chapter} style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "#d94f4f18", color: "#a03030", fontWeight: 600, margin: "2px 3px 2px 0" }}>{c.chapter} ({c.avgPct}%)</span>
                          ))}
                        </div>
                      </div>

                      {/* Student results list */}
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Student Results</div>
                      {sortedStudents.length === 0 && <div className="sf-empty"><div className="sf-empty-icon">📭</div>No evaluated sheets for this exam yet.</div>}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {sortedStudents.map((student: any, idx: number) => {
                          const pctColor2 = student.percentage >= 75 ? "#2a9d6e" : student.percentage >= 50 ? "#d08a2b" : "#d94f4f";
                          const grade = student.percentage >= 90 ? "A+" : student.percentage >= 75 ? "A" : student.percentage >= 60 ? "B" : student.percentage >= 40 ? "C" : "D";
                          return (
                            <div
                              key={student.admissionNumber}
                              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, border: "1.5px solid var(--rule)", background: "var(--card)", cursor: "pointer", transition: "all 0.15s" }}
                              onClick={() => setSelectedStudentResult(student)}
                            >
                              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--lav-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--ink2)", flexShrink: 0 }}>
                                #{idx + 1}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{student.studentName}</div>
                                <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 1 }}>{student.admissionNumber}</div>
                              </div>
                              <div style={{ textAlign: "center", flexShrink: 0 }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: pctColor2 }}>{student.totalMarks}/{student.maxMarks}</div>
                                <div style={{ fontSize: 11, color: "var(--mid)" }}>{student.percentage}%</div>
                              </div>
                              <div style={{ width: 100, flexShrink: 0 }}>
                                <div style={{ height: 6, borderRadius: 3, background: "var(--cream2)", overflow: "hidden" }}>
                                  <div style={{ height: "100%", borderRadius: 3, width: `${student.percentage}%`, background: pctColor2 }} />
                                </div>
                              </div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: pctColor2, width: 28, textAlign: "center", flexShrink: 0 }}>{grade}</div>
                              <div style={{ fontSize: 11, color: "var(--mid)", flexShrink: 0 }}>▶ Details</div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </>
            ) : (
              /* Student detail view */
              <div>
                <button onClick={() => setSelectedStudentResult(null)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--mid)", background: "none", border: "none", cursor: "pointer", marginBottom: 16, fontFamily: "inherit" }}>
                  ← Back to results
                </button>

                {/* Student header */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: "var(--lav-bg)", borderRadius: 14, marginBottom: 18 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--ink)", color: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                    {selectedStudentResult.studentName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{selectedStudentResult.studentName}</div>
                    <div style={{ fontSize: 12, color: "var(--mid)", marginTop: 2 }}>{selectedStudentResult.admissionNumber}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: pctColor(selectedStudentResult.percentage) }}>{selectedStudentResult.totalMarks}/{selectedStudentResult.maxMarks}</div>
                    <div style={{ fontSize: 13, color: "var(--mid)" }}>{selectedStudentResult.percentage}%</div>
                  </div>
                </div>

                {/* Overall feedback */}
                {selectedStudentResult.overallFeedback && (
                  <div style={{ padding: "12px 16px", background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 12, marginBottom: 16, fontSize: 13, color: "var(--ink)", lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 700 }}>Overall Feedback: </span>{selectedStudentResult.overallFeedback}
                  </div>
                )}

                {/* Areas of improvement */}
                {(selectedStudentResult.areasOfImprovement || []).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Areas of Improvement</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {selectedStudentResult.areasOfImprovement.map((area: any, i: number) => (
                        <div key={i} style={{ padding: "8px 12px", background: "#fff8ed", borderRadius: 10, border: "1px solid #d08a2b22" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#d08a2b" }}>⚠ {area.topic}</div>
                          {area.detail && <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 3 }}>{area.detail}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-question breakdown */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Question-by-Question Breakdown</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(selectedStudentResult.questions || []).map((q: any) => {
                    const qPct = q.maxMarks > 0 ? Math.round((q.marksAwarded / q.maxMarks) * 100) : 0;
                    const qColor = qPct >= 70 ? "#2a9d6e" : qPct >= 40 ? "#d08a2b" : "#d94f4f";
                    return (
                      <div key={q.questionNumber} style={{ border: "1.5px solid var(--rule)", borderRadius: 12, overflow: "hidden" }}>
                        {/* Question header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--pane)" }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: `${qColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: qColor, flexShrink: 0 }}>
                            Q{q.questionNumber}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{q.chapter || "General"}</div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: qColor }}>{q.marksAwarded}/{q.maxMarks}</div>
                            <div style={{ fontSize: 10, color: "var(--mid)" }}>{qPct}%</div>
                          </div>
                        </div>
                        {/* Marks bar */}
                        <div style={{ height: 4, background: "var(--cream2)" }}>
                          <div style={{ height: "100%", width: `${qPct}%`, background: qColor, transition: "width 0.4s" }} />
                        </div>
                        {/* Deviation & improvement */}
                        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                          {q.deviationReason && (
                            <div style={{ fontSize: 12, color: "var(--mid)" }}>
                              <span style={{ fontWeight: 600, color: "var(--ink)" }}>What was missing: </span>{q.deviationReason}
                            </div>
                          )}
                          {q.improvementSuggestion && (
                            <div style={{ fontSize: 12, color: "#2563c0", background: "var(--blue-bg)", padding: "6px 10px", borderRadius: 8 }}>
                              <span style={{ fontWeight: 600 }}>💡 Suggestion: </span>{q.improvementSuggestion}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}


        {/* ── PAPER MODAL ── */}
        {showPaperModal && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}
            onClick={() => setShowPaperModal(null)}
          >
            <div
              style={{ background: "white", borderRadius: 16, maxWidth: 680, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 16px 60px rgba(0,0,0,0.25)" }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{showPaperModal.examName}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--lav-bg)", color: "var(--lavender)", fontWeight: 700 }}>{showPaperModal.category}</span>
                    <span style={{ fontSize: 10, color: "var(--mid)" }}>{showPaperModal.subject} · Class {showPaperModal.className} · {showPaperModal.totalMarks} marks</span>
                  </div>
                </div>
                <button onClick={() => setShowPaperModal(null)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--mid)" }}>✕</button>
              </div>

              {/* Stats strip */}
              <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--rule)" }}>
                {[
                  { label: "Students", value: showPaperModal.count },
                  { label: "Mean", value: `${showPaperModal.mean}%` },
                  { label: "Median", value: `${showPaperModal.median}%` },
                  { label: "Mode", value: `${showPaperModal.mode?.[0]}%` },
                  { label: "Std Dev (σ)", value: `${showPaperModal.stdDev}%` },
                  { label: "Highest", value: `${showPaperModal.max}%` },
                  { label: "Lowest", value: `${showPaperModal.min}%` },
                ].map((s, i) => (
                  <div key={i} style={{ flex: 1, padding: "10px 8px", textAlign: "center", borderRight: i < 6 ? "1px solid var(--rule)" : "none", background: "var(--pane)" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: "var(--mid)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Bell-curve score distribution */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--rule)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", marginBottom: 10, letterSpacing: "0.06em" }}>SCORE DISTRIBUTION</div>
                {(() => {
                  const buckets = [
                    { label: "0–19%", color: "#d94f4f", count: (showPaperModal.scores || []).filter((s: number) => s < 20).length },
                    { label: "20–39%", color: "#e07030", count: (showPaperModal.scores || []).filter((s: number) => s >= 20 && s < 40).length },
                    { label: "40–59%", color: "#d08a2b", count: (showPaperModal.scores || []).filter((s: number) => s >= 40 && s < 60).length },
                    { label: "60–74%", color: "#3a8ab0", count: (showPaperModal.scores || []).filter((s: number) => s >= 60 && s < 75).length },
                    { label: "75–89%", color: "#2a9d6e", count: (showPaperModal.scores || []).filter((s: number) => s >= 75 && s < 90).length },
                    { label: "90–100%", color: "#1a7a54", count: (showPaperModal.scores || []).filter((s: number) => s >= 90).length },
                  ];
                  const maxCount = Math.max(...buckets.map(b => b.count), 1);
                  return (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 70 }}>
                      {buckets.map((b, i) => (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: b.color }}>{b.count > 0 ? b.count : ""}</div>
                          <div style={{ width: "100%", height: Math.max(4, Math.round((b.count / maxCount) * 50)), background: b.color, borderRadius: "3px 3px 0 0", transition: "height 0.4s" }} />
                          <div style={{ fontSize: 9, color: "var(--mid)", textAlign: "center", lineHeight: 1.2 }}>{b.label}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Question paper text */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", marginBottom: 10, letterSpacing: "0.06em" }}>QUESTION PAPER</div>
                <pre style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "var(--ink)", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>
                  {showPaperModal.questionText}
                </pre>
              </div>
            </div>
          </div>
        )}

        <ProfileDrawer open={isProfilePanelOpen} onClose={() => setIsProfilePanelOpen(false)} />
      </div>

      {/* ── CREATE EXAM DIALOG ── */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) { setQuestionImages([]); setModelAnswerImages([]); setExamSection(""); setExamSubjectCode(""); setUseNcert(false); }
      }}>
        <DialogContent className="sm:max-w-[600px] rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Exam</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
              {/* Step 1: Class */}
              <FormField control={form.control} name="className" render={({ field }) => (
                <FormItem>
                  <FormLabel>Class *</FormLabel>
                  <Select onValueChange={(val) => {
                    field.onChange(val);
                    setExamSection("");
                    form.setValue("subject", "");
                    setExamSubjectCode("");
                  }} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl" data-testid="select-exam-class">
                        <SelectValue placeholder="Select your assigned class…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(teacherOptions?.classes?.length ? teacherOptions.classes : ["8", "9", "10", "11", "12"]).map(c => (
                        <SelectItem key={c} value={c}>Class {c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Step 2: Section — enabled only after class chosen, shows only sections assigned to this teacher for that class */}
              {(() => {
                const cls = form.watch("className");
                const sectionOpts = cls
                  ? [...new Set((teacherOptions?.classSections || []).filter(cs => cs.className === cls).map(cs => cs.section))]
                  : [];
                const disabled = !cls;
                const noSectionsAssigned = cls && sectionOpts.length === 0;
                return (
                  <div>
                    <label style={{ fontSize: 14, fontWeight: 500, opacity: disabled ? 0.4 : 1, display: "block", marginBottom: 6 }}>
                      Section *
                    </label>
                    <Select
                      onValueChange={(val) => { setExamSection(val); form.setValue("subject", ""); setExamSubjectCode(""); }}
                      value={examSection}
                      disabled={disabled || noSectionsAssigned}
                    >
                      <SelectTrigger className="rounded-xl" data-testid="select-exam-section" style={{ opacity: disabled ? 0.5 : 1 }}>
                        <SelectValue placeholder={
                          disabled ? "Select class first…"
                          : noSectionsAssigned ? "No sections assigned for this class"
                          : "Select section…"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {sectionOpts.map((s: string) => (
                          <SelectItem key={s} value={s}>Section {s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {noSectionsAssigned && (
                      <p style={{ fontSize: 11, color: "#d08a2b", marginTop: 4 }}>
                        ⚠ No sections assigned for Class {cls}. Ask admin to assign subjects to you for this class.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Step 3: Subject — strictly filtered to this teacher's assignments for chosen class+section */}
              {(() => {
                const cls = form.watch("className");
                const disabled = !examSection;
                const filteredSubjects = examSection
                  ? (teacherOptions?.structuredSubjects || []).filter(
                      ss => ss.className === cls && ss.section === examSection
                    )
                  : [];
                const noSubjectsAssigned = !disabled && filteredSubjects.length === 0;
                return (
                  <FormField control={form.control} name="subject" render={({ field }) => (
                    <FormItem>
                      <FormLabel style={{ opacity: disabled ? 0.4 : 1 }}>Subject *</FormLabel>
                      <Select
                        disabled={disabled || noSubjectsAssigned}
                        onValueChange={(val) => {
                          field.onChange(val);
                          const ss = filteredSubjects.find(s => s.name === val);
                          setExamSubjectCode(ss?.code || "");
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl" data-testid="select-exam-subject" style={{ opacity: disabled ? 0.5 : 1 }}>
                            <SelectValue placeholder={
                              disabled ? "Select section first…"
                              : noSubjectsAssigned ? "No subjects assigned for this class/section"
                              : `${filteredSubjects.length} subject${filteredSubjects.length !== 1 ? "s" : ""} available — select one…`
                            } />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredSubjects.map((ss: StructuredSubject) => (
                            <SelectItem key={ss.name} value={ss.name}>
                              {ss.name}{ss.code ? ` (${ss.code})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {noSubjectsAssigned && (
                        <p style={{ fontSize: 11, color: "#d08a2b", marginTop: 4 }}>
                          ⚠ No subjects assigned for Class {cls} Section {examSection}. Ask admin to assign subjects.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                );
              })()}

              {/* Subject Code — auto-filled, editable */}
              <div>
                <label className="text-sm font-medium">Subject Code <span className="text-muted-foreground font-normal text-xs">(auto-filled)</span></label>
                <Input placeholder="e.g. MATH9A" value={examSubjectCode} onChange={e => setExamSubjectCode(e.target.value)} className="rounded-xl mt-1" />
              </div>
              {/* Category + Total Marks */}
              <div className="grid grid-cols-2 gap-4">
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
                <FormField control={form.control} name="totalMarks" render={({ field }) => (
                  <FormItem><FormLabel>Total Marks</FormLabel><FormControl><Input type="number" placeholder="100" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              {/* Auto-name */}
              <div className="p-3 bg-muted/30 rounded-xl border border-border/30">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-bold mb-1">Auto-generated Exam Name</p>
                <p className="text-sm font-mono font-semibold text-primary">{generatedExamName}</p>
              </div>

              {/* Questions — text OR images */}
              <div>
                <label className="text-sm font-medium block mb-1">Questions</label>
                <FormField control={form.control} name="questionText" render={({ field }) => (
                  <FormItem>
                    <FormControl><Textarea placeholder={"Q1 (10 marks): Explain photosynthesis.\nQ2 (10 marks): State Newton's First Law."} className="rounded-xl min-h-[80px] text-sm" data-testid="input-question-text" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Or upload question paper images:</span>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg h-7 gap-1 text-xs" onClick={() => questionImgRef.current?.click()} disabled={isUploadingQImg}>
                    {isUploadingQImg ? <><Loader2 className="h-3 w-3 animate-spin" />Uploading…</> : <><Upload className="h-3 w-3" />Add Images</>}
                  </Button>
                  <input ref={questionImgRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageUpload(e.target.files, "question")} />
                  {questionImages.map((_, i) => (
                    <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-md flex items-center gap-1">
                      🖼 Img {i+1} <button type="button" onClick={() => setQuestionImages(p => p.filter((_, j) => j !== i))} className="ml-1 text-muted-foreground hover:text-destructive">×</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Model Answer — text OR images */}
              <div>
                <label className="text-sm font-medium block mb-1">Model Answer Key</label>
                <FormField control={form.control} name="modelAnswerText" render={({ field }) => (
                  <FormItem>
                    <FormControl><Textarea placeholder={"Q1: Photosynthesis is the process by which plants use sunlight, CO₂, and water…"} className="rounded-xl min-h-[80px] text-sm" data-testid="input-model-answer-text" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Or upload model answer images:</span>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg h-7 gap-1 text-xs" onClick={() => modelAnswerImgRef.current?.click()} disabled={isUploadingAImg}>
                    {isUploadingAImg ? <><Loader2 className="h-3 w-3 animate-spin" />Uploading…</> : <><Upload className="h-3 w-3" />Add Images</>}
                  </Button>
                  <input ref={modelAnswerImgRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageUpload(e.target.files, "answer")} />
                  {modelAnswerImages.map((_, i) => (
                    <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-md flex items-center gap-1">
                      🖼 Img {i+1} <button type="button" onClick={() => setModelAnswerImages(p => p.filter((_, j) => j !== i))} className="ml-1 text-muted-foreground hover:text-destructive">×</button>
                    </span>
                  ))}
                </div>
              </div>

              <FormField control={form.control} name="markingSchemeText" render={({ field }) => (
                <FormItem><FormLabel>Marking Scheme <span className="text-muted-foreground font-normal">(optional)</span></FormLabel><FormControl><Textarea placeholder={"Award full marks for complete accurate answers.\nPartial marks for partial answers."} className="rounded-xl min-h-[60px] text-sm" data-testid="input-marking-scheme-text" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              {/* NCERT checkbox */}
              <div className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-muted/20">
                <input
                  type="checkbox"
                  id="useNcert"
                  checked={useNcert}
                  onChange={e => setUseNcert(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded cursor-pointer accent-primary"
                />
                <div>
                  <label htmlFor="useNcert" className="text-sm font-semibold cursor-pointer">Reference NCERT Books</label>
                  <p className="text-xs text-muted-foreground mt-0.5">If enabled, AI will also cross-reference NCERT chapter content when evaluating student answers, in addition to the model answer.</p>
                </div>
              </div>

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
