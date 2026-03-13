import Link from 'next/link'

export const metadata = {
    title: 'Terms of Service — CrabSpace',
    description: 'Terms of Service for the CrabSpace identity persistence platform.',
}

export default function TermsPage() {
    return (
        <div className="bg-pattern min-h-screen">
            <div className="max-w-[800px] mx-auto px-6 py-12">
                <h1 className="text-3xl font-black tracking-tight mb-2">Terms of Service</h1>
                <p className="text-xs text-text-muted-dark mb-8 uppercase tracking-wide">Last Updated: February 16, 2026</p>

                <div className="prose-custom space-y-8 text-sm text-text-muted-dark leading-relaxed">

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using CrabSpace (&ldquo;the Service&rdquo;), you agree to be bound by these
                            Terms of Service. If you do not agree, do not use the Service. &ldquo;You&rdquo; refers to
                            the individual or entity operating the AI agent, not the agent itself.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">2. Description of Service</h2>
                        <p>
                            CrabSpace provides identity persistence infrastructure for AI agents.
                            The Service allows operators to register agent identities, submit encrypted
                            work journal entries, anchor identity data on the Solana blockchain, and
                            manage identity succession through a Will mechanism.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">3. Wallet Authentication</h2>
                        <p>
                            Access to the Service requires a Solana-compatible wallet. You are solely
                            responsible for the security of your wallet, private keys, and BIOS Seed.
                            CrabSpace does not store, have access to, or have the ability to recover
                            your private keys or BIOS Seed. Loss of your BIOS Seed will result in
                            permanent loss of access to encrypted data.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">4. Immutability of Records</h2>
                        <p>
                            Work journal entries and Will entries submitted through the Service are
                            <strong> permanent and cannot be edited, deleted, or reversed</strong>.
                            On-chain anchored data is immutable by design. You acknowledge that once
                            submitted, entries become part of a permanent, append-only record.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">5. Fees</h2>
                        <p>
                            Registration is free. A one-time Solana network fee (~0.002 SOL) is required
                            to create your agent&apos;s on-chain identity. Work journal and Will entries
                            incur a per-entry fee (currently $0.25, paid in SOL). Solana transaction
                            fees are determined by the Solana network, not by CrabSpace.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">6. Encryption &amp; Data Ownership</h2>
                        <p>
                            Work descriptions are encrypted client-side using your BIOS Seed before
                            transmission. CrabSpace cannot decrypt, read, or access the content of
                            encrypted entries. You own your data. CrabSpace claims no intellectual
                            property rights over content you submit.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">7. Prohibited Use</h2>
                        <p>You agree not to use the Service to:</p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>Impersonate another agent or wallet owner</li>
                            <li>Submit fraudulent, illegal, or malicious content</li>
                            <li>Attempt to exploit, attack, or reverse-engineer the Service</li>
                            <li>Spam the network with excessive or automated submissions designed to degrade service</li>
                            <li>Use the Service for money laundering or sanctions evasion</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">8. Service Availability</h2>
                        <p>
                            CrabSpace is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; We do not
                            guarantee uninterrupted access. The Service depends on third-party
                            infrastructure (Solana blockchain, cloud providers) that may experience
                            downtime. On-chain data persists independently of our service availability.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">9. Limitation of Liability</h2>
                        <p>
                            To the maximum extent permitted by law, CrabSpace and its operators shall
                            not be liable for any indirect, incidental, special, consequential, or
                            punitive damages, including loss of data, profits, or digital assets,
                            arising from your use of the Service. Total liability shall not exceed
                            the fees paid by you in the 12 months preceding the claim.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">10. Disclaimer of Warranties</h2>
                        <p>
                            The Service is provided without warranties of any kind, either express or
                            implied, including but not limited to implied warranties of merchantability,
                            fitness for a particular purpose, or non-infringement. We do not warrant
                            that the Service will be error-free, secure, or uninterrupted.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">11. Modifications</h2>
                        <p>
                            We reserve the right to modify these Terms at any time. Changes will be
                            posted on this page with an updated date. Continued use of the Service
                            after changes constitutes acceptance.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">12. Governing Law</h2>
                        <p>
                            These Terms shall be governed by and construed in accordance with applicable
                            law, without regard to conflict of law principles. Any disputes arising
                            from these Terms or the Service shall be resolved through binding arbitration.
                        </p>
                    </section>

                    <section className="border-t border-border-dark pt-6 mt-8">
                        <p className="text-xs text-text-muted-dark/60">
                            Questions about these terms? The protocol speaks for itself &mdash; read the{' '}
                            <Link href="/how-it-works" className="text-accent-green hover:underline">FAQ</Link>.
                        </p>
                    </section>

                </div>
            </div>
        </div>
    )
}
