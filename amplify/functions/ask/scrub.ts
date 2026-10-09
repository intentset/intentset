/**
 * Best-effort scrubbing of a question or answer before it is stored (RULE-ASK-RETENTION): email addresses, phone
 * numbers and strings that look like keys or tokens are replaced with a label. It cannot catch everything, which the
 * privacy page says; it never runs on what the model is sent, only on what is kept.
 */
const patterns: Array<[RegExp, string]> = [
  // Email addresses.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  // Keys and tokens: AWS access key ids, sk-/pk- style keys, GitHub tokens, JWTs, and long runs of key-like characters.
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[key]"],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, "[key]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[key]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[key]"],
  [/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}/g, "[key]"],
  // Phone numbers: seven or more digits, allowing spaces, dots, dashes, brackets and a leading plus.
  [/(?<![\w-])\+?\d[\d\s().-]{5,}\d(?![\w-])/g, "[phone]"],
];

export function scrub(text: string): string {
  let out = text;
  for (const [pattern, label] of patterns) {
    out = out.replace(pattern, (match) => (label === "[phone]" && digits(match) < 7 ? match : label));
  }
  return out;
}

function digits(text: string): number {
  return (text.match(/\d/g) ?? []).length;
}
