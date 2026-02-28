import { Link } from "wouter";
import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import {
  BookOpen, Zap, Shield, TrendingUp, Brain, Users, GraduationCap,
  ArrowRight, ChevronRight, Star
} from "lucide-react";

function useCounter(target: number, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

function StatCounter({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const count = useCounter(value, 1600, inView);
  return (
    <div ref={ref} style={{ textAlign: "center" }}>
      <div style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 900, fontFamily: "Outfit, sans-serif", lineHeight: 1, background: "linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.5))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        {count.toLocaleString()}{suffix}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 6, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

const FEATURES = [
  { icon: Brain, accent: "#818cf8", bg: "rgba(129,140,248,0.12)", title: "AI-Powered OCR Grading", desc: "GPT-4o reads handwritten answer sheets with human-level accuracy. No manual data entry." },
  { icon: TrendingUp, accent: "#34d399", bg: "rgba(52,211,153,0.12)", title: "Real-Time Analytics", desc: "Class averages, student rankings, chapter-weakness maps — all computed from actual exam data." },
  { icon: Zap, accent: "#fb923c", bg: "rgba(251,146,60,0.12)", title: "Early Warning System", desc: "Automatically flags students showing score decline or low homework engagement before they fall behind." },
  { icon: Star, accent: "#facc15", bg: "rgba(250,204,21,0.12)", title: "Question Quality AI", desc: "Identifies whether poor performance signals a teaching gap or an unclear question. Fix both faster." },
  { icon: Shield, accent: "#60a5fa", bg: "rgba(96,165,250,0.12)", title: "7-Layer Privacy Guard", desc: "PII detection, tokenisation, and role-based unmasking ensure student data never leaks into AI prompts." },
  { icon: Users, accent: "#c084fc", bg: "rgba(192,132,252,0.12)", title: "Role-Based Dashboards", desc: "Teachers, class teachers, students, and admins each see exactly what they need — nothing more." },
];

function DashboardMockup() {
  const bars = [78, 55, 91, 44, 67, 82];
  const barColors = ["#818cf8", "#34d399", "#f97316", "#818cf8", "#34d399", "#f97316"];
  const students = [
    { name: "Aarav S.", pct: 91, color: "#34d399" },
    { name: "Priya N.", pct: 80, color: "#818cf8" },
    { name: "Rahul G.", pct: 67, color: "#fb923c" },
    { name: "Meera K.", pct: 44, color: "#f87171" },
  ];
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "20px", backdropFilter: "blur(20px)", width: "100%", maxWidth: 420 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", fontFamily: "Outfit, sans-serif" }}>Class Analytics</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Mathematics · Class 10-A</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(52,211,153,0.15)", color: "#34d399", padding: "3px 8px", borderRadius: 20, border: "1px solid rgba(52,211,153,0.3)", letterSpacing: "0.04em" }}>LIVE</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[{ label: "Evaluated", val: "24" }, { label: "Avg Score", val: "74%" }, { label: "At Risk", val: "3" }].map((s) => (
          <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "8px 0", textAlign: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "white", fontFamily: "Outfit, sans-serif", lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 60, marginBottom: 12, padding: "0 4px" }}>
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, background: barColors[i], borderRadius: "4px 4px 0 0", height: `${h}%`, opacity: 0.85 }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {students.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: s.color, flexShrink: 0 }}>
              {s.name[0]}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", flex: 1, whiteSpace: "nowrap" }}>{s.name}</div>
            <div style={{ flex: 2, background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 5, overflow: "hidden" }}>
              <div style={{ width: `${s.pct}%`, height: "100%", background: s.color, borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: s.color, width: 28, textAlign: "right", flexShrink: 0 }}>{s.pct}%</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, padding: "8px 10px", background: "rgba(129,140,248,0.12)", borderRadius: 10, border: "1px solid rgba(129,140,248,0.25)", display: "flex", alignItems: "flex-start", gap: 8 }}>
        <Brain size={13} style={{ color: "#818cf8", flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
          <b style={{ color: "#818cf8" }}>AI Insight:</b> Q3 shows a class-wide teaching gap in quadratic equations. Consider a revision session.
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const featuresRef = useRef(null);
  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true });

  const BG = "#05060f";
  const ACCENT = "#818cf8";
  const ORANGE = "#f97316";

  return (
    <div style={{ background: BG, minHeight: "100vh", color: "white", fontFamily: "DM Sans, sans-serif", overflowX: "hidden" }}>

      {/* ── NAV ── */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "0 clamp(16px, 5vw, 80px)", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(5,6,15,0.7)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 20px ${ACCENT}55` }}>
            <BookOpen size={16} color="white" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "Outfit, sans-serif", letterSpacing: "-0.01em" }}>EduSync</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/login">
            <button style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 500, cursor: "pointer", padding: "8px 16px" }}>Log in</button>
          </Link>
          <Link href="/signup">
            <button style={{ background: ACCENT, border: "none", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "9px 20px", borderRadius: 10, boxShadow: `0 0 20px ${ACCENT}44`, fontFamily: "Outfit, sans-serif" }}>
              Get Started
            </button>
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", padding: "100px clamp(16px, 5vw, 80px) 60px", position: "relative", overflow: "hidden" }}>
        {/* Glow blobs */}
        <div style={{ position: "absolute", top: "10%", left: "5%", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${ACCENT}18 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "5%", right: "5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(251,146,60,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "10%", left: "30%", width: 500, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(52,211,153,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", gap: 60, flexWrap: "wrap" }}>
          {/* Left — text */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{ flex: "1 1 400px", minWidth: 280 }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: `${ACCENT}18`, border: `1px solid ${ACCENT}35`, padding: "6px 14px", borderRadius: 30, fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 28, letterSpacing: "0.04em" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, display: "inline-block" }} />
              AI-Powered Exam Evaluation Platform
            </div>

            <h1 style={{ fontSize: "clamp(2.6rem, 6vw, 5rem)", fontWeight: 900, fontFamily: "Outfit, sans-serif", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 24 }}>
              Grade smarter.<br />
              <span style={{ background: `linear-gradient(135deg, ${ACCENT}, #c084fc)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Teach better.</span>
            </h1>

            <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 36, maxWidth: 480 }}>
              Upload handwritten answer sheets. AI evaluates them in seconds with chapter-level feedback. Spot weak students before they slip through.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/signup">
                <button style={{ display: "flex", alignItems: "center", gap: 8, background: ACCENT, border: "none", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", padding: "14px 28px", borderRadius: 12, boxShadow: `0 4px 30px ${ACCENT}55`, fontFamily: "Outfit, sans-serif", transition: "transform 0.15s, box-shadow 0.15s" }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.transform = "translateY(-2px)"; (e.target as HTMLElement).style.boxShadow = `0 8px 40px ${ACCENT}70`; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.transform = ""; (e.target as HTMLElement).style.boxShadow = `0 4px 30px ${ACCENT}55`; }}>
                  Get Started Free <ArrowRight size={16} />
                </button>
              </Link>
              <Link href="/login">
                <button style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "14px 28px", borderRadius: 12, fontFamily: "Outfit, sans-serif" }}>
                  Log into account <ChevronRight size={15} />
                </button>
              </Link>
            </div>

            <div style={{ marginTop: 36, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex" }}>
                {["🧑‍🏫", "👩‍🎓", "👨‍🎓", "👩‍🏫"].map((e, i) => (
                  <div key={i} style={{ width: 32, height: 32, borderRadius: "50%", background: `hsl(${240 + i * 30}, 60%, 35%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, border: "2px solid #05060f", marginLeft: i > 0 ? -10 : 0 }}>{e}</div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                Trusted by <b style={{ color: "rgba(255,255,255,0.8)" }}>500+</b> teachers across India
              </div>
            </div>
          </motion.div>

          {/* Right — mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ flex: "1 1 360px", display: "flex", justifyContent: "center", position: "relative" }}
          >
            <div style={{ position: "absolute", inset: -30, background: `radial-gradient(circle at 50% 50%, ${ACCENT}20, transparent 70%)`, pointerEvents: "none" }} />
            <DashboardMockup />
          </motion.div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section ref={statsRef} style={{ padding: "70px clamp(16px, 5vw, 80px)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "40px 24px" }}>
          <StatCounter value={50000} suffix="+" label="Exams Graded" />
          <StatCounter value={98} suffix="%" label="AI Accuracy" />
          <StatCounter value={3} suffix="×" label="Faster Grading" />
          <StatCounter value={500} suffix="+" label="Teachers" />
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section ref={featuresRef} style={{ padding: "100px clamp(16px, 5vw, 80px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            style={{ textAlign: "center", marginBottom: 64 }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: ACCENT, textTransform: "uppercase", marginBottom: 14 }}>Platform Features</div>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3.2rem)", fontWeight: 900, fontFamily: "Outfit, sans-serif", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 16 }}>
              Everything your school needs,<br />
              <span style={{ color: "rgba(255,255,255,0.35)" }}>built in from day one.</span>
            </h2>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", maxWidth: 520, margin: "0 auto", lineHeight: 1.7 }}>
              No stitching together tools. One platform that covers the full cycle from exam creation to student intervention.
            </p>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
                style={{ background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: "28px 24px", transition: "border-color 0.2s, background 0.2s", cursor: "default" }}
                whileHover={{ scale: 1.02, transition: { duration: 0.15 } }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, boxShadow: `0 0 16px ${f.accent}22` }}>
                  <f.icon size={20} color={f.accent} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Outfit, sans-serif", marginBottom: 10, color: "rgba(255,255,255,0.92)" }}>{f.title}</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.42)", lineHeight: 1.65 }}>{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROLES ── */}
      <section style={{ padding: "80px clamp(16px, 5vw, 80px)", background: "rgba(255,255,255,0.015)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: ORANGE, textTransform: "uppercase", marginBottom: 14 }}>Built for Everyone</div>
            <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", fontWeight: 900, fontFamily: "Outfit, sans-serif", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              One platform, every role.
            </h2>
          </motion.div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {[
              { icon: GraduationCap, color: ACCENT, bg: `${ACCENT}15`, title: "Teachers", items: ["Create & publish exams", "Bulk upload answer sheets", "AI grading in seconds", "Class + subject analytics"] },
              { icon: Users, color: "#34d399", bg: "rgba(52,211,153,0.12)", title: "Students", items: ["View AI-written feedback", "Track your performance", "Submit homework photos", "Chat with AI coach"] },
              { icon: BookOpen, color: ORANGE, bg: "rgba(249,115,22,0.12)", title: "Admins", items: ["School-wide KPIs", "Teacher effectiveness", "Intervention alerts", "Governance dashboard"] },
            ].map((role, i) => (
              <motion.div
                key={role.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                style={{ background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: "32px 28px" }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 14, background: role.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                  <role.icon size={22} color={role.color} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Outfit, sans-serif", marginBottom: 16, color: "white" }}>{role.title}</div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {role.items.map(item => (
                    <li key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: role.color, flexShrink: 0 }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: "100px clamp(16px, 5vw, 80px)", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 700, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${ACCENT}15 0%, transparent 70%)`, pointerEvents: "none" }} />
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} style={{ position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: ACCENT, textTransform: "uppercase", marginBottom: 20 }}>Get Started Today</div>
          <h2 style={{ fontSize: "clamp(2.2rem, 5vw, 4rem)", fontWeight: 900, fontFamily: "Outfit, sans-serif", letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: 20, maxWidth: 700, margin: "0 auto 20px" }}>
            Ready to transform how your school evaluates exams?
          </h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", maxWidth: 480, margin: "0 auto 40px", lineHeight: 1.7 }}>
            Join hundreds of schools already using EduSync to grade faster, spot struggling students earlier, and improve outcomes.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/signup">
              <button style={{ display: "flex", alignItems: "center", gap: 8, background: ACCENT, border: "none", color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", padding: "16px 32px", borderRadius: 12, boxShadow: `0 4px 36px ${ACCENT}60`, fontFamily: "Outfit, sans-serif" }}>
                Start for Free <ArrowRight size={17} />
              </button>
            </Link>
            <Link href="/login">
              <button style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: 600, cursor: "pointer", padding: "16px 32px", borderRadius: 12, fontFamily: "Outfit, sans-serif" }}>
                Log in <ChevronRight size={16} />
              </button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "28px clamp(16px, 5vw, 80px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen size={12} color="white" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "Outfit, sans-serif" }}>EduSync</span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>© 2026 EduSync. AI-powered school management.</div>
      </footer>
    </div>
  );
}
