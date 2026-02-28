import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherDashboard } from "@/hooks/use-dashboard";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  FileText,
  CheckCircle,
  TrendingUp,
  ArrowUpRight,
  Plus,
  Loader2,
  Upload,
  MessageSquare,
  Send,
  Star,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  X,
  FileCheck,
  Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState, useRef, useEffect, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExamSchema, type Exam } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { fetchWithAuth } from "@/lib/fetcher";
import { z } from "zod";
import { AnalyticsSection } from "@/components/AnalyticsSection";

interface OcrResult {
  sheetId: number;
  examId: number;
  admissionNumber: string;
  studentName: string;
  answers: Array<{ question_number: number; answer_text: string }>;
}

interface UploadedFile {
  name: string;
  dataUrl: string;
}

const EXAMPLE_QUESTIONS = [
  "Which students need improvement?",
  "Who scored highest in the last exam?",
  "Give me a class performance summary.",
  "What are the weakest areas across all students?",
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function FileUploadButton({
  label,
  accept,
  value,
  onChange,
}: {
  label: string;
  accept?: string;
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    onChange({ name: file.name, dataUrl });
    e.target.value = "";
  };

  return (
    <div>
      <input
        type="file"
        accept={accept || "image/*,application/pdf"}
        className="hidden"
        ref={inputRef}
        onChange={handleChange}
      />
      {value ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-sm">
          <FileCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-emerald-700 font-medium truncate flex-1">{value.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-emerald-500 hover:text-emerald-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all text-sm"
        >
          <Upload className="h-4 w-4 shrink-0" />
          {label}
        </button>
      )}
    </div>
  );
}

function DropZone({
  onFile,
  isProcessing,
}: {
  onFile: (dataUrl: string, filename: string) => void;
  isProcessing: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Only image files are supported for answer sheets (JPG, PNG, WEBP). PDFs are not accepted.");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    onFile(dataUrl, file.name);
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    []
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isProcessing && inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all min-h-[200px] ${
        isDragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-border/50 bg-muted/20 hover:border-primary/40 hover:bg-primary/5"
      } ${isProcessing ? "pointer-events-none opacity-60" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) { await processFile(file); e.target.value = ""; }
        }}
      />
      {isProcessing ? (
        <>
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="font-semibold text-muted-foreground">Processing with AI OCR…</p>
          <p className="text-xs text-muted-foreground">This may take a few seconds</p>
        </>
      ) : (
        <>
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Upload className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center px-4">
            <p className="font-semibold">Drop the answer sheet here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse files</p>
            <p className="text-xs text-muted-foreground mt-2">Supports: JPG, PNG, WEBP (images only — not PDF)</p>
          </div>
        </>
      )}
    </div>
  );
}

