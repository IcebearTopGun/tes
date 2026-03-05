export const EXAMPLE_QUESTIONS = [
  "Which students need improvement?",
  "Who scored highest in the last exam?",
  "Give me a class performance summary.",
  "What are the weakest areas across all students?",
];

export const EXAM_CATEGORIES = [
  { value: "mid_term", label: "Mid Term" },
  { value: "unit_test", label: "Unit Test" },
  { value: "end_sem", label: "End Sem" },
  { value: "class_test", label: "Class Test" },
];

export const BAR_COLORS = [
  { bg: "var(--lav-card)", border: "" },
  { bg: "var(--green-bg)", border: "1.5px solid rgba(42,157,110,.3)" },
  { bg: "var(--amber-bg)", border: "1.5px solid rgba(196,122,30,.3)" },
  { bg: "var(--blue-bg)", border: "1.5px solid rgba(37,99,192,.2)" },
  { bg: "#fce4ef", border: "1.5px solid rgba(212,65,126,.2)" },
];

/*
File Purpose:
This file centralizes constants used by the teacher dashboard UI.

Responsibilities:

* Provides sample AI questions, exam categories, and chart color palettes
* Keeps static configuration separate from component logic

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
