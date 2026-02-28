import OpenAI from "openai";
import { randomUUID } from "crypto";
import { REGISTRY, getConfig, estimateTokens, type CallType } from "./llmRegistry";
import { guardedQuery, guardedOcrEvaluation, type UserContext } from "../privacy/privacyGuard";

export class UnsafePayloadError extends Error {
  constructor(message = "UNSAFE_PAYLOAD: prompt contains unmasked PII") {
    super(message);
    this.name = "UnsafePayloadError";
  }
}

export class TokenLimitError extends Error {
  constructor(limit: number, actual: number) {
    super(`TOKEN_LIMIT_EXCEEDED: prompt uses ~${actual} tokens, limit is ${limit}`);
    this.name = "TokenLimitError";
  }
}

const FINAL_SWEEP_PATTERNS = [
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
  /(?<!\d)(?:\+91[-\s]?)?[6-9][0-9]{9}(?!\d)/,
];

function finalSweep(text: string): void {
  for (const pattern of FINAL_SWEEP_PATTERNS) {
    if (pattern.test(text)) {
      throw new UnsafePayloadError();
    }
  }
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey, baseURL });
}

function auditLog(entry: {
  requestId: string;
  timestamp: string;
  callType: CallType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}): void {
  console.log("[AI-AUDIT]", JSON.stringify(entry));
}

async function callLLM(
  callType: CallType,
  maskedPrompt: string,
  openaiOverride?: OpenAI
): Promise<string> {
  const config = getConfig(callType);
  const estimatedTokens = estimateTokens(maskedPrompt);

  if (estimatedTokens > config.maxInputTokens) {
    throw new TokenLimitError(config.maxInputTokens, estimatedTokens);
  }

  const client = openaiOverride ?? getOpenAIClient();
  const requestId = randomUUID();
  const startMs = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxOutputTokens,
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: maskedPrompt },
      ],
    });

    const latencyMs = Date.now() - startMs;
    auditLog({
      requestId,
      timestamp: new Date().toISOString(),
      callType,
      model: config.model,
      inputTokens: response.usage?.prompt_tokens ?? estimatedTokens,
      outputTokens: response.usage?.completion_tokens ?? 0,
      latencyMs,
    });

    return response.choices[0]?.message?.content ?? "";
  } catch (err: any) {
    const latencyMs = Date.now() - startMs;
    auditLog({
      requestId,
      timestamp: new Date().toISOString(),
      callType,
      model: config.model,
      inputTokens: estimatedTokens,
      outputTokens: 0,
      latencyMs,
    });
    if (err instanceof UnsafePayloadError || err instanceof TokenLimitError) throw err;
    throw new Error("AI service temporarily unavailable. Please try again.");
  }
}

let _openaiOverride: OpenAI | undefined;
export function injectOpenAIForTesting(client: OpenAI): void {
  _openaiOverride = client;
}
export function clearOpenAIOverride(): void {
  _openaiOverride = undefined;
}

export async function askQuestion(
  prompt: string,
  userContext: UserContext
): Promise<string> {
  finalSweep(prompt);
  const estimatedTokens = estimateTokens(prompt);
  if (estimatedTokens > REGISTRY.QUERY.maxInputTokens) {
    throw new TokenLimitError(REGISTRY.QUERY.maxInputTokens, estimatedTokens);
  }
  return guardedQuery(prompt, userContext, (masked) =>
    callLLM("QUERY", masked, _openaiOverride)
  );
}

export async function evaluateAnswerSheet(
  ocrText: string,
  rubric: string,
  userContext: UserContext
): Promise<string> {
  const combined = `RUBRIC:\n${rubric}\n\nANSWER:\n${ocrText}`;
  return guardedOcrEvaluation(combined, userContext, (masked) =>
    callLLM("EVALUATE", masked, _openaiOverride)
  );
}

export async function generateClassInsight(
  analyticsData: string,
  userContext: UserContext
): Promise<string> {
  finalSweep(analyticsData);
  return guardedQuery(analyticsData, userContext, (masked) =>
    callLLM("INSIGHT", masked, _openaiOverride)
  );
}

export async function analyseHomework(
  homeworkData: string,
  userContext: UserContext
): Promise<string> {
  finalSweep(homeworkData);
  return guardedQuery(homeworkData, userContext, (masked) =>
    callLLM("HOMEWORK", masked, _openaiOverride)
  );
}

export async function generateRankingInsight(
  rankingData: string,
  userContext: UserContext
): Promise<string> {
  finalSweep(rankingData);
  return guardedQuery(rankingData, userContext, (masked) =>
    callLLM("RANKING", masked, _openaiOverride)
  );
}
