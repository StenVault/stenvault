/**
 * Shared localStorage keys for the Trusted Circle recovery surfaces.
 *
 * `RECOVERY_REMINDER_DISMISSED_AT_KEY` is WRITTEN by two surfaces and READ
 * by one, so it has to be a single source of truth:
 *
 *   - `TrustedCircleNudge` writes it on dismissal to silence the Home
 *     reminder for the full 7-day snooze window (one visible ping per
 *     dismissal, not two).
 *   - `RecoverySetupReminder` writes it when the user taps the X on the
 *     Home card (the standard 7-day snooze) and reads it on render to
 *     decide whether to show.
 *
 * If either side renamed the string literal without the other, the snooze
 * would silently stop working. Keeping the constant here makes that a
 * compile error instead of a UX regression.
 */

export const RECOVERY_REMINDER_DISMISSED_AT_KEY = 'stenvault-recovery-reminder-dismissed-at';

export const RECOVERY_REMINDER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
