import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BarChart2, TrendingUp, PieChart, Users, BookOpen, X, Filter } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
  Legend,
  ReferenceLine,
} from "recharts";
import { useState } from "react";

interface AnalyticsData {
  classAverages: { subject: string; avgMarks: number; totalMarks: number; examCount: number }[];
  studentPerformance: { studentName: string; totalMarks: number; maxMarks: number; examName: string; subject: string; pct: number }[];
  marksDistribution: { range: string; count: number }[];
  improvementTrends: { examName: string; subject: string; avgMarks: number; maxMarks: number; avgPct: number }[];
  chapterWeakness: { chapter: string; subject: string; avgScore: number; totalQuestions: number; studentsAffected: number }[];
}

interface FilterOptions {
  classes: string[];
  subjects: string[];
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];
const DIST_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#6366f1"];

function ChartSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-44 text-muted-foreground text-sm italic">
      {message}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border/60 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="font-bold mb-1 text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: <span className="text-foreground">{p.value}{p.name.includes("Pct") || p.name.includes("%") || p.name === "Avg Score %" ? "%" : ""}</span>
        </p>
      ))}
    </div>
  );
}

export function AnalyticsSection() {
  const [classFilter, setClassFilter] = useState<string>("");
  const [subjectFilter, setSubjectFilter] = useState<string>("");

  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ["/api/analytics/filter-options"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/analytics/filter-options");
      return res.json();
    },
  });

  const analyticsUrl = `/api/analytics${classFilter || subjectFilter ? `?${classFilter ? `class=${encodeURIComponent(classFilter)}` : ""}${classFilter && subjectFilter ? "&" : ""}${subjectFilter ? `subject=${encodeURIComponent(subjectFilter)}` : ""}` : ""}`;

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics", classFilter, subjectFilter],
    queryFn: async () => {
      const res = await fetchWithAuth(analyticsUrl);
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const hasData = !isLoading && data && (
    data.classAverages.length > 0 ||
    data.studentPerformance.length > 0 ||
    data.improvementTrends.length > 0
  );

  const hasFilters = !!(classFilter || subjectFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Live data from evaluated answer sheets</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Class filter */}
          <Select value={classFilter || "all"} onValueChange={v => setClassFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-32 rounded-xl text-xs h-8" data-testid="select-filter-class">
              <Filter className="h-3 w-3 mr-1 opacity-50" />
              <SelectValue placeholder="Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {filterOptions?.classes.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Subject filter */}
          <Select value={subjectFilter || "all"} onValueChange={v => setSubjectFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36 rounded-xl text-xs h-8" data-testid="select-filter-subject">
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {filterOptions?.subjects.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-xl text-xs gap-1 text-muted-foreground"
              onClick={() => { setClassFilter(""); setSubjectFilter(""); }}
              data-testid="button-clear-filters"
            >
              <X className="h-3 w-3" /> Clear
            </Button>
          )}

          {hasData && !hasFilters && (
            <Badge variant="secondary" className="rounded-lg border-none text-xs">
              Auto-refreshes every minute
            </Badge>
          )}
          {hasFilters && (
            <Badge className="rounded-lg bg-primary/10 text-primary border-none text-xs">
              Filtered
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Class Average Marks by Subject */}
        <Card className="border-border/40 shadow-premium rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <BarChart2 className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base">Class Average by Subject</CardTitle>
              <p className="text-xs text-muted-foreground">Avg marks scored vs max marks</p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : !data?.classAverages.length ? (
              <EmptyState message="No evaluations yet. Process and evaluate answer sheets to see averages." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.classAverages} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                  <Bar dataKey="avgMarks" name="Avg Marks" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {data.classAverages.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                  <Bar dataKey="totalMarks" name="Max Marks" radius={[6, 6, 0, 0]} fill="hsl(var(--muted))" opacity={0.4} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 2. Student Performance Comparison */}
        <Card className="border-border/40 shadow-premium rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-base">Student Performance</CardTitle>
              <p className="text-xs text-muted-foreground">Score percentage per student (last 15)</p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : !data?.studentPerformance.length ? (
              <EmptyState message="No student evaluations found." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.studentPerformance} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="studentName" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                  <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" opacity={0.4} />
                  <ReferenceLine y={75} stroke="#10b981" strokeDasharray="4 4" opacity={0.4} />
                  <Bar dataKey="pct" name="Score %" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {data.studentPerformance.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.pct >= 75 ? "#10b981" : entry.pct >= 50 ? "#f59e0b" : "#ef4444"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {!isLoading && !!data?.studentPerformance.length && (
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />≥ 75%</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />50–74%</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" />&lt; 50%</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Marks Distribution */}
        <Card className="border-border/40 shadow-premium rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <PieChart className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">Marks Distribution</CardTitle>
              <p className="text-xs text-muted-foreground">Students grouped by score range</p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : data?.marksDistribution.every(d => d.count === 0) ? (
              <EmptyState message="No evaluation data to display." />
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={180}>
                  <RechartsPieChart>
                    <Pie
                      data={data!.marksDistribution}
                      dataKey="count"
                      nameKey="range"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={72}
                      paddingAngle={3}
                    >
                      {data!.marksDistribution.map((_, i) => (
                        <Cell key={i} fill={DIST_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-background border border-border/60 rounded-xl px-3 py-2 shadow-xl text-xs">
                            <p className="font-bold">{payload[0].name}</p>
                            <p className="text-muted-foreground">{payload[0].value} student(s)</p>
                          </div>
                        );
                      }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="space-y-3 flex-1">
                  {data!.marksDistribution.map((d, i) => (
                    <div key={d.range} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: DIST_COLORS[i] }} />
                        <span className="text-xs font-medium">{d.range}</span>
                      </div>
                      <Badge variant="secondary" className="rounded-lg border-none text-xs font-bold px-2">
                        {d.count}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4. Improvement Trends */}
        <Card className="border-border/40 shadow-premium rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <CardTitle className="text-base">Improvement Trends</CardTitle>
              <p className="text-xs text-muted-foreground">Average class score across exams over time</p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : !data?.improvementTrends.length ? (
              <EmptyState message="Evaluate sheets across multiple exams to see trends." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.improvementTrends} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="examName"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v.length > 10 ? v.slice(0, 10) + "…" : v}
                  />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" opacity={0.4} />
                  <Line
                    type="monotone"
                    dataKey="avgPct"
                    name="Avg Score %"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    dot={{ r: 5, fill: "#8b5cf6", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. Chapter Weakness Analysis */}
      {(data?.chapterWeakness?.length ?? 0) > 0 && (
        <Card className="border-border/40 shadow-premium rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <CardTitle className="text-base">Chapter Weakness Analysis</CardTitle>
              <p className="text-xs text-muted-foreground">Chapters where students consistently score lowest (from evaluation data)</p>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data!.chapterWeakness}
                layout="vertical"
                margin={{ top: 4, right: 40, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="chapter"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={130}
                  tickFormatter={(v) => v.length > 16 ? v.slice(0, 16) + "…" : v}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-background border border-border/60 rounded-xl px-3 py-2 shadow-xl text-xs space-y-1">
                        <p className="font-bold">{d.chapter}</p>
                        <p className="text-muted-foreground">Subject: {d.subject}</p>
                        <p style={{ color: d.avgScore < 50 ? "#ef4444" : "#f59e0b" }}>Avg Score: {d.avgScore}%</p>
                        <p className="text-muted-foreground">{d.studentsAffected} student(s) · {d.totalQuestions} question(s)</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="avgScore" name="Avg Score %" radius={[0, 6, 6, 0]} maxBarSize={24}>
                  {data!.chapterWeakness.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.avgScore < 40 ? "#ef4444" : entry.avgScore < 60 ? "#f59e0b" : "#10b981"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" />Below 40% (Critical)</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />40–59% (Needs work)</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />60%+ (Good)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {!hasData && !isLoading && (
        <Card className="border-border/40 border-dashed rounded-2xl">
          <CardContent className="py-10 text-center text-muted-foreground">
            <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">No analytics data yet</p>
            <p className="text-sm mt-1">Create an exam, upload an answer sheet, and evaluate it — charts will appear here automatically.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
