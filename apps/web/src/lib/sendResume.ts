/**
 * Resume-state persistence for Send uploads.
 * Pure sessionStorage helpers — no React dependency.
 */

const RESUME_PREFIX = "send:resume:";

export interface ResumeState {
  sessionId: string;
  completedParts: Array<{ partNumber: number; etag: string }>;
  fragment: string;
  totalParts: number;
  fileSize: number;
}

/** Write rhythm for resume checkpoints — 1 in N part completions. */
export const RESUME_WRITE_STRIDE = 5;
/** Cap on completedParts we persist once we hit QuotaExceededError. */
const RESUME_TAIL_CAP = 200;

export function getResumeKey(sessionId: string): string {
  return RESUME_PREFIX + sessionId;
}

export function findResumeState(): ResumeState | null {
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(RESUME_PREFIX)) {
      try {
        return JSON.parse(sessionStorage.getItem(key)!) as ResumeState;
      } catch {
        sessionStorage.removeItem(key);
      }
    }
  }
  return null;
}

/**
 * Persist upload progress to sessionStorage without letting a storage quota
 * error kill the upload. On QuotaExceededError, we retry with only the tail
 * of completedParts; on a second failure we give up persisting resume state
 * entirely for this upload and return `false` so the caller can stop trying.
 */
export function persistResumeState(
  key: string,
  state: ResumeState,
): boolean {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch (err) {
    if (!(err instanceof Error) || err.name !== "QuotaExceededError") throw err;
    try {
      const trimmed: ResumeState = {
        ...state,
        completedParts: state.completedParts.slice(-RESUME_TAIL_CAP),
      };
      sessionStorage.setItem(key, JSON.stringify(trimmed));
      return true;
    } catch {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* storage is fully broken — nothing more we can do here */
      }
      console.warn("[send] sessionStorage quota exceeded — resume state disabled for this upload");
      return false;
    }
  }
}
