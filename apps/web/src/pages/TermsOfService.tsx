/**
 * Terms of Service Page
 * Legal terms governing the use of StenVault
 */

import { EXTERNAL_URLS } from '@/lib/constants/externalUrls';

export default function TermsOfService() {
    return (
        <div className="pt-24 md:pt-28">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

                <h1 className="text-4xl font-bold mb-2 text-white">Terms of Service</h1>
                <p className="text-slate-400 mb-8">
                    Last updated: March 3, 2026 &middot; Effective: March 3, 2026
                </p>

                <div className="prose prose-invert max-w-none space-y-8 text-slate-200">

                    {/* 1. Introduction */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">1. Introduction</h2>
                        <p>
                            These Terms of Service ("Terms") govern your access to and use of StenVault
                            ("Service", "we", "us", "our"), an end-to-end encrypted cloud storage platform
                            operated from Portugal. By creating an account or using the Service, you agree to
                            be bound by these Terms. If you do not agree, do not use the Service.
                        </p>
                        <p>
                            StenVault is currently operated as an independent project. When a legal entity is
                            formally registered, these Terms will be updated to reflect the entity details.
                        </p>
                    </section>

                    {/* 2. Eligibility */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">2. Eligibility</h2>
                        <p>
                            You must be at least 13 years old to use StenVault. If you are between 13 and 16
                            years old and reside in the European Union, you must have the consent of a parent
                            or legal guardian. By using the Service, you represent and warrant that you meet
                            these requirements.
                        </p>
                        <p>
                            If you are using the Service on behalf of an organization, you represent and warrant
                            that you have the authority to bind that organization to these Terms.
                        </p>
                    </section>

                    {/* 3. Account */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">3. Account Registration and Security</h2>
                        <p>
                            To use StenVault, you must create an account with a valid email address and a
                            master password. You are solely responsible for maintaining the confidentiality of
                            your credentials and for all activities that occur under your account.
                        </p>
                        <h3 className="text-xl font-medium text-white mt-4">3.1 Zero-Knowledge Architecture</h3>
                        <p>
                            StenVault uses a zero-knowledge encryption model. Your master password is never
                            transmitted to or stored on our servers. All encryption and decryption occurs
                            exclusively on your device. This means:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>We cannot recover your master password if you lose it.</li>
                            <li>We cannot access, read, or decrypt your files, filenames, or file contents.</li>
                            <li>We cannot reset your encryption keys on your behalf.</li>
                            <li>
                                You are solely responsible for maintaining access to your account through your
                                master password and/or recovery codes.
                            </li>
                        </ul>
                        <h3 className="text-xl font-medium text-white mt-4">3.2 Recovery Codes</h3>
                        <p>
                            During account setup, you may be provided with recovery codes. We strongly recommend
                            storing these codes securely offline. If you lose both your master password and
                            recovery codes, your encrypted data will be permanently inaccessible.
                        </p>
                        <h3 className="text-xl font-medium text-white mt-4">3.3 Account Sharing</h3>
                        <p>
                            Accounts are personal and non-transferable. You may not sell, trade, or share your
                            account credentials with third parties. Business plan accounts may add authorized
                            members through the organization management features.
                        </p>
                    </section>

                    {/* 4. Subscription and Payments */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">4. Subscription Plans and Payments</h2>
                        <h3 className="text-xl font-medium text-white mt-4">4.1 Plans</h3>
                        <p>
                            StenVault offers Free, Pro, and Business subscription plans. The current features,
                            storage limits, and pricing for each plan are listed on our{" "}
                            <a href={EXTERNAL_URLS.pricing} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Pricing page</a>. We
                            reserve the right to modify plan features and pricing with 30 days' notice to
                            existing subscribers.
                        </p>
                        <h3 className="text-xl font-medium text-white mt-4">4.2 Billing</h3>
                        <p>
                            Paid subscriptions are billed in advance on a monthly or annual basis through
                            Stripe. All prices are in Euros (EUR) and include applicable taxes (VAT) for
                            customers in the European Union. Business customers with a valid EU VAT ID will
                            receive a reverse charge where applicable.
                        </p>
                        <h3 className="text-xl font-medium text-white mt-4">4.3 Free Trial</h3>
                        <p>
                            Pro and Business plans include a 14-day free trial. You must provide a valid payment
                            method to start a trial. If you do not cancel before the trial ends, you will be
                            charged automatically. You may cancel during the trial at no cost.
                        </p>
                        <h3 className="text-xl font-medium text-white mt-4">4.4 Business Plan Seats</h3>
                        <p>
                            The Business plan is priced per user (seat) with a minimum of 3 seats. You may add
                            or remove seats at any time through the customer portal. Changes are prorated.
                        </p>
                        <h3 className="text-xl font-medium text-white mt-4">4.5 Refund Policy</h3>
                        <p>
                            You may request a full refund within <strong>14 days</strong> of any subscription
                            purchase or renewal, for both monthly and annual plans. After 14 days, no refunds
                            will be issued. Refund requests are processed through our payment provider (Stripe).
                            To request a refund, contact us at{" "}
                            <a href="mailto:privacy@stenvault.com" className="text-indigo-400 hover:underline">
                                privacy@stenvault.com
                            </a>.
                        </p>
                        <p>
                            We reserve the right to deny refund requests where there is evidence of abuse,
                            such as repeated subscription and cancellation cycles, or usage exceeding 50% of
                            the plan's storage quota at the time of the request.
                        </p>
                        <h3 className="text-xl font-medium text-white mt-4">4.6 Failed Payments</h3>
                        <p>
                            If a payment fails, we will retry the charge using Stripe Smart Retries over a
                            period of up to 3 weeks. During this period, your access may be progressively
                            reduced:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li><strong>Days 1–14:</strong> Full access with a billing warning.</li>
                            <li><strong>Days 15–28:</strong> Read-only access (downloads permitted, uploads blocked).</li>
                            <li><strong>Days 29–42:</strong> Suspended access (billing management and data export only).</li>
                            <li><strong>After day 42:</strong> Subscription canceled, account reverts to Free plan.</li>
                        </ul>
                        <h3 className="text-xl font-medium text-white mt-4">4.7 Cancellation</h3>
                        <p>
                            You may cancel your subscription at any time through the Stripe customer portal
                            accessible from your account settings. Cancellation takes effect at the end of the
                            current billing period. You retain full access to paid features until then.
                        </p>
                    </section>

                    {/* 5. Downgrade and Over-Quota */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">5. Downgrade and Over-Quota Policy</h2>
                        <p>
                            When your subscription ends (cancellation, expiry, or failed payment), your account
                            reverts to the Free plan. If your stored data exceeds the Free plan limits:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>New uploads will be blocked immediately.</li>
                            <li>Downloads and file deletion remain available.</li>
                            <li>You have a <strong>90-day grace period</strong> to reduce your storage usage below the Free plan limit or resubscribe.</li>
                            <li>We will send reminder emails at the start, at 30 days, 7 days, and 1 day before the grace period expires.</li>
                            <li>After 90 days, your account may be suspended. Downloads remain available for an additional 30 days (120 days total).</li>
                        </ul>
                        <p className="font-medium mt-2">
                            We will never automatically delete your files. Your encrypted files are your
                            property. Due to our zero-knowledge architecture, selective deletion by us is not
                            technically possible without destroying all data.
                        </p>
                    </section>

                    {/* 6. Acceptable Use */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">6. Acceptable Use Policy</h2>
                        <p>
                            You agree not to use StenVault to store, share, or distribute:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Child sexual abuse material (CSAM) in any form.</li>
                            <li>Content that promotes terrorism or violent extremism.</li>
                            <li>Malware, ransomware, or other malicious software intended to harm others.</li>
                            <li>Content that infringes on intellectual property rights where you are not the rightful owner or licensee.</li>
                            <li>Any material that violates applicable laws in your jurisdiction or in Portugal.</li>
                        </ul>
                        <p>
                            Due to our zero-knowledge encryption, we cannot inspect the contents of your files.
                            However, if we receive a valid legal order or credible report of abuse, we may be
                            required to suspend or terminate your account. We will notify you unless legally
                            prohibited from doing so.
                        </p>
                        <p>
                            You also agree not to:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Attempt to gain unauthorized access to the Service, other accounts, or our infrastructure.</li>
                            <li>Use automated tools to scrape, crawl, or overload the Service.</li>
                            <li>Create multiple free accounts to circumvent storage limits.</li>
                            <li>Resell or sublicense the Service without our written consent.</li>
                            <li>Use the Service for cryptocurrency mining or unrelated computational tasks.</li>
                        </ul>
                    </section>

                    {/* 7. Inactive Accounts */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">7. Inactive Accounts</h2>
                        <p>
                            Free accounts that have been inactive (no login) for 12 consecutive months may be
                            suspended and eventually deleted. We will send at least two email notifications
                            before taking action: one at 10 months and one at 11 months of inactivity.
                        </p>
                        <p>
                            Paid accounts are always considered active for the duration of their subscription,
                            regardless of login frequency.
                        </p>
                    </section>

                    {/* 8. Intellectual Property */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">8. Intellectual Property</h2>
                        <h3 className="text-xl font-medium text-white mt-4">8.1 Your Content</h3>
                        <p>
                            You retain all ownership rights to the files and data you upload to StenVault.
                            We do not claim any intellectual property rights over your content. Due to our
                            zero-knowledge encryption, we have no ability to access or use your content.
                        </p>
                        <h3 className="text-xl font-medium text-white mt-4">8.2 Our Service</h3>
                        <p>
                            The StenVault platform, including its software, design, and branding, is our
                            intellectual property. You may not copy, modify, distribute, or reverse engineer
                            any part of the Service, except as permitted by applicable open-source licenses
                            for components we release under such licenses.
                        </p>
                    </section>

                    {/* 9. Service Availability */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">9. Service Availability and SLA</h2>
                        <p>
                            We aim to maintain a service availability of <strong>99.5%</strong> measured on a
                            monthly basis, excluding scheduled maintenance. Scheduled maintenance will be
                            announced at least 24 hours in advance when possible.
                        </p>
                        <p>
                            If we fail to meet the 99.5% uptime target in any calendar month, affected paid
                            subscribers may request a service credit proportional to the downtime experienced.
                            Service credits are applied to future billing cycles and do not exceed 30% of the
                            monthly subscription fee.
                        </p>
                        <p>
                            This SLA does not cover downtime caused by:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Force majeure events (natural disasters, wars, pandemics).</li>
                            <li>Third-party service outages (Cloudflare, Stripe, internet infrastructure).</li>
                            <li>Scheduled maintenance with prior notice.</li>
                            <li>Your own network connectivity issues.</li>
                        </ul>
                    </section>

                    {/* 10. Limitation of Liability */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">10. Limitation of Liability</h2>
                        <p>
                            To the maximum extent permitted by applicable law:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>
                                The Service is provided <strong>"as is"</strong> and <strong>"as available"</strong> without
                                warranties of any kind, whether express, implied, or statutory, including
                                warranties of merchantability, fitness for a particular purpose, or non-infringement.
                            </li>
                            <li>
                                We do not warrant that the Service will be uninterrupted, error-free, or completely secure.
                            </li>
                            <li>
                                Our total aggregate liability for any claims arising from or related to the
                                Service shall not exceed the greater of (a) the amount you paid us in the
                                12 months preceding the claim, or (b) €100.
                            </li>
                            <li>
                                We shall not be liable for any indirect, incidental, special, consequential, or
                                punitive damages, including but not limited to loss of profits, data, business
                                opportunities, or goodwill.
                            </li>
                        </ul>
                        <p>
                            <strong>Important:</strong> Due to our zero-knowledge architecture, we cannot recover
                            your data if you lose your master password and recovery codes. We are not liable
                            for data loss resulting from lost credentials.
                        </p>
                    </section>

                    {/* 11. Indemnification */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">11. Indemnification</h2>
                        <p>
                            You agree to indemnify and hold harmless StenVault and its operators from any
                            claims, damages, losses, or expenses (including reasonable legal fees) arising from:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Your violation of these Terms.</li>
                            <li>Your use of the Service.</li>
                            <li>Content you store, share, or transmit through the Service.</li>
                            <li>Your violation of any third-party rights.</li>
                        </ul>
                    </section>

                    {/* 12. Termination */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">12. Termination</h2>
                        <p>
                            You may delete your account at any time from your account settings. Upon deletion:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Your encrypted files will be permanently deleted from our servers.</li>
                            <li>Your account data will be removed in accordance with our Privacy Policy.</li>
                            <li>Active subscriptions will be canceled (no further charges).</li>
                            <li>This action is irreversible.</li>
                        </ul>
                        <p>
                            We reserve the right to suspend or terminate your account if you violate these Terms,
                            engage in abusive behavior, or if required by law. We will provide reasonable notice
                            unless immediate action is necessary to prevent harm or comply with a legal obligation.
                        </p>
                    </section>

                    {/* 13. Changes to Terms */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">13. Changes to These Terms</h2>
                        <p>
                            We may update these Terms from time to time. When we make material changes, we will:
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Notify you by email at least 30 days before the changes take effect.</li>
                            <li>Post the updated Terms on this page with a new "Last updated" date.</li>
                            <li>Provide a summary of the key changes.</li>
                        </ul>
                        <p>
                            Your continued use of the Service after the effective date constitutes acceptance of
                            the updated Terms. If you disagree with the changes, you may cancel your subscription
                            and delete your account before the changes take effect.
                        </p>
                    </section>

                    {/* 14. Governing Law */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">14. Governing Law and Disputes</h2>
                        <p>
                            These Terms are governed by the laws of <strong>Portugal</strong> and the applicable
                            regulations of the European Union, including the General Data Protection Regulation
                            (GDPR).
                        </p>
                        <p>
                            Any disputes arising from these Terms or your use of the Service shall be subject
                            to the exclusive jurisdiction of the courts of Portugal, unless mandatory consumer
                            protection laws in your country of residence grant you the right to bring proceedings
                            in your local courts.
                        </p>
                        <p>
                            For consumers in the European Union: you may also submit complaints to the{" "}
                            <a
                                href="https://ec.europa.eu/consumers/odr"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-400 hover:underline"
                            >
                                EU Online Dispute Resolution platform
                            </a>.
                        </p>
                    </section>

                    {/* 15. Severability */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">15. Severability</h2>
                        <p>
                            If any provision of these Terms is found to be unenforceable or invalid by a court
                            of competent jurisdiction, the remaining provisions shall continue in full force
                            and effect. The unenforceable provision will be modified to the minimum extent
                            necessary to make it enforceable while preserving its original intent.
                        </p>
                    </section>

                    {/* 16. Contact */}
                    <section>
                        <h2 className="text-2xl font-semibold text-white">16. Contact</h2>
                        <p>
                            For questions about these Terms, please contact us at:
                        </p>
                        <p>
                            <a href="mailto:privacy@stenvault.com" className="text-indigo-400 hover:underline">
                                privacy@stenvault.com
                            </a>
                        </p>
                    </section>

                </div>

                <div className="mt-12 pt-8 border-t border-slate-800/60 text-sm text-slate-400">
                    <p>StenVault &middot; End-to-end encrypted cloud storage &middot; Operated from Portugal</p>
                </div>
            </div>
        </div>
    );
}
