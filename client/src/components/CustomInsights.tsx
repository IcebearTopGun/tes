import { useState, useRef, useEffect } from "react";
import { Loader2, Send, BarChart2, RefreshCw, Sparkles } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetcher";

const BAR_COLORS = [
  "#c7c0f5", "#a8d8b0", "#f5d08a", "#a8c8f0", "#f5b0c8",
  "#9ed4d4", "#d4b4f0", "#f0c090", "#90d0b4", "#b4b8f0",
];

type ChartType = "bar" | "horizontal_bar" | "line" | "donut" | "table" | "stat_cards" | "progress_bars";

interface ChartData {
  type: ChartType;
  title: string;
  description: string;
  data: any[];
  xKey?: string;
  yKey?: string;
  labelKey?: string;
  valueKey?: string;
  colorKey?: string;
  columns?: string[];
  summary?: string;
}

interface InsightResponse {
  narrative: string;
  charts: ChartData[];
  recommendations: string[];
}

// ── Mini chart renderers ──────────────────────────────────────────────────────

function BarChartWidget({ chart }: { chart: ChartData }) {
  const xKey = chart.xKey || chart.labelKey || "label";
  const yKey = chart.yKey || chart.valueKey || "value";
  const data = chart.data || [];
  const maxVal = Math.max(...data.map((d: any) => Number(d[yKey]) || 0), 1);
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minWidth: data.length * 50, height: 120, paddingBottom: 24, position: "relative" }}>
        {data.map((d: any, i: number) => {
          const val = Number(d[yKey]) || 0;
          const h = Math.round((val / maxVal) * 96);
          const color = d[chart.colorKey || "color"] || BAR_COLORS[i % BAR_COLORS.length];
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ fontSize: 10, color: "var(--mid)", fontWeight: 700 }}>{val}{typeof val === "number" && val <= 100 && yKey.toLowerCase().includes("pct") || yKey.toLowerCase().includes("rate") || yKey.toLowerCase().includes("score") || yKey.toLowerCase().includes("perce") ? "%" : ""}</div>
              <div style={{ width: "100%", height: h, background: color, borderRadius: "4px 4px 0 0", position: "relative", minHeight: 4, transition: "height 0.5s ease" }}
                title={`${d[xKey]}: ${val}`} />
              <div style={{ fontSize: 9, color: "var(--mid)", textAlign: "center", position: "absolute", bottom: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 48 }}>{String(d[xKey])}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HorizontalBarWidget({ chart }: { chart: ChartData }) {
  const labelKey = chart.labelKey || chart.xKey || "label";
  const valueKey = chart.valueKey || chart.yKey || "value";
  const data = chart.data || [];
  const maxVal = Math.max(...data.map((d: any) => Number(d[valueKey]) || 0), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((d: any, i: number) => {
        const val = Number(d[valueKey]) || 0;
        const pct = (val / maxVal) * 100;
        const color = d[chart.colorKey || "color"] || BAR_COLORS[i % BAR_COLORS.length];
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 90, fontSize: 11, color: "var(--mid)", textAlign: "right", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{String(d[labelKey])}</div>
            <div style={{ flex: 1, height: 16, background: "var(--rule)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, minWidth: 36, textAlign: "right" }}>{val}</div>
          </div>
        );
      })}
    </div>
  );
}

function DonutWidget({ chart }: { chart: ChartData }) {
  const labelKey = chart.labelKey || "label";
  const valueKey = chart.valueKey || "value";
  const data = chart.data || [];
  const total = data.reduce((s: number, d: any) => s + (Number(d[valueKey]) || 0), 0);
  const circumference = 2 * Math.PI * 38;
  let offset = 0;
  const segments = data.map((d: any, i: number) => {
    const val = Number(d[valueKey]) || 0;
    const dash = total > 0 ? (val / total) * circumference : 0;
    const seg = { label: d[labelKey], val, pct: total > 0 ? Math.round((val / total) * 100) : 0, color: d[chart.colorKey || "color"] || BAR_COLORS[i % BAR_COLORS.length], dash, dashOffset: -offset };
    offset += dash;
    return seg;
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width="100" height="100" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--rule)" strokeWidth="14" />
        {segments.filter(s => s.dash > 0).map((seg, i) => (
          <circle key={i} cx="50" cy="50" r="38" fill="none"
            stroke={seg.color} strokeWidth="14"
            strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
            strokeDashoffset={seg.dashOffset}
            transform="rotate(-90 50 50)"
          />
        ))}
        <text x="50" y="52" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)" fontFamily="DM Sans">{total}</text>
        <text x="50" y="62" textAnchor="middle" fontSize="8" fill="var(--mid)" fontFamily="DM Sans">total</text>
      </svg>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: seg.color, flexShrink: 0 }} />
            <span style={{ color: "var(--mid)", flex: 1 }}>{seg.label}</span>
            <span style={{ fontWeight: 700 }}>{seg.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableWidget({ chart }: { chart: ChartData }) {
  const data = chart.data || [];
  const cols = chart.columns || (data[0] ? Object.keys(data[0]) : []);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {cols.map((col, i) => (
              <th key={i} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "2px solid var(--rule)", color: "var(--mid)", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>
                {String(col).replace(/_/g, " ").toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((row: any, i: number) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--rule)" }}>
              {cols.map((col, j) => (
                <td key={j} style={{ padding: "6px 10px", borderBottom: "1px solid var(--rule)", color: "var(--ink)" }}>
                  {row[col] !== null && row[col] !== undefined ? String(row[col]) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 20 && <div style={{ fontSize: 11, color: "var(--mid)", padding: "6px 10px" }}>Showing 20 of {data.length} rows</div>}
    </div>
  );
}

function StatCardsWidget({ chart }: { chart: ChartData }) {
  const data = chart.data || [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
      {data.map((d: any, i: number) => {
        const labelKey = chart.labelKey || Object.keys(d)[0];
        const valueKey = chart.valueKey || Object.keys(d)[1];
        const unitKey = chart.colorKey;
        return (
          <div key={i} style={{ background: "var(--pane)", border: "1.5px solid var(--rule)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--mid)", fontWeight: 600, marginBottom: 4 }}>{d[labelKey]}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: BAR_COLORS[i % BAR_COLORS.length] }}>
              {d[valueKey]}{unitKey && d[unitKey] ? d[unitKey] : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProgressBarsWidget({ chart }: { chart: ChartData }) {
  return <HorizontalBarWidget chart={chart} />;
}

function ChartWidget({ chart }: { chart: ChartData }) {
  switch (chart.type) {
    case "bar": return <BarChartWidget chart={chart} />;
    case "horizontal_bar": return <HorizontalBarWidget chart={chart} />;
    case "line": return <BarChartWidget chart={chart} />; // treat as bar for simplicity
    case "donut": return <DonutWidget chart={chart} />;
    case "table": return <TableWidget chart={chart} />;
    case "stat_cards": return <StatCardsWidget chart={chart} />;
    case "progress_bars": return <ProgressBarsWidget chart={chart} />;
    default: return <BarChartWidget chart={chart} />;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

// Admin is a school operator — focuses on managing teachers, students, classes, workload
const ADMIN_PROMPTS = [
  "Which teacher has evaluated the most students this term?",
  "Show me workload distribution across all teachers as a bar chart",
  "How many students are enrolled across each class section?",
  "Which subjects have the fewest evaluations conducted?",
  "Plot homework submission rate per class section",
  "Show me the list of at-risk students across all classes",
];

// Principal is an academic leader — focuses on outcomes, quality, trends, intervention
const PRINCIPAL_PROMPTS = [
  "Which class section has the lowest academic performance?",
  "Show me average score per subject ranked from weakest to strongest",
  "Compare participation rate across all classes as a bar chart",
  "Which students are in the bottom 10% and need intervention?",
  "Plot teacher consistency index — who produces the most stable results?",
  "How has overall school performance trended across evaluations?",
];

const STUDENT_PROMPTS = [
  "Show my latest subject-wise performance as a chart",
  "Which areas should I prioritize this week?",
  "How consistent are my scores across evaluations?",
  "Summarize my homework completion and correctness",
  "What are my strongest and weakest subjects?",
  "Give me an action plan based on my recent results",
];

interface Props {
  role: "admin" | "principal" | "student";
}

export default function CustomInsights({ role }: Props) {
  const EXAMPLE_PROMPTS = role === "admin" ? ADMIN_PROMPTS : role === "principal" ? PRINCIPAL_PROMPTS : STUDENT_PROMPTS;
  const placeholderText = role === "admin"
    ? "e.g. 'Which teacher has the highest evaluation workload this term?'"
    : role === "principal"
      ? "e.g. 'Which class has the lowest average performance? Show as a bar chart'"
      : "e.g. 'Show my weakest subjects and suggest what to focus on this week'";
  const subText = role === "admin"
    ? "Ask any question about teacher workload, student enrolment, or operational data"
    : role === "principal"
      ? "Ask any question about academic outcomes, class performance, or intervention needs"
      : "Ask questions about your own evaluations, homework progress, and learning gaps";
  const insightsTitle = role === "admin" ? "Custom Insights" : "AI Insights";

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InsightResponse | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ prompt: string; result: InsightResponse }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [prompt]);

  const handleSubmit = async () => {
    const q = prompt.trim();
    if (!q || loading) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      // 1. Fetch data context from the appropriate API endpoints
      let dataContext: Record<string, any>;
      if (role === "student") {
        const [dashboardRes, homeworkAnalyticsRes, evaluationsRes, profileRes] = await Promise.allSettled([
          fetchWithAuth("/api/student/dashboard").then(r => r.json()),
          fetchWithAuth("/api/student/homework/analytics").then(r => r.json()),
          fetchWithAuth("/api/student/evaluations").then(r => r.json()),
          fetchWithAuth("/api/student/performance-profile").then(r => r.json()),
        ]);
        dataContext = {
          dashboard: dashboardRes.status === "fulfilled" ? dashboardRes.value : {},
          homeworkAnalytics: homeworkAnalyticsRes.status === "fulfilled" ? homeworkAnalyticsRes.value : {},
          evaluations: evaluationsRes.status === "fulfilled" ? evaluationsRes.value : [],
          performanceProfile: profileRes.status === "fulfilled" ? profileRes.value : {},
        };
      } else {
        const [statsRes, cpRes, teRes, siRes] = await Promise.allSettled([
          fetchWithAuth(`/api/${role === "principal" ? "principal" : "admin"}/stats`).then(r => r.json()),
          fetchWithAuth(`/api/principal/class-performance`).then(r => r.json()),
          fetchWithAuth(`/api/principal/teacher-effectiveness`).then(r => r.json()),
          fetchWithAuth(`/api/principal/school-insights`).then(r => r.json()),
        ]);
        dataContext = {
          stats: statsRes.status === "fulfilled" ? statsRes.value : null,
          classPerformance: cpRes.status === "fulfilled" ? cpRes.value : [],
          teacherEffectiveness: teRes.status === "fulfilled" ? teRes.value : [],
          schoolInsights: siRes.status === "fulfilled" ? siRes.value : {},
        };
      }

      // 2. Call Anthropic API to generate chart spec + narrative
      const systemPrompt = `You are a school analytics AI. You have access to real school performance data and generate visualisation specs in JSON.

The user will ask a question about school data. You must:
1. Analyse the provided data context
2. Generate chart(s) that directly answer the question using ONLY real data values from the context
3. Return a JSON response (no markdown, no preamble, pure JSON only)

Available chart types: "bar", "horizontal_bar", "line", "donut", "table", "stat_cards", "progress_bars"

Response format (strict JSON):
{
  "narrative": "2-3 sentence explanation of what the data shows",
  "charts": [
    {
      "type": "bar",
      "title": "Chart title",
      "description": "What this chart shows",
      "data": [{"label": "...", "value": 42}, ...],
      "labelKey": "label",
      "valueKey": "value",
      "summary": "One-line key finding"
    }
  ],
  "recommendations": ["actionable recommendation 1", "actionable recommendation 2"]
}

Rules:
- Use ONLY data values from the provided context. Never invent numbers.
- If data is empty, set charts to [] and explain in narrative.
- labelKey and valueKey must match actual keys in each data object.
- For "donut", include a "colorKey" if you add a color field.
- Keep data arrays to max 15 items for readability.
- Always include at least 1 chart if data is available.
- Return pure JSON only — no markdown, no code fences, no explanation outside JSON.`;

      const userMessage = `User question: "${q}"

Real data context:
${JSON.stringify(dataContext, null, 2)}

Generate the JSON response now.`;

      const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      const apiData = await apiRes.json();
      const raw = apiData.content?.map((c: any) => c.text || "").join("") || "";

      // Strip any accidental markdown fences
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed: InsightResponse = JSON.parse(cleaned);

      setResult(parsed);
      setHistory(h => [{ prompt: q, result: parsed }, ...h.slice(0, 4)]);
      setPrompt("");
    } catch (err: any) {
      console.error("CustomInsights error:", err);
      setError("Failed to generate insight. Please try again or rephrase your question.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="sf-analytics-head">
        <div>
          <div className="sf-section-title">{insightsTitle}</div>
          <div className="sf-section-sub">{subText} — AI plots the answer from live data</div>
        </div>
        <span className="sf-chart-badge" style={{ background: "var(--lav-bg)", color: "var(--lavender)", border: "1.5px solid var(--lav-card)", fontSize: 11, padding: "4px 10px", borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
          <Sparkles size={11} /> AI-Powered
        </span>
      </div>

      {/* Prompt input box */}
      <div className="sf-chart-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder={placeholderText}
            disabled={loading}
            rows={2}
            style={{
              flex: 1, border: "1.5px solid var(--rule)", borderRadius: 10, padding: "10px 14px",
              fontSize: 13, fontFamily: "DM Sans, sans-serif", background: "var(--pane)",
              color: "var(--ink)", outline: "none", resize: "none", lineHeight: 1.5,
              transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = "var(--lavender)"}
            onBlur={e => e.target.style.borderColor = "var(--rule)"}
          />
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || loading}
            style={{
              height: 40, width: 40, borderRadius: 10, background: prompt.trim() && !loading ? "var(--ink)" : "var(--rule)",
              border: "none", cursor: prompt.trim() && !loading ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", flexShrink: 0, transition: "background 0.2s",
            }}
          >
            {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={15} />}
          </button>
        </div>

        {/* Example prompts */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {EXAMPLE_PROMPTS.map(ex => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              disabled={loading}
              style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 20,
                border: "1.5px solid var(--rule)", background: "var(--pane)",
                color: "var(--mid)", cursor: "pointer", transition: "all 0.15s",
                fontFamily: "DM Sans, sans-serif",
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = "var(--lavender)"; (e.target as HTMLElement).style.color = "var(--ink)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = "var(--rule)"; (e.target as HTMLElement).style.color = "var(--mid)"; }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="sf-chart-card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--mid)", fontSize: 13 }}>
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: "var(--lavender)" }} />
            Analysing real school data and generating charts…
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fff0f0", border: "1.5px solid #fcc", fontSize: 13, color: "#b03030", display: "flex", gap: 10, alignItems: "center" }}>
          <span>⚠️</span> {error}
          <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#b03030", fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Narrative */}
          <div className="sf-chart-card" style={{ borderLeft: "3px solid var(--lavender)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--lavender)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <Sparkles size={12} /> AI ANALYSIS
            </div>
            <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6 }}>{result.narrative}</div>

            {result.recommendations?.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", marginBottom: 6 }}>RECOMMENDATIONS</div>
                {result.recommendations.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--ink)", display: "flex", gap: 6, marginBottom: 4 }}>
                    <span style={{ color: "var(--green)", flexShrink: 0 }}>→</span> {r}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Charts */}
          {result.charts.length === 0 ? (
            <div className="sf-empty"><div className="sf-empty-icon">📊</div>No chart data available for this query.</div>
          ) : (
            <div className="sf-charts-grid">
              {result.charts.map((chart, i) => (
                <div key={i} className="sf-chart-card" style={chart.type === "table" ? { gridColumn: "1 / -1" } : {}}>
                  <div className="sf-chart-head">
                    <div className="sf-chart-ico-row">
                      <div className="sf-chart-ico sf-ci-lav">
                        {chart.type === "bar" || chart.type === "line" ? "📊"
                          : chart.type === "donut" ? "🎯"
                          : chart.type === "table" ? "📋"
                          : chart.type === "horizontal_bar" || chart.type === "progress_bars" ? "📉"
                          : "📈"}
                      </div>
                      <div>
                        <div className="sf-chart-name">{chart.title}</div>
                        <div className="sf-chart-desc">{chart.description}</div>
                      </div>
                    </div>
                    <span className="sf-chart-badge" style={{ background: "var(--lav-bg)", color: "var(--lavender)", fontSize: 10 }}>AI</span>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <ChartWidget chart={chart} />
                  </div>
                  {chart.summary && (
                    <div style={{ marginTop: 10, fontSize: 11, color: "var(--mid)", fontStyle: "italic", borderTop: "1px solid var(--rule)", paddingTop: 8 }}>
                      💡 {chart.summary}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Ask another question */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => { setResult(null); setPrompt(""); setTimeout(() => textareaRef.current?.focus(), 100); }}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--mid)", background: "none", border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 8, transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--ink)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--mid)")}
            >
              <RefreshCw size={13} /> Ask another question
            </button>
          </div>
        </div>
      )}

      {/* Recent history */}
      {history.length > 0 && !result && !loading && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", marginBottom: 10, letterSpacing: "0.08em" }}>RECENT QUERIES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => { setResult(h.result); setPrompt(""); }}
                className="sf-exam-item"
                style={{ cursor: "pointer", textAlign: "left", background: "var(--pane)", border: "1.5px solid var(--rule)", borderRadius: 10, padding: "10px 14px" }}
              >
                <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", flexShrink: 0 }}>
                  <BarChart2 size={13} style={{ color: "var(--lavender)" }} />
                </div>
                <div className="sf-exam-info">
                  <div className="sf-exam-name">{h.prompt}</div>
                  <div className="sf-exam-meta">{h.result.charts.length} chart{h.result.charts.length !== 1 ? "s" : ""} generated</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
