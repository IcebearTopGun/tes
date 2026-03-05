import { Link } from "wouter";
import { useState, useRef, useEffect } from "react";

const C = {
  cream: "#F5F3EE",
  pinkLight: "#E8E1F4",
  pinkMid: "#A995D7",
  pinkHot: "#7A63B8",
  lavender: "#D8D0EA",
  lavenderMid: "#B8A9DB",
  purpleDark: "#6F57AD",
  textDark: "#383158",
  textMid: "#595276",
  white: "#FFFFFF",
};

const FEATURES = [
  { variant: "pink", iconBg: "pink", icon: "🤖", title: "Conversational AI for Everyone", desc: "Parents ask \"Where does my child stand?\" Teachers ask \"How is my class doing?\" Admins ask \"Which classes are giving the best results?\" — each role gets answers from their own data." },
  { variant: "lavender", iconBg: "purple", icon: "📄", title: "AI Checking & Chapter Intelligence", desc: "Answer sheets are evaluated automatically — saving teachers hours weekly. The AI maps every score to the exact chapter and concept, so you know precisely where each student needs to focus." },
  { variant: "white", iconBg: "pink", icon: "⚠️", title: "Early Warning System", desc: "Identifies at-risk students before it's too late — tracking declining marks, homework gaps, and ranking falls. Every student gets a risk score, weak subject list, and engagement level." },
  { variant: "lavender", iconBg: "green", icon: "📊", title: "Assessment, Homework & Performance", desc: "Every submission, score, and engagement signal is captured automatically. Live dashboards give teachers, students, and admins a distraction-free view of KPIs and evaluation history." },
  { variant: "pink", iconBg: "pink", icon: "🏫", title: "Admin School Intelligence", desc: "Principals and admins get a full school-level view — class rankings, teacher effectiveness trends, bottom 2 performers per class, question quality scores, and department signals." },
  { variant: "white", iconBg: "green", icon: "👨‍👩‍👧", title: "Student & Parent Visibility", desc: "Students see their rank, subject-wise progress, and chapter gaps in real time. Parents can ask where their child stands and track homework consistency — without waiting for a meeting." },
];

const FEATURE_CARD_BG: Record<string, string> = {
  pink: C.pinkLight,
  lavender: C.lavender,
  white: C.white,
};
const FEATURE_ICON_BG: Record<string, string> = {
  pink: "rgba(232,67,122,0.12)",
  purple: "rgba(61,31,110,0.10)",
  green: "rgba(34,197,94,0.10)",
};

type ChatRole = "user" | "ai";
interface ChatMsg { role: ChatRole; text: string; pills?: { l: string; v?: string; b?: string; t?: string }[] }

