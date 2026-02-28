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
  MoreHorizontal,
  Plus,
  Loader2,
  Upload,
  MessageSquare,
  Send,
  Star,
  ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useEffect } from "react";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExamSchema, type Exam } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { fetchWithAuth } from "@/lib/fetcher";
import { z } from "zod";

interface OcrResult {
  sheetId: number;
  examId: number;
  admissionNumber: string;
  studentName: string;
  answers: Array<{ question_number: number; answer_text: string }>;
}

const EXAMPLE_QUESTIONS = [
  "Which students need improvement?",
  "Who scored highest in the last exam?",
  "Give me a class performance summary.",
  "What are the weakest areas across all students?",
];

export default function TeacherDashboard() {
  const { data, isLoading, error } = useTeacherDashboard();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [isOcrDialogOpen, setIsOcrDialogOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: conversations } = useQuery<any[]>({
    queryKey: ["/api/chat/conversations"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/chat/conversations");
      return res.json();
    },
    enabled: isChatOpen
  });

  const { data: messages, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ["/api/chat/messages", activeConversationId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`);
      return res.json();
    },
    enabled: !!activeConversationId
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
    onError: () => {
      toast({ title: "Error", description: "Could not start conversation.", variant: "destructive" });
    }
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      return res.json();
    },
    onSuccess: () => {
      setChatMessage("");
      refetchMessages();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleFileUpload = async (examId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingId(examId);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result as string;
        const res = await fetchWithAuth(buildUrl(api.exams.processAnswerSheet.path, { id: examId }), {
          method: "POST",
          body: JSON.stringify({ imageBase64: base64 }),
        });
        const result = await res.json();
        setOcrResult({ ...result, sheetId: result.id, examId });
        setIsOcrDialogOpen(true);
        toast({ title: "OCR Complete", description: `Mapped to: ${result.studentName} (${result.admissionNumber})` });
      } catch (err) {
        toast({ title: "Error", description: "Failed to process answer sheet", variant: "destructive" });
      } finally {
        setProcessingId(null);
        e.target.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  const handleEvaluate = async (sheetId: number) => {
    setEvaluatingId(sheetId);
    try {
      const res = await fetchWithAuth(buildUrl(api.exams.evaluate.path, { id: sheetId }), {
        method: "POST",
      });
      const result = await res.json();
      toast({ 
        title: "Evaluation Complete", 
        description: `${result.studentName} scored ${result.totalMarks} marks.` 
      });
      setIsOcrDialogOpen(false);
      setOcrResult(null);
    } catch (err) {
      toast({ title: "Error", description: "Failed to evaluate answer sheet", variant: "destructive" });
    } finally {
      setEvaluatingId(null);
    }
  };

  const { data: examsList, isLoading: isLoadingExams } = useQuery<Exam[]>({
    queryKey: [api.exams.list.path],
    queryFn: async () => {
      const res = await fetchWithAuth(api.exams.list.path);
      return res.json();
    }
  });

  const form = useForm({
    resolver: zodResolver(insertExamSchema.extend({
      totalMarks: z.coerce.number(),
      teacherId: z.number().optional()
    })),
    defaultValues: {
      subject: "",
      className: "",
      examName: "",
      totalMarks: 0,
      questionPaperUrl: "",
      modelAnswerUrl: "",
      markingSchemeUrl: "",
    }
  });

  const onSubmit = async (values: any) => {
    try {
      await apiRequest("POST", api.exams.create.path, values);
      queryClient.invalidateQueries({ queryKey: [api.exams.list.path] });
      toast({ title: "Success", description: "Exam created successfully" });
      setIsDialogOpen(false);
      form.reset();
    } catch (err) {
      toast({ 
        title: "Error", 
        description: "Failed to create exam", 
        variant: "destructive" 
      });
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
    { 
      title: "Exams Created", 
      value: examsList?.length || 0, 
      icon: FileText, 
      color: "text-blue-600", 
      bg: "bg-blue-600/10",
      trend: "+12%"
    },
    { 
      title: "Sheets Evaluated", 
      value: data?.sheetsEvaluated || 0, 
      icon: CheckCircle, 
      color: "text-emerald-600", 
      bg: "bg-emerald-600/10",
      trend: "+8%"
    },
    { 
      title: "Avg Performance", 
      value: `${data?.avgPerformance || 0}%`, 
      icon: TrendingUp, 
      color: "text-violet-600", 
      bg: "bg-violet-600/10",
      trend: "+2.4%"
    },
    { 
      title: "Total Students", 
      value: data?.totalStudents || 0, 
      icon: Users, 
      color: "text-orange-600", 
      bg: "bg-orange-600/10",
      trend: "Stable"
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Real-time performance metrics and overview.</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gap-2 shadow-premium">
                <Plus className="h-4 w-4" /> Create Exam
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-2xl">
              <DialogHeader>
                <DialogTitle>Create New Exam</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subject</FormLabel>
                          <FormControl>
                            <Input placeholder="Mathematics" {...field} className="rounded-xl" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="className"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Class</FormLabel>
                          <FormControl>
                            <Input placeholder="10-A" {...field} className="rounded-xl" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="examName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Exam Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Mid-term Examination" {...field} className="rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="totalMarks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Marks</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} className="rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="space-y-3">
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Uploads (Optional URLs)</FormLabel>
                    <FormField
                      control={form.control}
                      name="questionPaperUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="Question Paper URL" {...field} className="rounded-xl text-xs" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="modelAnswerUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="Model Answer URL" {...field} className="rounded-xl text-xs" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="markingSchemeUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="Marking Scheme URL" {...field} className="rounded-xl text-xs" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full rounded-xl shadow-premium mt-4"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : "Create Exam"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Card className="border-border/40 shadow-premium group hover:border-primary/20 transition-all rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary" className="bg-muted/50 text-muted-foreground rounded-lg border-none">
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

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Exams List Table */}
          <Card className="lg:col-span-2 border-border/40 shadow-premium rounded-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Your Exams</CardTitle>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingExams ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : examsList && examsList.length > 0 ? (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-border/40">
                      <TableHead className="font-bold">Exam Name</TableHead>
                      <TableHead className="font-bold">Class</TableHead>
                      <TableHead className="font-bold">Subject</TableHead>
                      <TableHead className="font-bold">Marks</TableHead>
                      <TableHead className="font-bold text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {examsList.map((exam) => (
                      <ExamRow
                        key={exam.id}
                        exam={exam}
                        processingId={processingId}
                        onUpload={handleFileUpload}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground italic">No exams created yet.</div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats / Class Progress */}
          <div className="space-y-6">
            <Card className="border-border/40 shadow-premium rounded-2xl bg-primary text-primary-foreground relative overflow-hidden">
              <div className="absolute right-0 top-0 h-24 w-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  Performance Insight <ArrowUpRight className="h-4 w-4" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-primary-foreground/80 text-sm leading-relaxed">
                  Class average performance has increased by 4% compared to the last assessment. Keep focusing on Chapter 4 review.
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
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data?.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center gap-3 text-sm">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="font-medium">{activity.action}</span>
                    <span className="text-muted-foreground truncate">{activity.target}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* OCR Result Dialog */}
      <Dialog open={isOcrDialogOpen} onOpenChange={setIsOcrDialogOpen}>
        <DialogContent className="sm:max-w-[560px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" /> OCR Result
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
                <div className="bg-muted/30 px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Extracted Answers ({ocrResult.answers?.length || 0})
                  </span>
                </div>
                <div className="divide-y divide-border/30 max-h-48 overflow-y-auto">
                  {ocrResult.answers?.map((ans) => (
                    <div key={ans.question_number} className="px-4 py-2 flex gap-4 text-sm">
                      <span className="font-bold text-primary shrink-0">Q{ans.question_number}</span>
                      <span className="text-muted-foreground line-clamp-2">{ans.answer_text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => { setIsOcrDialogOpen(false); setOcrResult(null); }}
                >
                  Close
                </Button>
                <Button
                  className="flex-1 rounded-xl gap-2"
                  disabled={evaluatingId === ocrResult.sheetId}
                  onClick={() => handleEvaluate(ocrResult.sheetId)}
                >
                  {evaluatingId === ocrResult.sheetId ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Evaluating...</>
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChatOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 20 }}
              className="fixed right-0 top-0 h-screen w-full sm:w-[420px] bg-background border-l z-50 flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between bg-primary text-primary-foreground shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  <div>
                    <h2 className="font-bold leading-tight">AI Performance Analyst</h2>
                    <p className="text-xs text-primary-foreground/70">RAG-powered analytics</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="text-primary-foreground hover:bg-white/10 rounded-xl">
                  <Plus className="h-5 w-5 rotate-45" />
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
                              onSuccess: () => {
                                setTimeout(() => setChatMessage(q), 300);
                              }
                            });
                          }}
                          className="w-full text-left text-sm px-3 py-2 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/40 hover:border-primary/20 transition-all"
                        >
                          {q}
                        </button>
                      ))}
                    </div>

                    <Button 
                      onClick={() => startConversation.mutate()} 
                      disabled={startConversation.isPending}
                      className="rounded-xl w-full"
                    >
                      {startConversation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Start New Analysis
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Conversation history selector */}
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
                                onClick={() => { setChatMessage(q); }}
                                className="w-full text-left text-xs px-3 py-2 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/40 transition-all"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {messages?.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          {msg.role === 'assistant' && (
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-1">
                              <TrendingUp className="h-3 w-3 text-primary" />
                            </div>
                          )}
                          <div className={`max-w-[82%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                            msg.role === 'user' 
                              ? 'bg-primary text-primary-foreground rounded-tr-none' 
                              : 'bg-muted rounded-tl-none'
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
                            <span className="text-xs text-muted-foreground">Analyzing data...</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 border-t bg-muted/30 shrink-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground h-7 rounded-lg"
                          onClick={() => setActiveConversationId(null)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> New
                        </Button>
                      </div>
                      <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (chatMessage.trim()) sendMessage.mutate(chatMessage);
                        }}
                        className="flex gap-2"
                      >
                        <Input 
                          placeholder="Ask about student performance..." 
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          className="rounded-xl bg-background"
                          disabled={sendMessage.isPending}
                        />
                        <Button 
                          type="submit" 
                          size="icon" 
                          className="rounded-xl shrink-0" 
                          disabled={sendMessage.isPending || !chatMessage.trim()}
                        >
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
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="fixed bottom-6 right-6 z-40"
        >
          <Button 
            onClick={() => setIsChatOpen(true)}
            className="h-14 w-14 rounded-full shadow-2xl hover:scale-110 transition-transform"
          >
            <MessageSquare className="h-6 w-6" />
          </Button>
        </motion.div>
      )}
    </DashboardLayout>
  );
}

function ExamRow({ 
  exam, 
  processingId, 
  onUpload 
}: { 
  exam: Exam; 
  processingId: number | null; 
  onUpload: (examId: number, e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <TableRow className="border-border/40 hover:bg-muted/20 transition-colors">
      <TableCell className="font-semibold">{exam.examName}</TableCell>
      <TableCell>{exam.className}</TableCell>
      <TableCell>
        <Badge variant="outline" className="rounded-lg font-semibold border-primary/20 text-primary">
          {exam.subject}
        </Badge>
      </TableCell>
      <TableCell className="font-medium text-muted-foreground">{exam.totalMarks}</TableCell>
      <TableCell className="text-right">
        <input 
          type="file" 
          className="hidden" 
          ref={fileInputRef} 
          accept="image/*,application/pdf"
          onChange={(e) => onUpload(exam.id, e)}
        />
        <Button 
          variant="ghost" 
          size="sm" 
          className="rounded-lg gap-2"
          disabled={processingId === exam.id}
          onClick={() => fileInputRef.current?.click()}
        >
          {processingId === exam.id 
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Processing...</> 
            : <><Upload className="h-3 w-3" /> Upload Sheet</>
          }
        </Button>
      </TableCell>
    </TableRow>
  );
}
