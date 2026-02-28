import { describe, it, expect, beforeEach } from "vitest";
import { detectPii, injectNameCacheForTesting, clearCacheForTesting } from "../../server/privacy/piiDetector";

const MOCK_CACHE = {
  studentNames: ["Alice Johnson", "Bob Smith", "Priya Kapoor"],
  teacherNames: ["Mr. David Brown", "Ms. Sarah Connor"],
  lastRefreshed: Date.now(),
};

beforeEach(() => {
  injectNameCacheForTesting(MOCK_CACHE);
});

describe("PII Detector — Positive (student names)", () => {
  it("finds student name with correct position", async () => {
    const text = "Report for Alice Johnson this term.";
    const matches = await detectPii(text);
    const nameMatch = matches.find(m => m.type === "STUDENT_NAME");
    expect(nameMatch).toBeDefined();
    expect(nameMatch!.value).toMatch(/Alice Johnson/i);
    expect(nameMatch!.start).toBe(text.indexOf("Alice Johnson"));
    expect(nameMatch!.end).toBe(text.indexOf("Alice Johnson") + "Alice Johnson".length);
  });

  it("finds teacher name with correct position", async () => {
    const text = "Lesson by Ms. Sarah Connor for class 10.";
    const matches = await detectPii(text);
    const nameMatch = matches.find(m => m.type === "TEACHER_NAME");
    expect(nameMatch).toBeDefined();
    expect(nameMatch!.value).toMatch(/Sarah Connor/i);
  });

  it("detects email address", async () => {
    const text = "Contact us at student@school.edu for more info.";
    const matches = await detectPii(text);
    const emailMatch = matches.find(m => m.type === "EMAIL");
    expect(emailMatch).toBeDefined();
    expect(emailMatch!.value).toBe("student@school.edu");
  });

  it("detects phone number", async () => {
    const text = "Call parent at 9876543210 immediately.";
    const matches = await detectPii(text);
    const phoneMatch = matches.find(m => m.type === "PHONE");
    expect(phoneMatch).toBeDefined();
    expect(phoneMatch!.value).toContain("9876543210");
  });

  it("detects roll number with context", async () => {
    const text = "Roll No: 42 passed the examination.";
    const matches = await detectPii(text);
    const rollMatch = matches.find(m => m.type === "ROLL_NUMBER");
    expect(rollMatch).toBeDefined();
  });

  it("detects admission ID pattern", async () => {
    const text = "Student S001 scored highest.";
    const matches = await detectPii(text);
    const rollMatch = matches.find(m => m.type === "ROLL_NUMBER");
    expect(rollMatch).toBeDefined();
    expect(rollMatch!.value).toContain("S001");
  });

  it("finds multiple PII items in one string", async () => {
    const text = "Alice Johnson emailed alice@test.com from 9876543210.";
    const matches = await detectPii(text);
    expect(matches.length).toBeGreaterThanOrEqual(3);
    const types = matches.map(m => m.type);
    expect(types).toContain("STUDENT_NAME");
    expect(types).toContain("EMAIL");
    expect(types).toContain("PHONE");
  });
});

describe("PII Detector — Negative (all roles)", () => {
  it("clean text returns empty list", async () => {
    const text = "The exam covered chapters 3 and 4 in detail.";
    const matches = await detectPii(text);
    expect(matches).toHaveLength(0);
  });

  it("phone-shaped number that is not a phone (e.g., date: 20231225) returns no match", async () => {
    const text = "The reference code is 20231225 for this record.";
    const matches = await detectPii(text);
    const phones = matches.filter(m => m.type === "PHONE");
    expect(phones).toHaveLength(0);
  });

  it("empty string input returns empty list without error", async () => {
    const matches = await detectPii("");
    expect(matches).toEqual([]);
  });

  it("word not in name cache returns empty", async () => {
    const text = "The capital of France is Paris.";
    const matches = await detectPii(text);
    const nameMatches = matches.filter(m => m.type === "STUDENT_NAME" || m.type === "TEACHER_NAME");
    expect(nameMatches).toHaveLength(0);
  });
});
