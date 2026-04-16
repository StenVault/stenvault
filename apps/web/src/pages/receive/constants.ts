export const ABUSE_REASON_LABELS: Record<string, string> = {
  malware: "Malware / Virus",
  phishing: "Phishing / Scam",
  illegal_content: "Illegal content",
  copyright: "Copyright violation",
  other: "Other",
};

/** Max file size for Save to Vault (100MB) — avoids holding huge files in memory */
export const SAVE_TO_VAULT_MAX_SIZE = 100 * 1024 * 1024;

export function getContextualError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('quota') || lower.includes('storage'))
    return 'Storage full \u2014 free up space or upgrade your plan';
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch'))
    return 'Connection lost \u2014 check your internet and try again';
  if (lower.includes('expired') || lower.includes('404') || lower.includes('not found'))
    return 'This link has expired or been removed';
  return msg;
}
