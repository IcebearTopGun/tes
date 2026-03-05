export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function getInitials(name: string) {
  return name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function kpiColor(score: number) {
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

/*
File Purpose:
This file provides shared utility helpers for principal dashboard modules.

Responsibilities:

* Computes greeting and initials display values
* Maps KPI scores to semantic color tokens

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
