export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function pctColor(pct: number) {
  if (pct >= 75) return "var(--green)";
  if (pct >= 50) return "var(--amber)";
  return "var(--red)";
}

/*
File Purpose:
This file provides shared utility helpers for the teacher dashboard.

Responsibilities:

* Converts files to data URLs for upload/OCR workflows
* Maps percentages to semantic UI colors

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