function lpReply(text: string, role: "parent" | "teacher" | "admin"): { text: string; pills: any[] } {
  const t = text.toLowerCase();
  if (role === "parent") {
    if (t.includes("homework")) return { text: "Aryan submitted 18/20 assignments this month (90%) — above class avg.", pills: [{ l: "On time", v: "18/20", b: "90%", t: "up" }, { l: "Late (both Math)", b: "2 assignments", t: "wn" }] };
    if (t.includes("weak") || t.includes("subject")) return { text: "Two subjects need attention:", pills: [{ l: "Math", b: "61%", t: "wn" }, { l: "Chemistry", b: "57%", t: "dn" }] };
    if (t.includes("attend")) return { text: "Aryan's attendance is 91% this month — above the 85% threshold.", pills: [{ l: "Present", v: "19/21 days", b: "91%", t: "up" }] };
    return { text: "Aryan is performing well overall. Rank 8/34 in Grade 9B. Would you like a subject breakdown?", pills: [] };
  }
  if (role === "teacher") {
    if (t.includes("homework") || t.includes("gap")) return { text: "Homework submission rate this week:", pills: [{ l: "Submitted on time", v: "22/30", b: "73%", t: "up" }, { l: "Missing submissions", v: "8 students", b: "⚠", t: "wn" }] };
    if (t.includes("top") || t.includes("performer")) return { text: "Top 3 performers this month:", pills: [{ l: "Priya Sharma", b: "92%", t: "up" }, { l: "Aditya Nair", b: "88%", t: "up" }, { l: "Meena Roy", b: "85%", t: "up" }] };
    if (t.includes("subject") || t.includes("breakdown")) return { text: "Class subject averages:", pills: [{ l: "Math", v: "67%", b: "↓ -4%", t: "dn" }, { l: "English", v: "74%", b: "↑", t: "up" }] };
    return { text: "Grade 9B overall is at 67% — down 4% from last month. 3 students flagged as at-risk.", pills: [] };
  }
  // admin
  if (t.includes("teacher") || t.includes("effective")) return { text: "Most effective teacher this term:", pills: [{ l: "Mrs. Joshi — English", b: "Best", t: "up" }, { l: "Class avg improvement", v: "+12%", b: "↑", t: "up" }] };
  if (t.includes("subject") || t.includes("weak")) return { text: "Weakest subject school-wide:", pills: [{ l: "Mathematics", v: "58% avg", b: "⚠ Attention", t: "dn" }, { l: "3 classes below 55%", b: "Risk", t: "dn" }] };
  if (t.includes("homework") || t.includes("completion")) return { text: "Homework completion trend across school:", pills: [{ l: "This week", v: "79%", b: "↑ +8%", t: "up" }, { l: "Lowest: Grade 9C", v: "41%", b: "↓", t: "dn" }] };
  return { text: "School avg is 68% — up 3% from last month. 16 students at risk across all classes.", pills: [] };
}

