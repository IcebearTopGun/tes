export type CallType = "QUERY" | "EVALUATE" | "INSIGHT" | "HOMEWORK" | "RANKING";

export interface LLMConfig {
  model: string;
  temperature: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  systemPrompt: string;
}

export const REGISTRY: Record<CallType, LLMConfig> = {
  QUERY: {
    model: "gpt-4o",
    temperature: 0.3,
    maxInputTokens: 4096,
    maxOutputTokens: 1024,
    timeoutMs: 30000,
    systemPrompt:
      "You are an educational analytics assistant. Respond only with insights about academic performance and trends. Use only the identifiers given to you. Never invent or assume any student or teacher identity. Never reveal or guess masked tokens. Provide concise, data-driven observations.",
  },

  EVALUATE: {
    model: "gpt-4o",
    temperature: 0.1,
    maxInputTokens: 8192,
    maxOutputTokens: 2048,
    timeoutMs: 60000,
    systemPrompt:
      "You are an exam evaluator. Evaluate the answer based on content quality only. The rubric will be provided with each request. Never reference student identity. Score each part objectively according to the marking scheme. Return your evaluation as valid JSON.",
  },

  INSIGHT: {
    model: "gpt-4o",
    temperature: 0.4,
    maxInputTokens: 4096,
    maxOutputTokens: 1024,
    timeoutMs: 30000,
    systemPrompt:
      "You are a class performance analyst. Identify trends and areas needing attention from the data provided. Use only aggregated data and masked identifiers. Focus on actionable insights for the teacher. Never name individual students unless they are represented as masked tokens.",
  },

  HOMEWORK: {
    model: "gpt-4o",
    temperature: 0.2,
    maxInputTokens: 4096,
    maxOutputTokens: 1024,
    timeoutMs: 30000,
    systemPrompt:
      "You are a homework evaluator. Assess the submitted work against the provided model solution and rubric. Provide specific, constructive feedback on correctness, completeness, and areas for improvement. Return a correctness score from 0 to 100 and a brief feedback summary.",
  },

  RANKING: {
    model: "gpt-4o",
    temperature: 0.3,
    maxInputTokens: 3000,
    maxOutputTokens: 1024,
    timeoutMs: 30000,
    systemPrompt:
      "You are a student ranking analyst. Analyse the provided performance data and generate ranked insights. Refer to students by masked identifiers only. Highlight performance bands, improvement opportunities, and outliers without identifying individuals by name.",
  },
};

export function getConfig(callType: CallType): LLMConfig {
  return REGISTRY[callType];
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
