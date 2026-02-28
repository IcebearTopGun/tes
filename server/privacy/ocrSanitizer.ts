import { detectPii, injectNameCacheForTesting } from "./piiDetector";
import { maskText, createPiiMap, type PiiMap } from "./tokenizer";

export { injectNameCacheForTesting };

const IDENTITY_PHRASE_PATTERNS = [
  /\bmy\s+name\s+is\s+[A-Za-z ]{2,40}/gi,
  /\bi\s+am\s+[A-Za-z]{2,40}\b/gi,
  /\broll\s*(?:no|number|#)?[\s:.\-]*[A-Z0-9]{1,10}/gi,
  /\badm(?:ission)?\s*(?:no|number|#)?[\s:.\-]*[A-Z0-9]{3,10}/gi,
  /\bclass\s+\d+[A-Za-z]?\b/gi,
  /\bstd(?:andard)?\s*\d+[A-Za-z]?\b/gi,
  /\bsection\s+[A-Za-z]\b/gi,
  /\bchecked\s+by\s+[A-Za-z .]{2,40}/gi,
  /\bverified\s+by\s+[A-Za-z .]{2,40}/gi,
  /\bsubmitted\s+by\s+[A-Za-z .]{2,40}/gi,
];

const PLACEHOLDER = "[STUDENT_IDENTIFIER]";

function stripIdentityPhrases(text: string): string {
  let result = text;
  for (const pattern of IDENTITY_PHRASE_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    re.lastIndex = 0;
    result = result.replace(re, PLACEHOLDER);
  }
  return result;
}

export async function sanitizeOcrText(
  ocrText: string,
  piiMap: PiiMap
): Promise<string> {
  if (!ocrText || ocrText.trim().length === 0) return "";

  let sanitized = stripIdentityPhrases(ocrText);

  const piiMatches = await detectPii(sanitized.replace(/\[STUDENT_IDENTIFIER\]/g, ""));
  if (piiMatches.length > 0) {
    const adjusted = sanitized.replace(/\[STUDENT_IDENTIFIER\]/g, "\x00".repeat(PLACEHOLDER.length));
    const maskedSection = maskText(adjusted, piiMatches, piiMap);
    sanitized = maskedSection.replace(/\x00+/g, PLACEHOLDER);
  }

  return sanitized;
}
