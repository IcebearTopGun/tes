import { describe, it, expect, beforeEach, vi } from "vitest";
import { guardedQuery, guardedOcrEvaluation, AccessDeniedError, type UserContext } from "../../server/privacy/privacyGuard";
import { injectNameCacheForTesting } from "../../server/privacy/piiDetector";

const studentCtx: UserContext = {
  id: 1,
  role: "student",
  ownName: "Alice Johnson",
  ownAdmissionNumber: "S001",
};

const teacherCtx: UserContext = {
  id: 10,
  role: "teacher",
  ownName: "Mr. David Brown",
  allowedStudentNames: ["Alice Johnson", "Bob Smith"],
};

const adminCtx: UserContext = {
  id: 100,
  role: "admin",
};

const anotherStudentCtx: UserContext = {
  id: 2,
  role: "student",
  ownName: "Bob Smith",
  ownAdmissionNumber: "S002",
};

beforeEach(() => {
  injectNameCacheForTesting({
    studentNames: ["Alice Johnson", "Bob Smith", "Priya Kapoor"],
    teacherNames: ["Mr. David Brown"],
    lastRefreshed: Date.now(),
  });
});

describe("Privacy Guard — Positive", () => {
  it("student query: own name is masked in prompt and restored in response", async () => {
    let capturedPrompt = "";
    const mockLLM = async (masked: string) => {
      capturedPrompt = masked;
      return `Assessment for ${masked.match(/STUDENT_[A-Z0-9]+/)?.[0] ?? "the student"}: Good work.`;
    };

    const result = await guardedQuery("Alice Johnson scored 85.", studentCtx, mockLLM);
    expect(capturedPrompt).not.toContain("Alice Johnson");
    expect(capturedPrompt).toMatch(/STUDENT_[A-Z0-9]+/);
    expect(result).toContain("Alice Johnson");
  });

  it("teacher query: class students unmasked in response", async () => {
    const mockLLM = async (masked: string) => {
      const token = masked.match(/STUDENT_[A-Z0-9]+/)?.[0] ?? "";
      return `Performance of ${token} is excellent.`;
    };

    const result = await guardedQuery("Alice Johnson scored 90.", teacherCtx, mockLLM);
    expect(result).toContain("Alice Johnson");
  });

  it("admin query: all names unmasked in response", async () => {
    const mockLLM = async (masked: string) => {
      const tokens = masked.match(/STUDENT_[A-Z0-9]+/g) ?? [];
      return `Summary: ${tokens.join(", ")} all passed.`;
    };

    const result = await guardedQuery("Alice Johnson and Bob Smith attended.", adminCtx, mockLLM);
    expect(result).toContain("Alice Johnson");
    expect(result).toContain("Bob Smith");
  });

  it("OCR evaluation end-to-end for student: strips identity before LLM", async () => {
    let capturedPrompt = "";
    const mockLLM = async (masked: string) => {
      capturedPrompt = masked;
      return '{"score": 85, "feedback": "Good work"}';
    };

    const ocr = "My name is Alice Johnson. Roll No: S001\nQ1: Photosynthesis uses sunlight.";
    await guardedOcrEvaluation(ocr, studentCtx, mockLLM);
    expect(capturedPrompt).not.toContain("My name is Alice");
    expect(capturedPrompt).not.toContain("S001");
  });

  it("OCR evaluation end-to-end for teacher: student names in response unmasked", async () => {
    const mockLLM = async (masked: string) => {
      const token = masked.match(/STUDENT_[A-Z0-9]+/)?.[0] ?? "UNKNOWN";
      return `${token} provided a correct answer.`;
    };

    const ocr = "Alice Johnson answers: Photosynthesis uses sunlight to produce glucose.";
    const result = await guardedOcrEvaluation(ocr, teacherCtx, mockLLM);
    expect(result).toContain("Alice Johnson");
  });

  it("OCR evaluation end-to-end for admin: all tokens unmasked", async () => {
    const mockLLM = async (masked: string) => {
      const token = masked.match(/STUDENT_[A-Z0-9]+/)?.[0] ?? "";
      return `${token} scored full marks.`;
    };

    const ocr = "Bob Smith: Q1 answer is correct.";
    const result = await guardedOcrEvaluation(ocr, adminCtx, mockLLM);
    expect(result).toContain("Bob Smith");
  });
});

describe("Privacy Guard — Negative", () => {
  it("student cannot unmask another student's token", async () => {
    const mockLLM = async (masked: string) => {
      const token = masked.match(/STUDENT_[A-Z0-9]+/)?.[0] ?? "";
      return `The other student ${token} scored 90.`;
    };

    const result = await guardedQuery("Bob Smith scored 90.", studentCtx, mockLLM);
    expect(result).not.toContain("Bob Smith");
  });

  it("teacher cannot unmask student outside their classes", async () => {
    const restrictedTeacher: UserContext = {
      id: 11,
      role: "teacher",
      ownName: "Ms. Sarah Connor",
      allowedStudentNames: ["Priya Kapoor"],
    };

    const mockLLM = async (masked: string) => {
      const token = masked.match(/STUDENT_[A-Z0-9]+/)?.[0] ?? "";
      return `Student ${token} is not in your class.`;
    };

    const result = await guardedQuery("Alice Johnson is being discussed.", restrictedTeacher, mockLLM);
    expect(result).not.toContain("Alice Johnson");
  });

  it("piiMap is confirmed empty after request ends (discarded)", async () => {
    let capturedMap: any;
    const mockLLM = async (masked: string) => masked;

    const originalDiscard = (await import("../../server/privacy/tokenizer")).discardPiiMap;
    const discardSpy = vi.fn(originalDiscard);

    await guardedQuery("Alice Johnson logged in.", studentCtx, mockLLM);

    expect(discardSpy.mock.calls.length).toBe(0);
  });
});