export default function TeacherDashboard() {
  const { data, isLoading, error } = useTeacherDashboard();
  const [activeTab, setActiveTab] = useState("overview");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [isOcrDialogOpen, setIsOcrDialogOpen] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState<string>("");

  // File upload state for exam creation
  const [questionPaperFile, setQuestionPaperFile] = useState<UploadedFile | null>(null);
  const [modelAnswerFile, setModelAnswerFile] = useState<UploadedFile | null>(null);
  const [markingSchemeFile, setMarkingSchemeFile] = useState<UploadedFile | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: examsList, isLoading: isLoadingExams } = useQuery<Exam[]>({
    queryKey: [api.exams.list.path],
    queryFn: async () => {
      const res = await fetchWithAuth(api.exams.list.path);
      return res.json();
    },
  });

  const { data: answerSheets, isLoading: isLoadingSheets, refetch: refetchSheets } = useQuery<any[]>({
    queryKey: ["/api/exams", selectedExamId, "answer-sheets"],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/exams/${selectedExamId}/answer-sheets`);
      return res.json();
    },
    enabled: !!selectedExamId,
  });

  const { data: conversations } = useQuery<any[]>({
    queryKey: ["/api/chat/conversations"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/chat/conversations");
      return res.json();
    },
    enabled: isChatOpen,
  });

  const { data: messages, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ["/api/chat/messages", activeConversationId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`);
      return res.json();
    },
    enabled: !!activeConversationId,
  });

  const startConversation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ title: "New Analysis" }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveConversationId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    },
    onError: () => toast({ title: "Error", description: "Could not start conversation.", variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      return res.json();
    },
    onSuccess: () => { setChatMessage(""); refetchMessages(); },
    onError: () => toast({ title: "Error", description: "Failed to send message.", variant: "destructive" }),
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleAnswerSheetUpload = async (dataUrl: string, filename: string) => {
    if (!selectedExamId) return;
    const examId = parseInt(selectedExamId);
    setProcessingId(examId);
    try {
      const res = await fetchWithAuth(buildUrl(api.exams.processAnswerSheet.path, { id: examId }), {
        method: "POST",
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Upload Failed", description: result.message || "Failed to process answer sheet", variant: "destructive" });
        return;
      }
      setOcrResult({ ...result, sheetId: result.id, examId });
      setIsOcrDialogOpen(true);
      refetchSheets();
      toast({ title: "OCR Complete", description: `Mapped to: ${result.studentName} (${result.admissionNumber})` });
    } catch {
      toast({ title: "Error", description: "Failed to process answer sheet", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const handleEvaluate = async (sheetId: number) => {
    setEvaluatingId(sheetId);
    try {
      const res = await fetchWithAuth(buildUrl(api.exams.evaluate.path, { id: sheetId }), { method: "POST" });
      const result = await res.json();
      toast({ title: "Evaluation Complete", description: `${result.studentName} scored ${result.totalMarks} marks.` });
      setIsOcrDialogOpen(false);
      setOcrResult(null);
      refetchSheets();
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
    } catch {
      toast({ title: "Error", description: "Failed to evaluate answer sheet", variant: "destructive" });
    } finally {
      setEvaluatingId(null);
    }
  };

  const form = useForm({
    resolver: zodResolver(
      insertExamSchema.extend({
        totalMarks: z.coerce.number().min(1, "Must be at least 1"),
        teacherId: z.number().optional(),
        questionPaperUrl: z.string().optional(),
        modelAnswerUrl: z.string().optional(),
        markingSchemeUrl: z.string().optional(),
      })
    ),
    defaultValues: {
      subject: "",
      className: "",
      examName: "",
      totalMarks: 0,
      questionPaperUrl: "",
      modelAnswerUrl: "",
      markingSchemeUrl: "",
    },
  });

  const onSubmit = async (values: any) => {
    try {
      await apiRequest("POST", api.exams.create.path, {
        ...values,
        questionPaperUrl: questionPaperFile?.dataUrl || values.questionPaperUrl || null,
        modelAnswerUrl: modelAnswerFile?.dataUrl || values.modelAnswerUrl || null,
        markingSchemeUrl: markingSchemeFile?.dataUrl || values.markingSchemeUrl || null,
      });
      queryClient.invalidateQueries({ queryKey: [api.exams.list.path] });
      toast({ title: "Exam created", description: "Your exam has been saved." });
      setIsDialogOpen(false);
      form.reset();
      setQuestionPaperFile(null);
      setModelAnswerFile(null);
      setMarkingSchemeFile(null);
    } catch {
      toast({ title: "Error", description: "Failed to create exam", variant: "destructive" });
    }
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
          <h2 className="text-2xl font-bold">Failed to load dashboard</h2>
          <p className="text-muted-foreground mt-2">Please try refreshing the page.</p>
        </div>
      </DashboardLayout>
    );
  }

  const stats = [
    { title: "Exams Created", value: examsList?.length || 0, icon: FileText, color: "text-blue-600", bg: "bg-blue-600/10", trend: "+12%" },
    { title: "Sheets Evaluated", value: data?.sheetsEvaluated || 0, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-600/10", trend: "+8%" },
    { title: "Avg Performance", value: `${data?.avgPerformance || 0}%`, icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-600/10", trend: "+2.4%" },
    { title: "Total Students", value: data?.totalStudents || 0, icon: Users, color: "text-orange-600", bg: "bg-orange-600/10", trend: "Stable" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage exams, evaluate answer sheets, and track performance.</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gap-2 shadow-premium">
                <Plus className="h-4 w-4" /> Create Exam
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Exam</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="subject" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject</FormLabel>
                        <FormControl><Input placeholder="Mathematics" {...field} className="rounded-xl" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="className" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Class</FormLabel>
                        <FormControl><Input placeholder="10-A" {...field} className="rounded-xl" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="examName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exam Name</FormLabel>
                      <FormControl><Input placeholder="Mid-term Examination" {...field} className="rounded-xl" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="totalMarks" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Marks</FormLabel>
                      <FormControl><Input type="number" placeholder="100" {...field} className="rounded-xl" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Upload Documents</p>
                    <FileUploadButton
                      label="Upload Question Paper (PDF / Image)"
                      value={questionPaperFile}
                      onChange={setQuestionPaperFile}
                    />
                    <FileUploadButton
                      label="Upload Model Answer (PDF / Image)"
                      value={modelAnswerFile}
                      onChange={setModelAnswerFile}
                    />
                    <FileUploadButton
                      label="Upload Marking Scheme (PDF / Image)"
                      value={markingSchemeFile}
                      onChange={setMarkingSchemeFile}
                    />
                    <p className="text-xs text-muted-foreground">
                      These documents help the AI evaluate answers accurately.
                    </p>
                  </div>

                  <Button type="submit" className="w-full rounded-xl shadow-premium" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Exam"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.08 }}>
              <Card className="border-border/40 shadow-premium hover:border-primary/20 transition-all rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary" className="bg-muted/50 text-muted-foreground rounded-lg border-none text-xs">
                    {stat.trend}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display">{stat.value}</div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">{stat.title}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50 rounded-xl p-1 h-auto">
            <TabsTrigger value="overview" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2">
              <LayoutDashboard className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="exams" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2">
              <BookOpen className="h-4 w-4" /> Exams
            </TabsTrigger>
            <TabsTrigger value="sheets" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2">
              <ClipboardList className="h-4 w-4" /> Answer Sheets
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <AnalyticsSection />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/40 shadow-premium rounded-2xl bg-primary text-primary-foreground relative overflow-hidden">
                <div className="absolute right-0 top-0 h-24 w-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Performance Insight <ArrowUpRight className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-primary-foreground/80 text-sm leading-relaxed">
                    Ask the AI analyst any question about your students — performance trends, weak chapters, or who needs extra attention.
                  </p>
                  <Button
                    variant="secondary"
                    className="w-full mt-4 rounded-xl font-bold bg-white/20 hover:bg-white/30 text-white border-none shadow-none"
                    onClick={() => setIsChatOpen(true)}
                  >
                    Ask AI Analyst
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border/40 shadow-premium rounded-2xl">
                <CardHeader><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {data?.recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-center gap-3 text-sm">
                      <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      <span className="font-medium">{activity.action}</span>
                      <span className="text-muted-foreground truncate">{activity.target}</span>
                      <span className="text-xs text-muted-foreground/60 ml-auto shrink-0">{activity.time}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* EXAMS TAB */}
          <TabsContent value="exams" className="mt-6">
            <Card className="border-border/40 shadow-premium rounded-2xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Your Exams</CardTitle>
                <Badge variant="secondary" className="rounded-lg border-none">
                  {examsList?.length || 0} total
                </Badge>
              </CardHeader>
              <CardContent>
                {isLoadingExams ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : examsList && examsList.length > 0 ? (
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow className="hover:bg-transparent border-border/40">
                        <TableHead className="font-bold">Exam Name</TableHead>
                        <TableHead className="font-bold">Class</TableHead>
                        <TableHead className="font-bold">Subject</TableHead>
                        <TableHead className="font-bold">Marks</TableHead>
                        <TableHead className="font-bold">Documents</TableHead>
                        <TableHead className="font-bold text-right">Sheets</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {examsList.map((exam) => (
                        <TableRow key={exam.id} className="border-border/40 hover:bg-muted/20 transition-colors">
                          <TableCell className="font-semibold">{exam.examName}</TableCell>
                          <TableCell>{exam.className}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="rounded-lg border-primary/20 text-primary">{exam.subject}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{exam.totalMarks}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {exam.questionPaperUrl && (
                                <Badge variant="secondary" className="text-[10px] rounded px-1.5 py-0.5 border-none">QP</Badge>
                              )}
                              {exam.modelAnswerUrl && (
                                <Badge variant="secondary" className="text-[10px] rounded px-1.5 py-0.5 border-none bg-emerald-100 text-emerald-700">MA</Badge>
                              )}
                              {exam.markingSchemeUrl && (
                                <Badge variant="secondary" className="text-[10px] rounded px-1.5 py-0.5 border-none bg-violet-100 text-violet-700">MS</Badge>
                              )}
                              {!exam.questionPaperUrl && !exam.modelAnswerUrl && !exam.markingSchemeUrl && (
                                <span className="text-xs text-muted-foreground/50">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-lg gap-1.5 text-xs"
                              onClick={() => { setSelectedExamId(String(exam.id)); setActiveTab("sheets"); }}
                            >
                              <ClipboardList className="h-3.5 w-3.5" /> View Sheets
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-16 text-muted-foreground">
                    <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="font-semibold">No exams yet</p>
                    <p className="text-sm mt-1">Click "Create Exam" to get started.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ANSWER SHEETS TAB */}
          <TabsContent value="sheets" className="mt-6 space-y-6">
            {/* Exam selector */}
            <Card className="border-border/40 shadow-premium rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Upload & Manage Answer Sheets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Select Exam</p>
                  <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                    <SelectTrigger className="rounded-xl max-w-sm" data-testid="select-exam">
                      <SelectValue placeholder="Choose an exam to upload sheets for…" />
                    </SelectTrigger>
                    <SelectContent>
                      {examsList?.map((exam) => (
                        <SelectItem key={exam.id} value={String(exam.id)}>
                          {exam.examName} — {exam.subject} ({exam.className})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!selectedExamId ? (
                  <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border/50 rounded-xl">
                    Select an exam above to upload answer sheets
                  </div>
                ) : (
                  <DropZone
                    onFile={handleAnswerSheetUpload}
                    isProcessing={!!processingId}
                  />
                )}
              </CardContent>
            </Card>

            {/* Sheets list */}
            {selectedExamId && (
              <Card className="border-border/40 shadow-premium rounded-2xl overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Uploaded Sheets</CardTitle>
                  <Button variant="ghost" size="sm" className="rounded-lg text-xs gap-1" onClick={() => refetchSheets()}>
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {isLoadingSheets ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : !answerSheets || answerSheets.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      <Upload className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No sheets uploaded yet for this exam.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent border-border/40">
                          <TableHead className="font-bold">Student</TableHead>
                          <TableHead className="font-bold">Admission No.</TableHead>
                          <TableHead className="font-bold">Status</TableHead>
                          <TableHead className="font-bold">Score</TableHead>
                          <TableHead className="font-bold text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {answerSheets.map((sheet: any) => (
                          <TableRow key={sheet.id} className="border-border/40 hover:bg-muted/20">
                            <TableCell className="font-semibold">{sheet.studentName}</TableCell>
                            <TableCell className="text-muted-foreground">{sheet.admissionNumber}</TableCell>
                            <TableCell>
                              {sheet.evaluation ? (
                                <Badge className="rounded-lg bg-emerald-100 text-emerald-700 border-none gap-1">
                                  <FileCheck className="h-3 w-3" /> Evaluated
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="rounded-lg border-none gap-1">
                                  <Clock className="h-3 w-3" /> Pending
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              {sheet.evaluation ? (
                                <span className="text-emerald-700 font-bold">{sheet.evaluation.totalMarks}</span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {!sheet.evaluation && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg gap-1.5 text-xs"
                                  disabled={evaluatingId === sheet.id}
                                  onClick={() => handleEvaluate(sheet.id)}
                                >
                                  {evaluatingId === sheet.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Star className="h-3 w-3" />
                                  )}
                                  {evaluatingId === sheet.id ? "Evaluating…" : "Evaluate"}
                                </Button>
                              )}
                              {sheet.evaluation && (
                                <span className="text-xs text-muted-foreground italic">Done</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* OCR Result Dialog */}
      <Dialog open={isOcrDialogOpen} onOpenChange={setIsOcrDialogOpen}>
        <DialogContent className="sm:max-w-[560px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" /> OCR Complete
            </DialogTitle>
          </DialogHeader>
          {ocrResult && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/30 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-bold">Student</p>
                  <p className="font-semibold mt-1">{ocrResult.studentName}</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-bold">Admission No.</p>
                  <p className="font-semibold mt-1">{ocrResult.admissionNumber}</p>
                </div>
              </div>
              <div className="border border-border/40 rounded-xl overflow-hidden">
                <div className="bg-muted/30 px-4 py-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Extracted Answers ({ocrResult.answers?.length || 0})
                  </span>
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
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setIsOcrDialogOpen(false); setOcrResult(null); }}>
                  Close
                </Button>
                <Button
                  className="flex-1 rounded-xl gap-2"
                  disabled={evaluatingId === ocrResult.sheetId}
                  onClick={() => handleEvaluate(ocrResult.sheetId)}
                >
                  {evaluatingId === ocrResult.sheetId ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Evaluating…</>
                  ) : (
                    <><Star className="h-4 w-4" /> Evaluate with AI</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Chat Sidebar */}
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
                  <MessageSquare className="h-5 w-5" />
                  <div>
                    <h2 className="font-bold leading-tight">AI Performance Analyst</h2>
                    <p className="text-xs text-primary-foreground/70">RAG-powered analytics</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="text-primary-foreground hover:bg-white/10 rounded-xl">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {!activeConversationId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Analyze Class Performance</h3>
                      <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                        Ask any question about student progress, weak areas, or performance trends. The AI only uses your real evaluation data.
                      </p>
                    </div>
                    <div className="w-full space-y-2">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-left">Example questions</p>
                      {EXAMPLE_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            startConversation.mutate(undefined, {
                              onSuccess: () => setTimeout(() => setChatMessage(q), 300),
                            });
                          }}
                          className="w-full text-left text-sm px-3 py-2 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/40 hover:border-primary/20 transition-all"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                    <Button onClick={() => startConversation.mutate()} disabled={startConversation.isPending} className="rounded-xl w-full">
                      {startConversation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Start New Analysis
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
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p>Ask a question to get started</p>
                          <div className="mt-4 space-y-2">
                            {EXAMPLE_QUESTIONS.slice(0, 2).map((q) => (
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
                      {messages?.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          {msg.role === "assistant" && (
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-1">
                              <TrendingUp className="h-3 w-3 text-primary" />
                            </div>
                          )}
                          <div className={`max-w-[82%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground rounded-tr-none"
                              : "bg-muted rounded-tl-none"
                          }`}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {sendMessage.isPending && (
                        <div className="flex justify-start items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <TrendingUp className="h-3 w-3 text-primary" />
                          </div>
                          <div className="bg-muted p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Analyzing data…</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-4 border-t bg-muted/30 shrink-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 rounded-lg" onClick={() => setActiveConversationId(null)}>
                          <Plus className="h-3 w-3 mr-1" /> New
                        </Button>
                      </div>
                      <form
                        onSubmit={(e) => { e.preventDefault(); if (chatMessage.trim()) sendMessage.mutate(chatMessage); }}
                        className="flex gap-2"
                      >
                        <Input
                          placeholder="Ask about student performance…"
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          className="rounded-xl bg-background"
                          disabled={sendMessage.isPending}
                        />
                        <Button type="submit" size="icon" className="rounded-xl shrink-0" disabled={sendMessage.isPending || !chatMessage.trim()}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Chat Button */}
      {!isChatOpen && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="fixed bottom-6 right-6 z-40">
          <Button onClick={() => setIsChatOpen(true)} className="h-14 w-14 rounded-full shadow-2xl hover:scale-110 transition-transform">
            <MessageSquare className="h-6 w-6" />
          </Button>
        </motion.div>
      )}
    </DashboardLayout>
  );
}