function ChatShowcase({ chatId, role, placeholder, darkBg }: { chatId: string; role: "parent" | "teacher" | "admin"; placeholder: string; darkBg?: boolean }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages, typing]);

  const send = (text: string) => {
    if (!text.trim()) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const reply = lpReply(text, role);
      setMessages(m => [...m, { role: "ai", text: reply.text, pills: reply.pills }]);
    }, 1100);
  };

  const bg = darkBg ? "rgba(0,0,0,0.2)" : "#F8F7FD";
  const bubbleAiBg = darkBg ? "rgba(255,255,255,0.1)" : "white";
  const bubbleAiBorder = darkBg ? "rgba(255,255,255,0.14)" : "#E0DCF0";
  const bubbleAiColor = darkBg ? "rgba(255,255,255,0.9)" : "#1C1640";
  const pillBg = darkBg ? "rgba(255,255,255,0.09)" : "#EAE7F5";
  const pillLabelColor = darkBg ? "rgba(255,255,255,0.5)" : "#4A4270";
  const pillValColor = darkBg ? "white" : "#1C1640";
  const chipBg = darkBg ? "rgba(255,255,255,0.08)" : "white";
  const chipBorder = darkBg ? "rgba(255,255,255,0.14)" : "#E0DCF0";
  const chipColor = darkBg ? "rgba(255,255,255,0.65)" : "#4A4270";
  const inputBg = darkBg ? "rgba(255,255,255,0.09)" : "white";
  const inputBorder = darkBg ? "rgba(255,255,255,0.18)" : "#E0DCF0";
  const inputColor = darkBg ? "white" : "#1C1640";
  const cardHeaderBg = darkBg ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)";
  const cardHeaderBorder = darkBg ? "rgba(255,255,255,0.1)" : "rgba(224,220,240,0.8)";
  const cardBg = darkBg ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.78)";
  const cardBorder = darkBg ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.95)";

  const BADGE_STYLES: Record<string, any> = {
    up: { background: "#ECFDF5", color: "#059669" },
    dn: { background: "#FEF2F2", color: "#DC2626" },
    wn: { background: "#FFFBEB", color: "#D97706" },
  };

  const CHIPS: Record<string, string[]> = {
    parent: ["Homework consistency?", "Weak subjects?", "Attendance this month?"],
    teacher: ["Show homework gaps", "Top performers?", "Subject breakdown"],
    admin: ["Who is most effective?", "Weakest subject?", "Homework trends"],
  };
  const TITLES: Record<string, string> = {
    parent: "EduAnalytics AI — Parent View",
    teacher: "EduAnalytics AI — Teacher View",
    admin: "School Intelligence — Admin View",
  };

  return (
    <div style={{ background: cardBg, backdropFilter: "blur(18px)", borderRadius: 16, border: `1px solid ${cardBorder}`, boxShadow: darkBg ? "none" : "0 8px 40px rgba(61,44,141,0.10), 0 2px 6px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ padding: "13px 18px", borderBottom: `1px solid ${cardHeaderBorder}`, display: "flex", alignItems: "center", gap: 10, background: cardHeaderBg }}>
        <div style={{ display: "flex", gap: 5 }}>
          {["#FF6058", "#FFBD2E", "#28CA41"].map(c => <div key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />)}
        </div>
        <div style={{ fontSize: "0.72rem", fontWeight: 600, color: darkBg ? "rgba(255,255,255,0.35)" : "#8A82B0", letterSpacing: "0.04em" }}>{TITLES[role]}</div>
      </div>
      <div ref={chatRef} style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, minHeight: 260, maxHeight: 260, overflowY: "auto", background: bg }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.67rem", fontWeight: 700, background: msg.role === "user" ? "#5B4FCF" : "#3D2C8D", color: "white", flexShrink: 0 }}>
              {msg.role === "user" ? role === "parent" ? "PR" : role === "teacher" ? "TC" : "AD" : "✦"}
            </div>
            <div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: 10, fontSize: "0.8rem", lineHeight: 1.55, ...(msg.role === "user" ? { background: "#5B4FCF", color: "white", borderBottomRightRadius: 3 } : { background: bubbleAiBg, color: bubbleAiColor, border: `1px solid ${bubbleAiBorder}`, borderBottomLeftRadius: 3, boxShadow: darkBg ? "none" : "0 1px 4px rgba(0,0,0,0.05)" }) }}>
              {msg.text}
              {(msg.pills || []).map((p, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7, padding: "6px 9px", background: pillBg, borderRadius: 6, fontSize: "0.74rem" }}>
                  <span style={{ color: pillLabelColor }}>{p.l}</span>
                  {p.v && <span style={{ fontWeight: 600, color: pillValColor }}>{p.v}</span>}
                  {p.b && <span style={{ fontSize: "0.67rem", fontWeight: 600, padding: "2px 6px", borderRadius: 4, ...BADGE_STYLES[p.t || "wn"] }}>{p.b}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {typing && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "#3D2C8D", color: "white", fontSize: "0.67rem", fontWeight: 700, flexShrink: 0 }}>✦</div>
            <div style={{ background: darkBg ? "rgba(255,255,255,0.1)" : "white", border: `1px solid ${bubbleAiBorder}`, borderRadius: "10px 10px 10px 3px", padding: "9px 13px", display: "flex", gap: 4, alignItems: "center" }}>
              {[0, 0.18, 0.36].map((d, i) => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#C4B5E8", animation: `bounce 1.1s ${d}s infinite` }} />)}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: "9px 14px", display: "flex", gap: 6, flexWrap: "wrap", borderTop: `1px solid ${chipBorder}`, background: darkBg ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.35)" }}>
        {CHIPS[role].map(chip => (
          <button key={chip} onClick={() => send(chip)} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${chipBorder}`, background: chipBg, fontSize: "0.7rem", color: chipColor, cursor: "pointer", fontFamily: "DM Sans, sans-serif", transition: "all 0.18s" }}>
            {chip}
          </button>
        ))}
      </div>
      <div style={{ padding: "11px 14px", borderTop: `1px solid ${chipBorder}`, display: "flex", gap: 8, alignItems: "center", background: darkBg ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(input); }}
          placeholder={placeholder}
          style={{ flex: 1, border: `1px solid ${inputBorder}`, borderRadius: 7, padding: "7px 11px", fontSize: "0.78rem", fontFamily: "DM Sans, sans-serif", background: inputBg, color: inputColor, outline: "none" }}
        />
        <button onClick={() => send(input)} style={{ width: 30, height: 30, borderRadius: 7, background: "#3D2C8D", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "0.82rem", flexShrink: 0 }}>↑</button>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
        .lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .lp-root { font-family: 'DM Sans', sans-serif; background: ${C.cream}; color: ${C.textDark}; overflow-x: hidden; scroll-behavior: smooth; }
        .lp-nav-link { text-decoration: none; font-size: 0.9rem; font-weight: 500; color: ${C.textMid}; transition: color 0.2s; }
        .lp-nav-link:hover { color: ${C.purpleDark}; }
        .lp-btn-outline { padding: 9px 22px; border: 1.5px solid ${C.purpleDark}; border-radius: 50px; background: transparent; color: ${C.purpleDark}; font-size: 0.875rem; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; }
        .lp-btn-outline:hover { background: ${C.purpleDark}; color: white; }
        .lp-btn-primary { padding: 10px 24px; border: none; border-radius: 50px; background: ${C.purpleDark}; color: white; font-size: 0.875rem; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.22s; }
        .lp-btn-primary:hover { background: ${C.lavenderMid}; transform: translateY(-1px); }
        .lp-btn-hero { padding: 14px 32px; border-radius: 50px; background: ${C.purpleDark}; color: white; border: none; font-size: 1rem; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.22s; box-shadow: 0 8px 30px rgba(61,31,110,0.25); }
        .lp-btn-hero:hover { background: ${C.lavenderMid}; transform: translateY(-2px); box-shadow: 0 12px 40px rgba(111,87,173,0.26); }
        .lp-btn-hero-sec { padding: 14px 32px; border-radius: 50px; background: transparent; color: ${C.textMid}; border: 1.5px solid rgba(90,64,112,0.3); font-size: 1rem; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.22s; }
        .lp-btn-hero-sec:hover { border-color: ${C.purpleDark}; color: ${C.purpleDark}; }
        .lp-feature-card { border-radius: 20px; padding: 36px; transition: transform 0.25s, box-shadow 0.25s; cursor: default; }
        .lp-feature-card:hover { transform: translateY(-4px); box-shadow: 0 20px 60px rgba(0,0,0,0.08); }
        .lp-testimonial-card { border-radius: 20px; padding: 36px; }
        .lp-read-more { display: inline-flex; align-items: center; gap: 6px; margin-top: 16px; font-size: 0.85rem; font-weight: 500; text-decoration: none; color: ${C.pinkHot}; border-bottom: 1px solid ${C.pinkHot}; padding-bottom: 2px; transition: gap 0.2s; }
        .lp-read-more:hover { gap: 10px; }
        .lp-read-more-hot { color: white; border-color: white; }
        .lp-sc-chip:hover { border-color: ${C.lavenderMid}; background: #EAE7F5; color: #5B4FCF; }
        .lp-hero-badge::before { content: ''; width: 6px; height: 6px; background: ${C.pinkHot}; border-radius: 50%; animation: lp-pulse 2s infinite; }
        @keyframes lp-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.4); } }
        @keyframes bounce { 0%,60%,100% { transform:translateY(0); background:#C4B5E8; } 30% { transform:translateY(-4px); background:#5B4FCF; } }
        @keyframes lp-fadeUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        .lp-hero-content { animation: lp-fadeUp 0.8s ease both; }
        .lp-cta-btn { padding: 14px 32px; border-radius: 50px; background: ${C.purpleDark}; color: white; border: none; font-size: 1rem; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.22s; box-shadow: 0 8px 40px rgba(111,87,173,0.26); }
        .lp-cta-btn:hover { background: ${C.purpleDark}; color: white; transform: translateY(-1px); }
        .lp-sc-eyebrow { display: inline-block; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #5B4FCF; margin-bottom: 18px; }
        .dark-sc .lp-sc-eyebrow { color: #A78BFA; }
      `}</style>
      <div className="lp-root">

        {/* NAV */}
        <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 60px", background: "rgba(245,243,238,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(184,169,219,0.35)" }}>
          <div style={{ fontFamily: "DM Serif Display, serif", fontSize: "1.4rem", color: C.purpleDark, letterSpacing: "-0.02em" }}>
            SCHOLAR.AI
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/login"><button className="lp-btn-outline">Login</button></Link>
            <a href="#demo-contact"><button className="lp-btn-primary">Request a Demo</button></a>
          </div>
        </nav>

        {/* HERO */}
        <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", padding: "120px 60px 80px", position: "relative", overflow: "hidden", background: C.lavender }}>
          <div style={{ position: "absolute", top: -100, right: -80, width: 600, height: 600, background: `radial-gradient(ellipse, ${C.pinkLight} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -60, left: "30%", width: 400, height: 400, background: `radial-gradient(ellipse, ${C.lavender} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />
          <div className="lp-hero-content" style={{ maxWidth: 680, position: "relative", zIndex: 2 }}>
            <div className="lp-hero-badge" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.pinkLight, color: C.pinkHot, borderRadius: 50, padding: "6px 16px", fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 28 }}>
              AI-Powered School Intelligence
            </div>
            <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "clamp(3rem, 5.5vw, 5rem)", lineHeight: 1.05, letterSpacing: "-0.03em", color: C.textDark, marginBottom: 24 }}>
              Where Teachers, Students &amp; Schools <em style={{ fontStyle: "italic", color: C.pinkHot }}>Think Smarter.</em>
            </h1>
            <p style={{ fontSize: "1.15rem", lineHeight: 1.65, color: C.textMid, maxWidth: 520, marginBottom: 40, fontWeight: 300 }}>
              SCHOLAR.AI is the AI intelligence layer for your entire school — automated answer checking, early risk detection, chapter-level learning gaps, and real-time performance insights in one calm platform.
            </p>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Link href="/login"><button className="lp-btn-hero">Get Started Free →</button></Link>
              <button className="lp-btn-hero-sec">See how it works</button>
            </div>
          </div>
        </section>

        {/* STATS STRIP */}
        <div style={{ background: C.purpleDark, padding: "40px 60px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {[
            { num: "10", sup: "×", label: "Faster paper checking" },
            { num: "87", sup: "%", label: "Early warning accuracy" },
            { num: "3", sup: "×", label: "Teacher productivity gain" },
            { num: "12", sup: "k+", label: "Students monitored daily" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "DM Serif Display, serif", fontSize: "2.8rem", color: "white", letterSpacing: "-0.03em" }}>
                {s.num}<span style={{ color: C.pinkMid }}>{s.sup}</span>
              </div>
              <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", marginTop: 4, fontWeight: 400 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* FEATURES */}
        <section style={{ padding: "100px 60px", background: C.cream }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.pinkHot, marginBottom: 16 }}>Platform Features</div>
          <div style={{ fontFamily: "DM Serif Display, serif", fontSize: "clamp(2rem, 3.5vw, 3rem)", letterSpacing: "-0.03em", color: C.textDark, maxWidth: 520, lineHeight: 1.15, marginBottom: 64 }}>
            Six tools. One platform. Total school intelligence.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {FEATURES.map(f => (
              <div key={f.title} className="lp-feature-card" style={{ background: FEATURE_CARD_BG[f.variant], border: f.variant === "white" ? "1px solid rgba(200,180,220,0.3)" : "none" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: FEATURE_ICON_BG[f.iconBg], display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: 20 }}>{f.icon}</div>
                <h3 style={{ fontFamily: "DM Serif Display, serif", fontSize: "1.25rem", color: C.textDark, marginBottom: 10, letterSpacing: "-0.02em" }}>{f.title}</h3>
                <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: C.textMid, fontWeight: 300 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section style={{ padding: "100px 60px", background: `linear-gradient(180deg, ${C.cream} 0%, ${C.pinkLight} 100%)` }}>
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 1fr", gap: 20, alignItems: "start" }}>
            <div>
              <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "2.5rem", color: C.textDark, lineHeight: 1.15, letterSpacing: "-0.03em" }}>What educators are saying</h2>
            </div>
            <div className="lp-testimonial-card" style={{ background: C.pinkLight }}>
              <div style={{ fontFamily: "DM Serif Display, serif", fontSize: "3rem", lineHeight: 0.8, marginBottom: 16, opacity: 0.6, color: C.textDark }}>"</div>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.65, marginBottom: 20, fontWeight: 300, color: C.textDark }}>The early warning system flagged a student we'd missed for three weeks. We were able to intervene before his grades collapsed. This platform is genuinely life-changing for teachers.</p>
              <div style={{ fontSize: "0.82rem", fontWeight: 500, color: C.textMid }}>Mrs. Sharma, Class Teacher — Grade 9A</div>
              <a href="#" className="lp-read-more">Read more →</a>
            </div>
            <div className="lp-testimonial-card" style={{ background: C.pinkHot, color: "white" }}>
              <div style={{ fontFamily: "DM Serif Display, serif", fontSize: "3rem", lineHeight: 0.8, marginBottom: 16, opacity: 0.6 }}>"</div>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.65, marginBottom: 20, fontWeight: 300, color: "rgba(255,255,255,0.9)" }}>As a principal, I can now ask the AI "which subject needs intervention?" and get an answer rooted in actual data — not a gut feeling. The question quality analysis alone is worth it.</p>
              <div style={{ fontSize: "0.82rem", fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>Dr. Patel, School Principal</div>
              <a href="#" className="lp-read-more lp-read-more-hot">Read more →</a>
            </div>
          </div>
        </section>

        {/* AI SHOWCASE */}
        <section style={{ background: "linear-gradient(160deg, #F2F0F8 0%, #EDE9FB 100%)" }}>

          {/* Block 1: Parent — light */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", padding: "80px", gap: 80, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(91,79,207,0.07) 0%, transparent 70%)", top: -80, right: -60, pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 2 }}>
              <span className="lp-sc-eyebrow">For Parents &amp; Students</span>
              <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "clamp(1.9rem, 2.8vw, 2.6rem)", lineHeight: 1.12, letterSpacing: "-0.03em", color: "#1C1640", marginBottom: 18 }}>
                Know exactly where your child stands — <em style={{ fontStyle: "italic", color: "#5B4FCF" }}>and what to do next.</em>
              </h2>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.72, color: "#4A4270", fontWeight: 300, maxWidth: 400, marginBottom: 26 }}>Stop waiting for report cards. Ask the AI where your child ranks, which chapter they're struggling with, and what to focus on this week.</p>
              <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.88rem", fontWeight: 500, color: "#5B4FCF", textDecoration: "none", borderBottom: "1px solid #5B4FCF", paddingBottom: 2 }}>Explore more →</a>
            </div>
            <div style={{ position: "relative", zIndex: 2 }}>
              <ChatShowcase chatId="parent" role="parent" placeholder="Ask about your child…" />
            </div>
          </div>

          {/* Block 2: Teacher — dark */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", padding: "80px", gap: 80, position: "relative", overflow: "hidden", background: "#1C1640" }}>
            <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(196,181,248,0.08) 0%, transparent 70%)", top: -80, right: -60, pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 2 }}>
              <span style={{ display: "inline-block", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#A78BFA", marginBottom: 18 }}>For Teachers</span>
              <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "clamp(1.9rem, 2.8vw, 2.6rem)", lineHeight: 1.12, letterSpacing: "-0.03em", color: "white", marginBottom: 18 }}>
                Answer <em style={{ fontStyle: "italic", color: "#C4B5F8" }}>"How is my class doing?"</em> — in seconds, not hours.
              </h2>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.72, color: "rgba(255,255,255,0.55)", fontWeight: 300, maxWidth: 400, marginBottom: 26 }}>No more manual analysis. Ask which students need attention, see homework rates, and get early warnings before a student falls too far behind.</p>
              <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.88rem", fontWeight: 500, color: "#C4B5F8", textDecoration: "none", borderBottom: "1px solid #C4B5F8", paddingBottom: 2 }}>Explore more →</a>
            </div>
            <div style={{ position: "relative", zIndex: 2 }}>
              <ChatShowcase chatId="teacher" role="teacher" placeholder="Ask about your class…" darkBg />
            </div>
          </div>

          {/* Block 3: Admin — light */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", padding: "80px", gap: 80, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(91,79,207,0.07) 0%, transparent 70%)", top: -80, right: -60, pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 2 }}>
              <span className="lp-sc-eyebrow">For Admins &amp; Principals</span>
              <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "clamp(1.9rem, 2.8vw, 2.6rem)", lineHeight: 1.12, letterSpacing: "-0.03em", color: "#1C1640", marginBottom: 18 }}>
                The entire school, visible in <em style={{ fontStyle: "italic", color: "#5B4FCF" }}>one conversation.</em>
              </h2>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.72, color: "#4A4270", fontWeight: 300, maxWidth: 400, marginBottom: 26 }}>Ask which classes are giving the best results, which teachers are improving, and which departments need intervention — grounded in real institutional data.</p>
              <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.88rem", fontWeight: 500, color: "#5B4FCF", textDecoration: "none", borderBottom: "1px solid #5B4FCF", paddingBottom: 2 }}>Explore more →</a>
            </div>
            <div style={{ position: "relative", zIndex: 2 }}>
              <ChatShowcase chatId="admin" role="admin" placeholder="Ask e.g. Which teachers are improving?" />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "100px 60px", background: `linear-gradient(135deg, ${C.pinkLight} 0%, ${C.lavender} 100%)`, textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 700, height: 400, background: "radial-gradient(ellipse, rgba(232,67,122,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
          <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "clamp(2.5rem, 4vw, 3.8rem)", color: C.textDark, letterSpacing: "-0.03em", marginBottom: 20, position: "relative", zIndex: 2 }}>
            Ready to transform how your school <em style={{ fontStyle: "italic", color: C.pinkHot }}>thinks?</em>
          </h2>
          <p style={{ fontSize: "1.05rem", color: C.textMid, marginBottom: 40, position: "relative", zIndex: 2, fontWeight: 300 }}>
            Join hundreds of schools already using SCHOLAR.AI to grade faster, identify struggling students earlier, and improve academic outcomes.
          </p>
          <Link href="/login"><button className="lp-cta-btn" style={{ position: "relative", zIndex: 2 }}>Get Started Free →</button></Link>
        </section>

        {/* DEMO CONTACT */}
        <section id="demo-contact" style={{ padding: "64px 60px", background: "#F3EEF9", borderTop: "1px solid rgba(184,169,219,0.45)", textAlign: "center" }}>
          <h3 style={{ fontFamily: "DM Serif Display, serif", fontSize: "2rem", color: C.textDark, marginBottom: 10 }}>Request Demo</h3>
          <p style={{ fontSize: "0.98rem", color: C.textMid, marginBottom: 8 }}>For demo requests, contact us at:</p>
          <a href="mailto:touchmenot@gmail.com" style={{ fontSize: "1.05rem", fontWeight: 600, color: C.purpleDark, textDecoration: "none", borderBottom: `1px solid ${C.purpleDark}` }}>
            touchmenot@gmail.com
          </a>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: "40px 60px", background: C.textDark, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "DM Serif Display, serif", fontSize: "1.2rem", color: "white" }}>
            SCHOLAR.AI
          </div>
          <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>© 2026 SCHOLAR.AI. Empowering schools through intelligent data.</p>
        </footer>

      </div>
    </>
  );
}
