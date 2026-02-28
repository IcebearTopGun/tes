import { detectPii } from "./piiDetector";
import { maskText, unmaskText, createPiiMap, discardPiiMap, type PiiMap } from "./tokenizer";
import { sanitizeOcrText } from "./ocrSanitizer";

export class AccessDeniedError extends Error {
  constructor(message = "ACCESS_DENIED: insufficient role for this data") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export interface UserContext {
  id: number;
  role: "student" | "teacher" | "admin";
  ownName?: string;
  ownAdmissionNumber?: string;
  allowedStudentNames?: string[];
  assignedClassIds?: string[];
}

export type LLMCaller = (maskedPrompt: string) => Promise<string>;

function buildAllowedTokens(piiMap: PiiMap, userContext: UserContext): Set<string> | undefined {
  if (userContext.role === "admin") return undefined;

  const allowedValues = new Set<string>();

  if (userContext.role === "student") {
    if (userContext.ownName) allowedValues.add(userContext.ownName.toLowerCase().trim());
    if (userContext.ownAdmissionNumber) allowedValues.add(userContext.ownAdmissionNumber.toLowerCase().trim());
  }

  if (userContext.role === "teacher") {
    for (const name of userContext.allowedStudentNames ?? []) {
      allowedValues.add(name.toLowerCase().trim());
    }
    if (userContext.ownName) allowedValues.add(userContext.ownName.toLowerCase().trim());
  }

  const allowedTokens = new Set<string>();
  for (const [token, originalValue] of piiMap.tokenToValue.entries()) {
    if (allowedValues.has(originalValue.toLowerCase().trim())) {
      allowedTokens.add(token);
    }
  }
  return allowedTokens;
}

export async function guardedQuery(
  prompt: string,
  userContext: UserContext,
  llmCaller: LLMCaller
): Promise<string> {
  const piiMap = createPiiMap();
  try {
    const matches = await detectPii(prompt);
    const maskedPrompt = maskText(prompt, matches, piiMap);

    const rawResponse = await llmCaller(maskedPrompt);

    const allowedTokens = buildAllowedTokens(piiMap, userContext);
    if (allowedTokens !== undefined && allowedTokens.size === 0 && piiMap.tokenToValue.size > 0) {
      const hasTokensInResponse = /\b(STUDENT|TEACHER|EMAIL|PHONE|ROLL)_[A-Z0-9]{4,8}\b/.test(rawResponse);
      if (hasTokensInResponse) {
        return rawResponse;
      }
    }

    return unmaskText(rawResponse, piiMap, allowedTokens);
  } finally {
    discardPiiMap(piiMap);
  }
}

export async function guardedOcrEvaluation(
  ocrText: string,
  userContext: UserContext,
  llmCaller: LLMCaller
): Promise<string> {
  const piiMap = createPiiMap();
  try {
    const sanitized = await sanitizeOcrText(ocrText, piiMap);

    const additionalMatches = await detectPii(sanitized);
    const maskedOcr = maskText(sanitized, additionalMatches, piiMap);

    const rawResponse = await llmCaller(maskedOcr);

    const allowedTokens = buildAllowedTokens(piiMap, userContext);
    return unmaskText(rawResponse, piiMap, allowedTokens);
  } finally {
    discardPiiMap(piiMap);
  }
}
