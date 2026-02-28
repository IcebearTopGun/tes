import { db } from "../db";
import { students, teachers } from "../../shared/schema";

export interface PiiMatch {
  type: "STUDENT_NAME" | "TEACHER_NAME" | "EMAIL" | "PHONE" | "ROLL_NUMBER";
  value: string;
  start: number;
  end: number;
}

interface NameCache {
  studentNames: string[];
  teacherNames: string[];
  lastRefreshed: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let _cache: NameCache | null = null;

export function injectNameCacheForTesting(cache: NameCache): void {
  _cache = { ...cache, lastRefreshed: Date.now() };
}

export function clearCacheForTesting(): void {
  _cache = null;
}

async function refreshCache(): Promise<NameCache> {
  const [studentRows, teacherRows] = await Promise.all([
    db.select({ name: students.name }).from(students),
    db.select({ name: teachers.name }).from(teachers),
  ]);
  _cache = {
    studentNames: studentRows.map(r => r.name).filter(Boolean),
    teacherNames: teacherRows.map(r => r.name).filter(Boolean),
    lastRefreshed: Date.now(),
  };
  return _cache;
}

async function getNameCache(): Promise<NameCache> {
  if (!_cache || Date.now() - _cache.lastRefreshed > CACHE_TTL_MS) {
    return refreshCache();
  }
  return _cache;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const PHONE_REGEX =
  /(?<!\d)(?:\+91[-\s]?)?(?<!\d)[6-9][0-9]{9}(?!\d)/g;

const ROLL_REGEX =
  /(?:roll\s*(?:no|number|#)?[\s:.\-]*\s*([A-Z]?[0-9]{1,5}[A-Z]?))|(?:adm(?:ission)?\s*(?:no|number|#)?[\s:.\-]*\s*([A-Z][0-9]{3,5}))|(?:(?<![a-zA-Z])[Ss][0-9]{3,5}(?![a-zA-Z0-9]))|(?:(?<![a-zA-Z])[Tt][0-9]{3,5}(?![a-zA-Z0-9]))/gi;

function findNameMatches(
  text: string,
  names: string[],
  type: "STUDENT_NAME" | "TEACHER_NAME"
): PiiMatch[] {
  const matches: PiiMatch[] = [];
  for (const name of names) {
    if (!name || name.length < 3) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z])`, "gi");
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      matches.push({ type, value: m[0], start: m.index, end: m.index + m[0].length });
    }
  }
  return matches;
}

function findRegexMatches(
  text: string,
  regex: RegExp,
  type: PiiMatch["type"]
): PiiMatch[] {
  const matches: PiiMatch[] = [];
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].trim().length > 0) {
      matches.push({ type, value: m[0].trim(), start: m.index, end: m.index + m[0].length });
    }
  }
  return matches;
}

function deduplicateMatches(matches: PiiMatch[]): PiiMatch[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: PiiMatch[] = [];
  let lastEnd = -1;
  for (const m of sorted) {
    if (m.start >= lastEnd) {
      result.push(m);
      lastEnd = m.end;
    }
  }
  return result;
}

export async function detectPii(text: string): Promise<PiiMatch[]> {
  if (!text || text.trim().length === 0) return [];

  const cache = await getNameCache();
  const matches: PiiMatch[] = [
    ...findNameMatches(text, cache.studentNames, "STUDENT_NAME"),
    ...findNameMatches(text, cache.teacherNames, "TEACHER_NAME"),
    ...findRegexMatches(text, EMAIL_REGEX, "EMAIL"),
    ...findRegexMatches(text, PHONE_REGEX, "PHONE"),
    ...findRegexMatches(text, ROLL_REGEX, "ROLL_NUMBER"),
  ];

  return deduplicateMatches(matches);
}

export type { NameCache };
