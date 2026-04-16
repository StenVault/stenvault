/**
 * Error classification for Send upload failures.
 * Maps raw errors to user-facing messages and machine-readable kinds.
 */

export type SendErrorKind = "aborted" | "expired" | "network" | "fatal" | "quota" | "unknown";

export interface ClassifiedSendError {
  kind: SendErrorKind;
  userMessage: string;
}

export function classifySendError(err: unknown): ClassifiedSendError {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const code = (err as { data?: { code?: string } } | null | undefined)?.data?.code;

  if (message === "Upload cancelled") {
    return { kind: "aborted", userMessage: "" };
  }
  if (message === "PRESIGNED_EXPIRED") {
    return {
      kind: "expired",
      userMessage: "Upload session expired. Please try again.",
    };
  }
  if (message.startsWith("R2_UPLOAD_FATAL:")) {
    const s3Code = message.slice("R2_UPLOAD_FATAL:".length);
    return {
      kind: "fatal",
      userMessage: `Upload rejected by storage (${s3Code}). Please refresh and try again.`,
    };
  }
  if (message.includes("network error") || message.includes("Failed to fetch")) {
    return {
      kind: "network",
      userMessage: "Network interrupted. Check your connection and try again.",
    };
  }
  if (code === "TOO_MANY_REQUESTS" || message.toLowerCase().includes("rate limit")) {
    return {
      kind: "quota",
      userMessage: "You've hit the rate limit. Please wait a moment and try again.",
    };
  }
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return {
      kind: "fatal",
      userMessage: "Access denied by the server. Please refresh the page.",
    };
  }
  return {
    kind: "unknown",
    userMessage: message || "Something went wrong uploading the file.",
  };
}
