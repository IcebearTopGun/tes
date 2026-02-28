import crypto from "crypto";
import type { PiiMatch } from "./piiDetector";

const TYPE_PREFIX: Record<string, string> = {
  STUDENT_NAME: "STUDENT",
  TEACHER_NAME: "TEACHER",
  EMAIL: "EMAIL",
  PHONE: "PHONE",
  ROLL_NUMBER: "ROLL",
};

function getSecret(): string {
  const s = process.env.PII_TOKEN_SECRET;
  if (!s || s.length < 32) {
    return "dev-pii-secret-minimum-32-chars!!";
  }
  return s;
}

export function generateToken(type: string, value: string): string {
  const prefix = TYPE_PREFIX[type] ?? type;
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(value.toLowerCase().trim());
  const digest = hmac.digest("hex").slice(0, 4).toUpperCase();
  return `${prefix}_${digest}`;
}

export interface PiiMap {
  tokenToValue: Map<string, string>;
  valueToToken: Map<string, string>;
}

export function createPiiMap(): PiiMap {
  return { tokenToValue: new Map(), valueToToken: new Map() };
}

export function maskText(text: string, matches: PiiMatch[], piiMap: PiiMap): string {
  if (matches.length === 0) return text;

  const sorted = [...matches].sort((a, b) => b.start - a.start);
  let result = text;

  for (const match of sorted) {
    const normalizedValue = match.value.toLowerCase().trim();
    let token: string;

    if (piiMap.valueToToken.has(normalizedValue)) {
      token = piiMap.valueToToken.get(normalizedValue)!;
    } else {
      token = generateToken(match.type, match.value);
      let uniqueToken = token;
      let counter = 0;
      while (piiMap.tokenToValue.has(uniqueToken) && piiMap.tokenToValue.get(uniqueToken) !== match.value) {
        counter++;
        uniqueToken = `${token}${counter}`;
      }
      token = uniqueToken;
      piiMap.tokenToValue.set(token, match.value);
      piiMap.valueToToken.set(normalizedValue, token);
    }

    result = result.slice(0, match.start) + token + result.slice(match.end);
  }

  return result;
}

export function unmaskText(
  text: string,
  piiMap: PiiMap,
  allowedTokens?: Set<string>
): string {
  if (!text || piiMap.tokenToValue.size === 0) return text;

  return text.replace(/\b(STUDENT|TEACHER|EMAIL|PHONE|ROLL)_[A-Z0-9]{4,8}\b/g, (token) => {
    if (!piiMap.tokenToValue.has(token)) return token;
    if (allowedTokens && !allowedTokens.has(token)) return token;
    return piiMap.tokenToValue.get(token)!;
  });
}

export function discardPiiMap(piiMap: PiiMap): void {
  piiMap.tokenToValue.clear();
  piiMap.valueToToken.clear();
}
