/**
 * Privacy Policy Page
 * GDPR-compliant privacy policy for StenVault
 */

import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function PrivacyPolicy() {
    const [, navigate] = useLocation();

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <button
                    onClick={() => navigate("/")}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>

                <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
                <p className="text-muted-foreground mb-8">
                    Last updated: March 3, 2026 &middot; Effective: March 3, 2026
                </p>

                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-8">
                    <p className="text-sm font-medium text-primary">
                        StenVault is built on a zero-knowledge encryption architecture. We cannot access,
                        read, or decrypt your files, filenames, or file contents — even if compelled by law.
                        Your encryption keys never leave your device.
                    </p>
                </div>

                <div className="prose prose-invert max-w-none space-y-8 text-foreground/90">

                    {/* 1. Introduction */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">1. Introduction</h2>
                        <p>
                            This Privacy Policy explains how StenVault ("we", "us", "our") collects, uses,
                            stores, and protects your personal data when you use our end-to-end encrypted
                            cloud storage service ("Service"). StenVault is operated from Portugal and is
                            subject to the General Data Protection Regulation (EU) 2016/679 ("GDPR") and
                            Portuguese data protection law.
                        </p>
                        <p>
                            This policy also addresses rights under the Brazilian General Data Protection Law
                            (LGPD, Lei 13.709/2018) for users located in Brazil.
                        </p>
                        <p>
                            This Privacy Policy is a complement to our{" "}
                            <a href="/terms" className="text-primary hover:underline">Terms of Service</a>.
                        </p>
                    </section>

                    {/* 2. Data Controller */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">2. Data Controller</h2>
                        <p>
                            The data controller responsible for your personal data is:
                        </p>
                        <div className="bg-muted/50 rounded-lg p-4 mt-2">
                            <p>StenVault</p>
                            <p>Operated from Portugal</p>
                            <p>
                                Contact:{" "}
                                <a href="mailto:privacy@stenvault.app" className="text-primary hover:underline">
                                    privacy@stenvault.app
                                </a>
                            </p>
                        </div>
                        <p className="mt-2">
                            We do not currently have a formally appointed Data Protection Officer (DPO). For
                            all privacy-related inquiries, please contact us at the email address above. We
                            will appoint a DPO if and when required by applicable law.
                        </p>
                    </section>

                    {/* 3. What We CANNOT Access */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">3. What We Cannot Access (Zero-Knowledge)</h2>
                        <p>
                            Due to our zero-knowledge encryption architecture, the following data is encrypted
                            on your device before being transmitted to our servers. <strong>We do not have the
                            technical means to access:</strong>
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Your files and their contents</li>
                            <li>Your filenames and folder names</li>
                            <li>Your master password</li>
                            <li>Your encryption keys (master key, file keys, folder keys)</li>
                            <li>The content of your end-to-end encrypted chat messages</li>
                            <li>Files shared through Quantum Mesh P2P transfers (direct device-to-device)</li>
                            <li>Shamir recovery secret shares (held by your trusted contacts, not by us)</li>
                        </ul>
                        <p>
                            All encryption uses AES-256-GCM for file content, Argon2id for key derivation, and
                            hybrid post-quantum cryptography (X25519 + ML-KEM-768) for key exchange. Under no
                            circumstances can we decrypt end-to-end encrypted content and disclose decrypted
                            copies, even if legally compelled.
                        </p>
                    </section>

                    {/* 4. What We Collect */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">4. Data We Collect</h2>

                        <h3 className="text-xl font-medium text-foreground mt-4">4.1 Account Data</h3>
                        <table className="w-full text-sm border-collapse mt-2">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-2 pr-4 font-medium">Data</th>
                                    <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                                    <th className="text-left py-2 font-medium">Legal Basis (GDPR)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                <tr><td className="py-2 pr-4">Email address</td><td className="py-2 pr-4">Account identification, notifications, billing</td><td className="py-2">Contract performance (Art. 6(1)(b))</td></tr>
                                <tr><td className="py-2 pr-4">Display name</td><td className="py-2 pr-4">Shown in shares and chats</td><td className="py-2">Contract performance (Art. 6(1)(b))</td></tr>
                                <tr><td className="py-2 pr-4">OPAQUE registration record</td><td className="py-2 pr-4">Zero-knowledge authentication (password never leaves your device)</td><td className="py-2">Contract performance (Art. 6(1)(b))</td></tr>
                                <tr><td className="py-2 pr-4">Encrypted master key blob</td><td className="py-2 pr-4">Key wrapping — cannot be decrypted without your password</td><td className="py-2">Contract performance (Art. 6(1)(b))</td></tr>
                                <tr><td className="py-2 pr-4">Subscription plan & status</td><td className="py-2 pr-4">Service delivery, feature access</td><td className="py-2">Contract performance (Art. 6(1)(b))</td></tr>
                            </tbody>
                        </table>

                        <h3 className="text-xl font-medium text-foreground mt-6">4.2 Billing Data</h3>
                        <p>
                            Payment processing is handled entirely by <strong>Stripe</strong>. We do not store
                            your full credit card number. We may receive and store:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Stripe customer ID</li>
                            <li>Subscription ID and status</li>
                            <li>Card last 4 digits and card fingerprint (fraud detection)</li>
                            <li>Billing country (for VAT calculation)</li>
                        </ul>
                        <p className="text-sm text-muted-foreground mt-1">
                            Legal basis: Contract performance (Art. 6(1)(b)) and legal obligation for tax
                            compliance (Art. 6(1)(c)).
                        </p>

                        <h3 className="text-xl font-medium text-foreground mt-6">4.3 Technical Data</h3>
                        <table className="w-full text-sm border-collapse mt-2">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-2 pr-4 font-medium">Data</th>
                                    <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                                    <th className="text-left py-2 font-medium">Retention</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                <tr><td className="py-2 pr-4">IP address</td><td className="py-2 pr-4">Rate limiting, anti-fraud, abuse prevention</td><td className="py-2">24 hours (Redis TTL)</td></tr>
                                <tr><td className="py-2 pr-4">User agent string</td><td className="py-2 pr-4">Device identification, trusted device management</td><td className="py-2">Duration of device trust</td></tr>
                                <tr><td className="py-2 pr-4">Device metadata</td><td className="py-2 pr-4">Device approval workflow, session management</td><td className="py-2">Until device is removed</td></tr>
                            </tbody>
                        </table>
                        <p className="text-sm text-muted-foreground mt-1">
                            Legal basis: Legitimate interest in service security and fraud prevention (Art. 6(1)(f)).
                        </p>

                        <h3 className="text-xl font-medium text-foreground mt-6">4.4 Analytics</h3>
                        <p>
                            We use a privacy-focused analytics tool (Plausible/Umami) that does not use cookies,
                            does not track individual users, and does not collect personal data. Analytics data
                            is aggregated and anonymous — we see page view counts, not individual behavior.
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                            No consent required as no personal data is processed.
                        </p>

                        <h3 className="text-xl font-medium text-foreground mt-6">4.5 File Metadata (Encrypted)</h3>
                        <p>
                            We store encrypted blobs containing your files. The following metadata is associated
                            with each file but <strong>filenames are encrypted</strong> and unreadable by us:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>File size (needed for quota enforcement)</li>
                            <li>Upload timestamp</li>
                            <li>Encryption version identifier</li>
                            <li>MIME type (encrypted or generic "application/octet-stream")</li>
                        </ul>
                    </section>

                    {/* 5. Cookies */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">5. Cookies</h2>
                        <p>
                            StenVault uses <strong>only essential cookies</strong> required for the Service to
                            function:
                        </p>
                        <table className="w-full text-sm border-collapse mt-2">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-2 pr-4 font-medium">Cookie</th>
                                    <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                                    <th className="text-left py-2 font-medium">Duration</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                <tr><td className="py-2 pr-4">Session token (JWT)</td><td className="py-2 pr-4">Authentication</td><td className="py-2">Session / configurable expiry</td></tr>
                                <tr><td className="py-2 pr-4">CSRF token</td><td className="py-2 pr-4">Cross-site request forgery protection</td><td className="py-2">Session</td></tr>
                            </tbody>
                        </table>
                        <p className="mt-2">
                            We do not use advertising cookies, tracking cookies, or third-party cookies. No
                            cookie consent banner is required as we only use strictly necessary cookies
                            (ePrivacy Directive Art. 5(3) exemption).
                        </p>
                    </section>

                    {/* 6. Third-Party Processors */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">6. Third-Party Data Processors</h2>
                        <p>
                            We use the following third-party services to operate StenVault. Each processor
                            only receives the minimum data necessary for its function:
                        </p>
                        <table className="w-full text-sm border-collapse mt-2">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-2 pr-4 font-medium">Processor</th>
                                    <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                                    <th className="text-left py-2 pr-4 font-medium">Data Shared</th>
                                    <th className="text-left py-2 font-medium">Location</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                <tr>
                                    <td className="py-2 pr-4 font-medium">Stripe</td>
                                    <td className="py-2 pr-4">Payment processing</td>
                                    <td className="py-2 pr-4">Email, name, payment details</td>
                                    <td className="py-2">US/EU (GDPR DPA)</td>
                                </tr>
                                <tr>
                                    <td className="py-2 pr-4 font-medium">Cloudflare (R2)</td>
                                    <td className="py-2 pr-4">Encrypted file storage</td>
                                    <td className="py-2 pr-4">Encrypted blobs only (unreadable)</td>
                                    <td className="py-2">EU</td>
                                </tr>
                                <tr>
                                    <td className="py-2 pr-4 font-medium">Resend</td>
                                    <td className="py-2 pr-4">Transactional emails</td>
                                    <td className="py-2 pr-4">Email address, display name</td>
                                    <td className="py-2">US (GDPR DPA)</td>
                                </tr>
                                <tr>
                                    <td className="py-2 pr-4 font-medium">Railway</td>
                                    <td className="py-2 pr-4">Application hosting, database</td>
                                    <td className="py-2 pr-4">Application data (DB encrypted at rest)</td>
                                    <td className="py-2">EU</td>
                                </tr>
                                <tr>
                                    <td className="py-2 pr-4 font-medium">Upstash</td>
                                    <td className="py-2 pr-4">Redis (rate limiting, sessions)</td>
                                    <td className="py-2 pr-4">IP hashes, session tokens (ephemeral)</td>
                                    <td className="py-2">EU</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="mt-2">
                            All processors that handle personal data outside the EU do so under Standard
                            Contractual Clauses (SCCs) or equivalent GDPR-compliant transfer mechanisms.
                        </p>
                    </section>

                    {/* 7. Data Retention */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">7. Data Retention</h2>
                        <table className="w-full text-sm border-collapse mt-2">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-2 pr-4 font-medium">Data</th>
                                    <th className="text-left py-2 font-medium">Retention Period</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                <tr><td className="py-2 pr-4">Account data</td><td className="py-2">Until account deletion</td></tr>
                                <tr><td className="py-2 pr-4">Encrypted files</td><td className="py-2">Until deleted by you or account deletion</td></tr>
                                <tr><td className="py-2 pr-4">Billing records</td><td className="py-2">7 years (Portuguese tax law)</td></tr>
                                <tr><td className="py-2 pr-4">IP addresses (rate limiting)</td><td className="py-2">24 hours</td></tr>
                                <tr><td className="py-2 pr-4">Device trust records</td><td className="py-2">Until device removed by you</td></tr>
                                <tr><td className="py-2 pr-4">Webhook event logs</td><td className="py-2">90 days (idempotency)</td></tr>
                                <tr><td className="py-2 pr-4">Inactive Free accounts</td><td className="py-2">Deleted after 12 months of inactivity (with notice)</td></tr>
                                <tr><td className="py-2 pr-4">Trash (deleted files)</td><td className="py-2">30–180 days depending on plan, then permanently deleted</td></tr>
                            </tbody>
                        </table>
                    </section>

                    {/* 8. Your Rights */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">8. Your Rights</h2>
                        <p>
                            Under the GDPR (and LGPD for Brazilian users), you have the following rights
                            regarding your personal data:
                        </p>
                        <table className="w-full text-sm border-collapse mt-2">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-2 pr-4 font-medium">Right</th>
                                    <th className="text-left py-2 font-medium">How to Exercise</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                <tr><td className="py-2 pr-4 font-medium">Access</td><td className="py-2">Request a copy of your personal data. Email us or download your data from Settings.</td></tr>
                                <tr><td className="py-2 pr-4 font-medium">Rectification</td><td className="py-2">Update your name and email from account settings, or contact us.</td></tr>
                                <tr><td className="py-2 pr-4 font-medium">Erasure ("Right to be Forgotten")</td><td className="py-2">Delete your account from Settings. All data is permanently removed.</td></tr>
                                <tr><td className="py-2 pr-4 font-medium">Data Portability</td><td className="py-2">Download your files at any time. They are stored in standard formats.</td></tr>
                                <tr><td className="py-2 pr-4 font-medium">Restriction of Processing</td><td className="py-2">Contact us to request restricted processing of your data.</td></tr>
                                <tr><td className="py-2 pr-4 font-medium">Objection</td><td className="py-2">Contact us to object to processing based on legitimate interest.</td></tr>
                                <tr><td className="py-2 pr-4 font-medium">Withdraw Consent</td><td className="py-2">Where processing is based on consent, withdraw at any time without affecting prior processing.</td></tr>
                            </tbody>
                        </table>
                        <p className="mt-2">
                            To exercise any of these rights, contact us at{" "}
                            <a href="mailto:privacy@stenvault.app" className="text-primary hover:underline">
                                privacy@stenvault.app
                            </a>. We will respond within 30 days as required by GDPR.
                        </p>
                        <p>
                            <strong>Note on encrypted data:</strong> Your encrypted files are technically
                            inaccessible to us. "Erasure" of encrypted files means deleting the encrypted
                            blobs from our storage. We cannot provide decrypted copies of your files as we
                            do not possess the decryption keys.
                        </p>
                        <p>
                            If you believe your data protection rights have been violated, you have the right
                            to lodge a complaint with your local supervisory authority. For Portugal:{" "}
                            <a
                                href="https://www.cnpd.pt"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                            >
                                CNPD (Comissão Nacional de Proteção de Dados)
                            </a>.
                        </p>
                    </section>

                    {/* 9. Data Security */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">9. Data Security</h2>
                        <p>
                            We implement the following technical and organizational measures to protect your data:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li><strong>End-to-end encryption:</strong> AES-256-GCM for all file content, with keys derived via Argon2id (47 MiB memory cost).</li>
                            <li><strong>Post-quantum cryptography:</strong> Hybrid X25519 + ML-KEM-768 key exchange, Ed25519 + ML-DSA-65 signatures.</li>
                            <li><strong>Zero-knowledge authentication:</strong> OPAQUE protocol (RFC 9807) — your password is never transmitted to the server.</li>
                            <li><strong>Transport encryption:</strong> TLS 1.3 for all connections.</li>
                            <li><strong>Database encryption:</strong> PostgreSQL with encryption at rest.</li>
                            <li><strong>Multi-factor authentication:</strong> TOTP-based MFA available for all accounts.</li>
                            <li><strong>Rate limiting:</strong> IP-based rate limiting for authentication and API endpoints.</li>
                            <li><strong>Anti-fraud:</strong> Disposable email blocking, card fingerprint monitoring, registration velocity limits.</li>
                        </ul>
                    </section>

                    {/* 10. Data Breach Notification */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">10. Data Breach Notification</h2>
                        <p>
                            In the event of a personal data breach, we will:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Notify the relevant supervisory authority (CNPD) within <strong>72 hours</strong> of becoming aware of the breach, as required by GDPR Article 33.</li>
                            <li>Notify affected users without undue delay if the breach is likely to result in a high risk to their rights and freedoms (GDPR Article 34).</li>
                            <li>Document the breach, its effects, and remedial actions taken.</li>
                        </ul>
                        <p>
                            <strong>Important:</strong> Due to our zero-knowledge architecture, even in the event
                            of a server breach, your file contents and filenames remain encrypted and unreadable.
                            An attacker gaining access to our servers would obtain only encrypted blobs that
                            cannot be decrypted without your master password.
                        </p>
                    </section>

                    {/* 11. International Transfers */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">11. International Data Transfers</h2>
                        <p>
                            Your encrypted files are stored in the <strong>European Union</strong> (Cloudflare R2, EU region).
                            Our primary database is hosted in the EU (Railway, EU region).
                        </p>
                        <p>
                            Some of our processors (Stripe, Resend) may process limited personal data in the
                            United States. These transfers are protected by:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>EU-US Data Privacy Framework (where applicable)</li>
                            <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
                            <li>Supplementary technical measures (encryption in transit and at rest)</li>
                        </ul>
                    </section>

                    {/* 12. Children's Privacy */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">12. Children's Privacy</h2>
                        <p>
                            StenVault is not directed at children under 13. We do not knowingly collect personal
                            data from children under 13. Users aged 13–16 in the European Union must have
                            parental consent to use the Service.
                        </p>
                        <p>
                            If we discover that we have collected data from a child under 13 without appropriate
                            consent, we will delete the account and associated data promptly. If you believe a
                            child under 13 has created an account, please contact us at{" "}
                            <a href="mailto:privacy@stenvault.app" className="text-primary hover:underline">
                                privacy@stenvault.app
                            </a>.
                        </p>
                    </section>

                    {/* 13. Law Enforcement */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">13. Law Enforcement and Disclosure</h2>
                        <p>
                            We may disclose personal data to law enforcement authorities only when:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Required by a valid legal order from a court of competent jurisdiction in Portugal or the EU.</li>
                            <li>Necessary to prevent imminent harm to individuals.</li>
                            <li>Required by applicable law.</li>
                        </ul>
                        <p>
                            <strong>Under no circumstances can we disclose the content of your encrypted files.</strong>{" "}
                            We do not possess your encryption keys and cannot decrypt your data. In response to
                            a valid legal order, we can only provide:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Account email address and display name</li>
                            <li>Account creation date</li>
                            <li>Subscription plan and billing information</li>
                            <li>IP addresses used for authentication (retained for 24 hours only)</li>
                            <li>Encrypted file metadata (sizes, timestamps — filenames are encrypted)</li>
                        </ul>
                        <p>
                            We will notify affected users of any law enforcement request unless legally prohibited
                            from doing so (e.g., by a gag order). We publish a transparency report when applicable.
                        </p>
                    </section>

                    {/* 14. Changes */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">14. Changes to This Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. When we make material changes:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>We will notify you by email at least 30 days before changes take effect.</li>
                            <li>We will update the "Last updated" date at the top of this page.</li>
                            <li>We will provide a clear summary of what changed.</li>
                        </ul>
                        <p>
                            Previous versions of this policy will be archived and available upon request.
                        </p>
                    </section>

                    {/* 15. Contact */}
                    <section>
                        <h2 className="text-2xl font-semibold text-foreground">15. Contact Us</h2>
                        <p>
                            For any questions, concerns, or requests regarding this Privacy Policy or your
                            personal data, contact us at:
                        </p>
                        <div className="bg-muted/50 rounded-lg p-4 mt-2">
                            <p>
                                <strong>Email:</strong>{" "}
                                <a href="mailto:privacy@stenvault.app" className="text-primary hover:underline">
                                    privacy@stenvault.app
                                </a>
                            </p>
                            <p><strong>Response time:</strong> Within 30 days (GDPR requirement)</p>
                        </div>
                        <p className="mt-2">
                            For complaints, you may also contact the Portuguese data protection authority:
                        </p>
                        <div className="bg-muted/50 rounded-lg p-4 mt-2">
                            <p><strong>CNPD — Comissão Nacional de Proteção de Dados</strong></p>
                            <p>
                                <a
                                    href="https://www.cnpd.pt"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                >
                                    www.cnpd.pt
                                </a>
                            </p>
                        </div>
                    </section>

                </div>

                <div className="mt-12 pt-8 border-t border-border text-sm text-muted-foreground">
                    <p>StenVault &middot; End-to-end encrypted cloud storage &middot; Operated from Portugal</p>
                </div>
            </div>
        </div>
    );
}
