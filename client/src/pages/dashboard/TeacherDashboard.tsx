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
  Send
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
import { ScrollArea } from "@/components/ui/spinner"; // Assuming ScrollArea might be missing, or use a div

export default function TeacherDashboard() {
  const { data, isLoading, error } = useTeacherDashboard();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      const res = await apiRequest("POST", "/api/chat/conversations", { title: "New Analysis" });
      return res;
    },
    onSuccess: (data) => {
      setActiveConversationId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    }
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/chat/conversations/${activeConversationId}/messages`, { content });
    },
    onSuccess: () => {
      setChatMessage("");
      refetchMessages();
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
        await apiRequest("POST", buildUrl(api.exams.processAnswerSheet.path, { id: examId }), { imageBase64: base64 });
        toast({ title: "Success", description: "Answer sheet processed and mapped to student" });
      } catch (err) {
        toast({ title: "Error", description: "Failed to process answer sheet", variant: "destructive" });
      } finally {
        setProcessingId(null);
      }
    };
    reader.readAsDataURL(file);
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
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Uploads (Simulation)</FormLabel>
                    <div className="grid grid-cols-1 gap-2">
                      <Button variant="outline" type="button" className="justify-start gap-2 rounded-xl text-xs h-9 border-dashed">
                        <Upload className="h-3 w-3" /> Question Paper (PDF)
                      </Button>
                      <Button variant="outline" type="button" className="justify-start gap-2 rounded-xl text-xs h-9 border-dashed">
                        <Upload className="h-3 w-3" /> Model Answer
                      </Button>
                      <Button variant="outline" type="button" className="justify-start gap-2 rounded-xl text-xs h-9 border-dashed">
                        <Upload className="h-3 w-3" /> Marking Scheme
                      </Button>
                    </div>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {examsList.map((exam) => (
                      <TableRow key={exam.id} className="border-border/40 hover:bg-muted/20 transition-colors">
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
                            onChange={(e) => handleFileUpload(exam.id, e)}
                          />
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="rounded-lg gap-2"
                            disabled={processingId === exam.id}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {processingId === exam.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                            Upload Sheet
                          </Button>
                        </TableCell>
                      </TableRow>
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
                <Button variant="secondary" className="w-full mt-4 rounded-xl font-bold bg-white/20 hover:bg-white/30 text-white border-none shadow-none">
                  Detailed Report
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
              className="fixed right-0 top-0 h-screen w-full sm:w-[400px] bg-background border-l z-50 flex flex-col shadow-2xl"
            >
              <div className="p-4 border-b flex items-center justify-between bg-primary text-primary-foreground">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  <h2 className="font-bold">AI Performance Analyst</h2>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="text-primary-foreground hover:bg-white/10">
                  <Plus className="h-5 w-5 rotate-45" />
                </Button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">
                {!activeConversationId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Analyze Class Performance</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Ask questions about student progress, weak areas, and performance trends.
                      </p>
                    </div>
                    <Button onClick={() => startConversation.mutate()} disabled={startConversation.isPending}>
                      {startConversation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Start New Analysis
                    </Button>
                  </div>
                ) : (
                  <>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                      {messages?.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                            msg.role === 'user' 
                              ? 'bg-primary text-primary-foreground rounded-tr-none' 
                              : 'bg-muted rounded-tl-none'
                          }`}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {sendMessage.isPending && (
                        <div className="flex justify-start">
                          <div className="bg-muted p-3 rounded-2xl rounded-tl-none">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-4 border-t bg-muted/30">
                      <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (chatMessage.trim()) sendMessage.mutate(chatMessage);
                        }}
                        className="flex gap-2"
                      >
                        <Input 
                          placeholder="Ask about John's performance..." 
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          className="rounded-xl bg-background"
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
        <Button 
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-40 hover:scale-110 transition-transform"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      )}
    </DashboardLayout>
  );
}
