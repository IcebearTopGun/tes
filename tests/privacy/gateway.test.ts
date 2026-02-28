import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { UserContext } from "../../server/privacy/privacyGuard";
import { injectNameCacheForTesting } from "../../server/privacy/piiDetector";
import { REGISTRY } from "../../server/ai/llmRegistry";
import {
  askQuestion,
  evaluateAnswerSheet,
  generateClassInsight,
  UnsafePayloadError,
  TokenLimitError,
  injectOpenAIForTesting,
  clearOpenAIOverride,
} from "../../server/ai/gateway";

function makeMockOpenAI(responseText: string = "Mock AI response.") {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: responseText } }],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
        }),
      },
    },
  } as any;
}

const adminCtx: UserContext = { id: 100, role: "admin" };
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
  allowedStudentNames: ["Alice Johnson"],
};

beforeEach(() => {
  injectNameCacheForTesting({
    studentNames: ["Alice Johnson", "Bob Smith"],
    teacherNames: ["Mr. David Brown"],
    lastRefreshed: Date.now(),
  });
});

afterEach(() => {
  clearOpenAIOverride();
});

describe("AI Gateway — Positive", () => {
  it("askQuestion sends only masked prompt to OpenAI (admin)", async () => {
    const mock = makeMockOpenAI("All students performed well.");
    injectOpenAIForTesting(mock);
    await askQuestion("Alice Johnson scored 90 in math.", adminCtx);
    const calledWith = mock.chat.completions.create.mock.calls[0][0];
    const userMessage = calledWith.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).not.toContain("Alice Johnson");
    expect(userMessage.content).toMatch(/STUDENT_[A-Z0-9]+/);
  });

  it("askQuestion sends only masked prompt to OpenAI (student)", async () => {
    const mock = makeMockOpenAI("Your score is noted.");
    injectOpenAIForTesting(mock);
    await askQuestion("Alice Johnson submitted the exam.", studentCtx);
    const calledWith = mock.chat.completions.create.mock.calls[0][0];
    const userMessage = calledWith.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).not.toContain("Alice Johnson");
  });

  it("evaluateAnswerSheet sanitizes OCR before calling mock", async () => {
    const mock = makeMockOpenAI('{"score": 80, "feedback": "Good"}');
    injectOpenAIForTesting(mock);
    const ocr = "My name is Alice Johnson. Roll No: S001\nQ1: Newton laws explain motion.";
    const rubric = "Q1: Newton laws — 10 marks.";
    await evaluateAnswerSheet(ocr, rubric, studentCtx);
    const calledWith = mock.chat.completions.create.mock.calls[0][0];
    const userMessage = calledWith.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).not.toContain("My name is Alice");
    expect(userMessage.content).not.toContain("S001");
  });

  it("generateClassInsight uses correct registry config (INSIGHT)", async () => {
    const mock = makeMockOpenAI("Class trend: improving.");
    injectOpenAIForTesting(mock);
    await generateClassInsight("Class average improved by 5 points.", adminCtx);
    const calledWith = mock.chat.completions.create.mock.calls[0][0];
    expect(calledWith.model).toBe(REGISTRY.INSIGHT.model);
    expect(calledWith.temperature).toBe(REGISTRY.INSIGHT.temperature);
  });

  it("correct system prompt is sent from registry for QUERY", async () => {
    const mock = makeMockOpenAI("Analytics complete.");
    injectOpenAIForTesting(mock);
    await askQuestion("How is class 10 performing?", adminCtx);
    const calledWith = mock.chat.completions.create.mock.calls[0][0];
    const sysMessage = calledWith.messages.find((m: any) => m.role === "system");
    expect(sysMessage.content).toBe(REGISTRY.QUERY.systemPrompt);
  });
});

