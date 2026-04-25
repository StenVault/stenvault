/**
 * EncryptionGroup — vault crypto controls (I11).
 *
 * Owns everything about the cryptographic substrate the vault runs on:
 * the Encryption Password that derives the KEK, the inactivity timeout
 * that re-locks the master key, the Trusted Circle (Shamir) recovery
 * setup, the trusted contacts inbound to other users' Trusted Circles,
 * and the hybrid signature keys.
 *
 * Two stub sections (EncryptionDetails, WhitepaperAndAudit) land here
 * for Phase 5 to fill — they're StenVault's transparency differentiator.
 */

import { EncryptionPasswordSection } from '../EncryptionPasswordSection';
import { VaultTimeoutSection } from '../VaultTimeoutSection';
import { ShamirRecoverySection } from '../ShamirRecoverySection';
import { TrustedContactsSection } from '../TrustedContactsSection';
import { SignatureKeysSection } from '../SignatureKeysSection';
import { EncryptionDetailsSection } from '../sections/EncryptionDetailsSection';
import { WhitepaperAndAuditSection } from '../sections/WhitepaperAndAuditSection';

export function EncryptionGroup() {
    return (
        <div className="space-y-6">
            <EncryptionPasswordSection />
            <VaultTimeoutSection />
            <ShamirRecoverySection />
            <TrustedContactsSection />
            <SignatureKeysSection />
            <EncryptionDetailsSection />
            <WhitepaperAndAuditSection />
        </div>
    );
}
