export const ADMIN_CHAT_QUESTIONS = [
  "Which class needs academic intervention?",
  "Who is the most effective teacher this term?",
  "Which subject shows the weakest school performance?",
  "How is homework completion trending across classes?",
  "Which students are at risk of underperformance?",
];

export const BAR_COLORS = [
  { bg: "var(--lav-card)", border: "" },
  { bg: "var(--green-bg)", border: "1.5px solid rgba(42,157,110,.3)" },
  { bg: "var(--amber-bg)", border: "1.5px solid rgba(196,122,30,.3)" },
  { bg: "var(--blue-bg)", border: "1.5px solid rgba(37,99,192,.2)" },
  { bg: "#fce4ef", border: "1.5px solid rgba(212,65,126,.2)" },
];

export const CHART_PALETTE = [
  "#7C6FF7", "#4CAF7D", "#F7A23E", "#E06B8B",
  "#4DBBE0", "#B67BE0", "#60C5A8", "#F7C948",
];

/*
File Purpose:
This file centralizes constants used by the admin dashboard UI.

Responsibilities:

* Provides static prompt lists and chart palettes
* Keeps configuration separated from rendering and state logic

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
