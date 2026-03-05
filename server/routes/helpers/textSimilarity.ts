function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

export function similarityScore(a: string, b: string): number {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap++;
  return overlap / Math.max(aTokens.size, 1);
}

export function tokenizeText(text: string): string[] {
  return tokenize(text);
}

/*
File Purpose:
This file provides text tokenization and similarity scoring helpers for evaluation logic.

Responsibilities:

* Tokenizes free-form text into normalized tokens
* Computes a simple token-overlap similarity score

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
