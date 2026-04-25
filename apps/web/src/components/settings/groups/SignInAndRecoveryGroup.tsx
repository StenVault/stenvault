/**
 * SignInAndRecoveryGroup — auth hub (I10).
 *
 * Owns every section that gates *getting back into the account*: email
 * verification, the sign-in password, passkeys, MFA, active sessions,
 * trusted devices, and the recovery codes that bypass the password.
 *
 * Sections are rendered as-is from their existing files — Phase 4 only
 * regroups; section internals (OPAQUE/TOTP/WebAuthn flows) are unchanged.
 */

import { EmailVerificationSection } from '../EmailVerificationSection';
import { PasswordChangeSection } from '../PasswordChangeSection';
import { PasskeysSection } from '../PasskeysSection';
import { MfaSection } from '../MfaSection';
import { SessionHistorySection } from '../SessionHistorySection';
import { TrustedDevicesSettings } from '../TrustedDevicesSettings';
import { RecoveryCodesSection } from '../RecoveryCodesSection';

export function SignInAndRecoveryGroup() {
    return (
        <div className="space-y-6">
            <EmailVerificationSection />
            <PasswordChangeSection />
            <PasskeysSection />
            <MfaSection />
            <SessionHistorySection />
            <TrustedDevicesSettings />
            <RecoveryCodesSection />
        </div>
    );
}
