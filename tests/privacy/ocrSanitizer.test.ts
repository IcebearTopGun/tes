import { describe, it, expect, beforeEach } from "vitest";
import { sanitizeOcrText, injectNameCacheForTesting } from "../../server/privacy/ocrSanitizer";
import { createPiiMap } from "../../server/privacy/tokenizer";

beforeEach(() => {
  injectNameCacheForTesting({
    studentNames: ["Priya Kapoor", "Alice Johnson"],
    teacherNames: ["Mr. David Brown"],
    lastRefreshed: Date.now(),
  });
});

describe("OCR Sanitizer — Positive", () => {
  it("replaces 'My name is X' phrase", async () => {
    const ocr = "My name is Alice. The answer to Q1 is photosynthesis.";
    const piiMap = createPiiMap();
    const result = await sanitizeOcrText(ocr, piiMap);
    expect(result).not.toContain("My name is Alice");
    expect(result).toContain("[STUDENT_IDENTIFIER]");
  });

  it("replaces roll number context", async () => {
    const ocr = "Roll No: 2301 — Q1. The process of osmosis involves movement of water.";
    const piiMap = createPiiMap();
    const result = await sanitizeOcrText(ocr, piiMap);
    expect(result).not.toMatch(/Roll No:\s*2301/);
  });

  it("replaces class identifier", async () => {
    const ocr = "Class 10A — Final Exam Answer Sheet. Q1: Water boils at 100°C.";
    const piiMap = createPiiMap();
    const result = await sanitizeOcrText(ocr, piiMap);
    expect(result).not.toMatch(/Class 10A/i);
  });

  it("replaces name found in student cache without phrase prefix", async () => {
    const ocr = "Priya Kapoor answered Q2 correctly. The mitochondria is the powerhouse.";
    const piiMap = createPiiMap();
    const result = await sanitizeOcrText(ocr, piiMap);
    expect(result).not.toContain("Priya Kapoor");
  });

  it("replaces teacher name found in OCR", async () => {
    const ocr = "Checked by Mr. David Brown. Q1 answer is correct.";
    const piiMap = createPiiMap();
    const result = await sanitizeOcrText(ocr, piiMap);
    expect(result).not.toContain("David Brown");
  });
});

describe("OCR Sanitizer — Negative", () => {
  it("clean answer content is unchanged", async () => {
    const ocr = "Photosynthesis converts sunlight into chemical energy. The formula is 6CO2 + 6H2O → C6H12O6 + 6O2.";
    const piiMap = createPiiMap();
    const result = await sanitizeOcrText(ocr, piiMap);
    expect(result).toContain("Photosynthesis");
    expect(result).toContain("C6H12O6");
  });

  it("empty input returns empty string", async () => {
    const piiMap = createPiiMap();
    const result = await sanitizeOcrText("", piiMap);
    expect(result).toBe("");
  });

  it("'I think' is not incorrectly stripped", async () => {
    const ocr = "I think the answer involves Newton's second law.";
    const piiMap = createPiiMap();
    const result = await sanitizeOcrText(ocr, piiMap);
    expect(result).toContain("Newton");
    expect(result).not.toContain("[STUDENT_IDENTIFIER]");
  });
});
