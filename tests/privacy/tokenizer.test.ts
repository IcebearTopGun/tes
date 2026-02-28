import { describe, it, expect } from "vitest";
import {
  maskText,
  unmaskText,
  createPiiMap,
  discardPiiMap,
  generateToken,
  type PiiMap,
} from "../../server/privacy/tokenizer";
import type { PiiMatch } from "../../server/privacy/piiDetector";

describe("Tokenizer — Positive", () => {
  it("mask produces STUDENT_XXXX format", () => {
    const piiMap = createPiiMap();
    const matches: PiiMatch[] = [
      { type: "STUDENT_NAME", value: "Alice Johnson", start: 0, end: 13 },
    ];
    const result = maskText("Alice Johnson was here.", matches, piiMap);
    expect(result).toMatch(/^STUDENT_[A-Z0-9]{4}/);
    expect(result).not.toContain("Alice Johnson");
  });

  it("same entity returns the same token on second mask call", () => {
    const piiMap = createPiiMap();
    const matches1: PiiMatch[] = [
      { type: "STUDENT_NAME", value: "Bob Smith", start: 10, end: 19 },
    ];
    const matches2: PiiMatch[] = [
      { type: "STUDENT_NAME", value: "Bob Smith", start: 5, end: 14 },
    ];
    const result1 = maskText("Hello    Bob Smith!", matches1, piiMap);
    const result2 = maskText("Hello Bob Smith end", matches2, piiMap);

    const token1 = result1.match(/STUDENT_[A-Z0-9]+/)?.[0];
    const token2 = result2.match(/STUDENT_[A-Z0-9]+/)?.[0];
    expect(token1).toBeDefined();
    expect(token1).toBe(token2);
  });

  it("unmask restores the correct original value", () => {
    const piiMap = createPiiMap();
    const matches: PiiMatch[] = [
      { type: "STUDENT_NAME", value: "Priya Kapoor", start: 0, end: 12 },
    ];
    const masked = maskText("Priya Kapoor submitted.", matches, piiMap);
    const unmasked = unmaskText(masked, piiMap);
    expect(unmasked).toContain("Priya Kapoor");
  });

  it("unmasks multiple token types in one pass", () => {
    const piiMap = createPiiMap();
    const text = "Alice Johnson emailed alice@school.com today.";
    const emailStart = text.indexOf("alice@school.com");
    const matches: PiiMatch[] = [
      { type: "STUDENT_NAME", value: "Alice Johnson", start: 0, end: 13 },
      { type: "EMAIL", value: "alice@school.com", start: emailStart, end: emailStart + "alice@school.com".length },
    ];
    const masked = maskText(text, matches, piiMap);
    expect(masked).not.toContain("Alice Johnson");
    expect(masked).not.toContain("alice@school.com");

    const unmasked = unmaskText(masked, piiMap);
    expect(unmasked).toContain("Alice Johnson");
    expect(unmasked).toContain("alice@school.com");
  });
});

describe("Tokenizer — Negative", () => {
  it("empty piiMap returns text unchanged", () => {
    const piiMap = createPiiMap();
    const original = "The answer is 42.";
    expect(unmaskText(original, piiMap)).toBe(original);
  });

  it("unknown token left as-is without crash", () => {
    const piiMap = createPiiMap();
    const text = "Result for STUDENT_FFFF was great.";
    const result = unmaskText(text, piiMap);
    expect(result).toBe(text);
  });

  it("null value in piiMap handled gracefully", () => {
    const piiMap = createPiiMap();
    piiMap.tokenToValue.set("STUDENT_NULL", null as any);
    const text = "Student STUDENT_NULL submitted work.";
    expect(() => unmaskText(text, piiMap)).not.toThrow();
  });

  it("discardPiiMap clears all entries", () => {
    const piiMap = createPiiMap();
    const matches: PiiMatch[] = [
      { type: "STUDENT_NAME", value: "Test Name", start: 0, end: 9 },
    ];
    maskText("Test Name here", matches, piiMap);
    expect(piiMap.tokenToValue.size).toBeGreaterThan(0);
    discardPiiMap(piiMap);
    expect(piiMap.tokenToValue.size).toBe(0);
    expect(piiMap.valueToToken.size).toBe(0);
  });
});
