// Deterministic pseudo-random 0-1 from integer seed
export function drand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/*
File Purpose:
This file provides deterministic pseudo-random helper utilities.

Responsibilities:

* Returns a deterministic 0-1 float given an integer seed

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