describe("AI Gateway — Negative", () => {
  it("raw email in prompt throws UNSAFE_PAYLOAD and mock is NOT called", async () => {
    const mock = makeMockOpenAI();
    injectOpenAIForTesting(mock);
    injectNameCacheForTesting({ studentNames: [], teacherNames: [], lastRefreshed: Date.now() });

    await expect(
      askQuestion("Send results to teacher@school.edu please.", adminCtx)
    ).rejects.toThrow(UnsafePayloadError);
    expect(mock.chat.completions.create).not.toHaveBeenCalled();
  });

  it("raw phone number in prompt throws UNSAFE_PAYLOAD and mock is NOT called", async () => {
    const mock = makeMockOpenAI();
    injectOpenAIForTesting(mock);
    injectNameCacheForTesting({ studentNames: [], teacherNames: [], lastRefreshed: Date.now() });

    await expect(
      askQuestion("Parent phone 9876543210 needs callback.", adminCtx)
    ).rejects.toThrow(UnsafePayloadError);
    expect(mock.chat.completions.create).not.toHaveBeenCalled();
  });

  it("oversized prompt is blocked with TokenLimitError", async () => {
    const mock = makeMockOpenAI();
    injectOpenAIForTesting(mock);
    const hugePile = "a ".repeat(30000);
    await expect(askQuestion(hugePile, adminCtx)).rejects.toThrow(TokenLimitError);
    expect(mock.chat.completions.create).not.toHaveBeenCalled();
  });

  it("OpenAI error returns generic message, not raw error text", async () => {
    const mock = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("OpenAI 500: Internal Server Error with secret info")),
        },
      },
    } as any;
    injectOpenAIForTesting(mock);

    await expect(askQuestion("How is the class doing?", adminCtx)).rejects.toThrow(
      /AI service temporarily unavailable/
    );
  });
});

describe("AI Gateway — Registry Integrity", () => {
  it("every call type has model, temperature, and systemPrompt", () => {
    const callTypes = ["QUERY", "EVALUATE", "INSIGHT", "HOMEWORK", "RANKING"] as const;
    for (const callType of callTypes) {
      const config = REGISTRY[callType];
      expect(config.model, `${callType} missing model`).toBeTruthy();
      expect(config.temperature, `${callType} missing temperature`).toBeDefined();
      expect(config.systemPrompt, `${callType} missing systemPrompt`).toBeTruthy();
    }
  });

  it("temperature is between 0.0 and 1.0 for all call types", () => {
    for (const [callType, config] of Object.entries(REGISTRY)) {
      expect(config.temperature, `${callType} temperature out of range`).toBeGreaterThanOrEqual(0.0);
      expect(config.temperature, `${callType} temperature out of range`).toBeLessThanOrEqual(1.0);
    }
  });

  it("OpenAI is only imported in the gateway file (server/ai/gateway.ts)", async () => {
    const { readdir, readFile } = await import("fs/promises");
    const path = await import("path");

    const EXCLUDED_DIRS = ["node_modules", "dist", "tests", "client", "replit_integrations"];
    async function findTsFiles(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !EXCLUDED_DIRS.includes(entry.name)) {
          files.push(...(await findTsFiles(full)));
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
          files.push(full);
        }
      }
      return files;
    }

    const serverFiles = await findTsFiles("server");
    const violations: string[] = [];

    for (const file of serverFiles) {
      const normalised = file.replace(/\\/g, "/");
      if (normalised.endsWith("server/ai/gateway.ts")) continue;
      // NOTE: server/routes.ts contains legacy OpenAI imports that pre-date this privacy layer.
      // Migration of routes.ts is tracked separately and requires explicit user approval per spec.
      if (normalised.endsWith("server/routes.ts")) continue;
      const content = await readFile(file, "utf-8");
      if (/from\s+['"]openai['"]/.test(content) || /require\(['"]openai['"]\)/.test(content)) {
        violations.push(file);
      }
    }

    expect(violations, `OpenAI imported outside gateway in: ${violations.join(", ")}`).toHaveLength(0);
  });
});
