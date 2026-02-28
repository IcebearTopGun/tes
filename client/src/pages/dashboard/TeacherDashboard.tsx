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
  Upload
} from "lucide-react";
import { motion } from "framer-motion";
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
import { useState, useRef } from "react";
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
import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { fetchWithAuth } from "@/lib/fetcher";
import { z } from "zod";

export default function TeacherDashboard() {
  const { data, isLoading, error } = useTeacherDashboard();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
    </DashboardLayout>
  );
}
