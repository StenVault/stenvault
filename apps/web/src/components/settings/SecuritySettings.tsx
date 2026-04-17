import { EmailVerificationSection } from "./EmailVerificationSection";
import { MfaSection } from "./MfaSection";
import { PasskeysSection } from "./PasskeysSection";
import { PasswordChangeSection } from "./PasswordChangeSection";
import { VaultTimeoutSection } from "./VaultTimeoutSection";
import { SessionHistorySection } from "./SessionHistorySection";
import { RecoveryCodesSection } from "./RecoveryCodesSection";
import { TrustedContactsSection } from "./TrustedContactsSection";
import { ShamirRecoverySection } from "./ShamirRecoverySection";
import { SignatureKeysSection } from "./SignatureKeysSection";

export function SecuritySettings() {
    return (
        <div className="space-y-6">
            <EmailVerificationSection />
            <MfaSection />
            <PasskeysSection />
            <PasswordChangeSection />
            <VaultTimeoutSection />
            <SessionHistorySection />
            <RecoveryCodesSection />
            <TrustedContactsSection />
            <ShamirRecoverySection />
            <SignatureKeysSection />
        </div>
    );
}
