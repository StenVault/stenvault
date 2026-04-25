/**
 * Audit history — typed accessor for the audit log shown in
 * Settings > Encryption > Whitepaper & audits.
 *
 * Source of truth is `audits.json` so non-engineering can add an entry
 * after a third-party review without touching code. The JSON is bundled
 * at build time — no runtime fetch — so the page stays available even if
 * the API is unavailable.
 *
 * Public — never list anything here that the auditor or StenVault hasn't
 * agreed to publish. Empty list is a legitimate state ("first audit
 * pending") for early-stage products.
 */

import auditsJson from './audits.json';

export interface AuditEntry {
    /** ISO-8601 date the report was published. */
    date: string;
    /** Auditing party — firm name or independent reviewer's name. */
    party: string;
    /** Scope summary, one short sentence. */
    scope: string;
    /** Public link to the report. Optional — null if the report is private. */
    reportUrl: string | null;
    /** Outcome bucket the user can scan in the list. */
    status: 'passed' | 'passed-with-findings' | 'in-progress';
}

interface AuditsFile {
    audits: AuditEntry[];
}

const data = auditsJson as AuditsFile;

export function getAudits(): readonly AuditEntry[] {
    return data.audits;
}
