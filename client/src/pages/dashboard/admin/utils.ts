export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

export function kpiColor(score: number) {
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

/*
File Purpose:
This file provides shared utility helpers for the admin dashboard.

Responsibilities:

* Computes context greeting text
* Maps KPI scores to semantic color tokens

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
