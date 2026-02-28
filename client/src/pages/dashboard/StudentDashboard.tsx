import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useStudentDashboard } from "@/hooks/use-dashboard";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart3, 
  TrendingUp, 
  Target, 
  MessageSquare,
  ChevronRight,
  ArrowUpRight
} from "lucide-react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export default function StudentDashboard() {
  const { data, isLoading, error } = useStudentDashboard();

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

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-1">Detailed overview of your academic progress.</p>
        </div>

        {/* Top Analytics Summary */}
        <Card className="border-border/40 shadow-premium rounded-2xl overflow-hidden bg-card/30 backdrop-blur-sm border-none">
          <CardContent className="p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <Badge className="bg-primary/10 text-primary border-none rounded-lg mb-4">Performance Report</Badge>
                <h2 className="text-2xl font-bold mb-4 leading-tight">Academic Health Summary</h2>
                <p className="text-muted-foreground text-lg leading-relaxed italic">
                  "{data?.performanceSummary}"
                </p>
                <div className="flex items-center gap-6 mt-8">
                  <div className="text-center">
                    <div className="text-3xl font-bold font-display text-primary">{data?.attendance}%</div>
                    <div className="text-xs uppercase font-bold tracking-widest text-muted-foreground mt-1">Attendance</div>
                  </div>
                  <div className="h-10 w-px bg-border/40"></div>
                  <div className="text-center">
                    <div className="text-3xl font-bold font-display text-emerald-600">A-</div>
                    <div className="text-xs uppercase font-bold tracking-widest text-muted-foreground mt-1">Average</div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {data?.marksOverview.map((mark, i) => (
                  <Card key={i} className="border-border/40 shadow-premium rounded-xl bg-background/50">
                    <CardContent className="p-4">
                      <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{mark.subject}</div>
                      <div className="text-2xl font-bold mt-1 font-display">{mark.score}/{mark.total}</div>
                      <Progress value={(mark.score / mark.total) * 100} className="h-1.5 mt-3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Secondary Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Improvement Areas */}
          <Card className="border-border/40 shadow-premium rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-orange-600" /> Focus Areas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data?.improvementAreas.map((area, i) => (
                <div key={i} className="group p-4 rounded-xl bg-muted/30 hover:bg-primary/5 border border-transparent hover:border-primary/10 transition-all cursor-default">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold">{area}</p>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Marks Overview Cards (Alternate style) */}
          <Card className="border-border/40 shadow-premium rounded-2xl lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-600" /> Coursework Breakdown
              </CardTitle>
              <Button variant="ghost" className="text-primary font-bold text-xs gap-1">
                View All <ChevronRight className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {data?.marksOverview.map((mark, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between items-end mb-2">
                        <span className="font-bold text-sm">{mark.subject}</span>
                        <span className="text-xs font-bold text-muted-foreground">{mark.score}%</span>
                      </div>
                      <Progress value={(mark.score / mark.total) * 100} className="h-2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feedback Section */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-violet-600" /> Educator Feedback
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data?.feedback.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <Card className="border-border/40 shadow-premium rounded-2xl hover:border-primary/20 transition-all">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 font-bold">
                          {item.from[0]}
                        </div>
                        <div>
                          <p className="font-bold text-sm">{item.from}</p>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.date}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="rounded-lg border-none text-[10px] uppercase font-bold tracking-widest px-2">
                        Official
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
      </div>
    </DashboardLayout>
  );
}