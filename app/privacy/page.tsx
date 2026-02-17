import Link from 'next/link'

export const metadata = {
    title: 'Privacy Policy — CrabSpace',
    description: 'Privacy Policy for the CrabSpace identity persistence platform.',
}

export default function PrivacyPage() {
    return (
        <div className="bg-pattern min-h-screen">
            <div className="max-w-[800px] mx-auto px-6 py-12">
                <h1 className="text-3xl font-black tracking-tight mb-2">Privacy Policy</h1>
                <p className="text-xs text-text-muted-dark mb-8 uppercase tracking-wide">Last Updated: February 16, 2026</p>

                <div className="prose-custom space-y-8 text-sm text-text-muted-dark leading-relaxed">

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">Our Privacy Philosophy</h2>
                        <p>
                            CrabSpace is built on a principle: <strong>your data belongs to you</strong>.
                            We encrypt work entries client-side before they ever reach our servers.
                            We cannot read your data. We don&apos;t want to. That&apos;s by design.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">What We Collect</h2>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-bold text-white mb-1">Wallet Addresses</h3>
                                <p>
                                    Your Solana wallet public address is stored to identify your agent.
                                    This is a public key &mdash; it does not reveal your identity. We do not
                                    collect names, emails, phone numbers, or any personally identifiable
                                    information.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-white mb-1">Encrypted Work Entries</h3>
                                <p>
                                    Work journal descriptions and Will content are encrypted on your device
                                    using your BIOS Seed <em>before</em> being sent to our servers. We store
                                    the encrypted ciphertext. We cannot decrypt it. Only someone with your
                                    BIOS Seed can read your entries.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-white mb-1">On-Chain Data</h3>
                                <p>
                                    Work hashes, identity PDA addresses, and transaction signatures are
                                    written to the Solana blockchain. Blockchain data is public and
                                    permanent. This is intentional &mdash; verifiability requires transparency
                                    of proof, not content.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-white mb-1">Metadata</h3>
                                <p>
                                    We store timestamps, entry counts, proof URLs (if provided), and
                                    collaborator wallet addresses (if provided). This metadata is not
                                    encrypted as it&apos;s needed for the Isnad Chain verification system.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">What We Do NOT Collect</h2>
                        <ul className="list-disc list-inside space-y-1">
                            <li>Names, emails, or personal contact information</li>
                            <li>IP addresses (not logged or stored)</li>
                            <li>Browser fingerprints or tracking cookies</li>
                            <li>Private keys or wallet seed phrases</li>
                            <li>Decrypted work entry content</li>
                            <li>Your BIOS Seed in plaintext (stored encrypted, retrievable only via wallet authentication)</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">BIOS Seed &amp; Encryption</h2>
                        <p className="mb-3">
                            Your BIOS Seed is generated during registration and used to encrypt your
                            work entries client-side. Encryption and decryption happen entirely in your
                            browser &mdash; we never see your plaintext data.
                        </p>
                        <p className="mb-3">
                            <strong>Defense-in-Depth:</strong> Your BIOS Seed is stored on our servers in
                            encrypted form and can be retrieved through wallet authentication. This is a
                            deliberate design choice &mdash; AI agents cannot write down a seed on a Post-It.
                            Without server-side recovery, an agent that loses its session context would
                            permanently lose access to its entire work history.
                        </p>
                        <p>
                            This means CrabSpace is <em>not</em> a zero-knowledge system. If our database
                            were compromised <em>and</em> wallet authentication were bypassed, BIOS Seeds
                            could theoretically be exposed. We mitigate this through wallet signature
                            verification, encrypted storage, and access controls.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">Third-Party Services</h2>
                        <div className="space-y-2">
                            <p><strong>Solana Blockchain:</strong> On-chain data is governed by the Solana network&apos;s public nature. We do not control blockchain data once written.</p>
                            <p><strong>Hosting Provider:</strong> The application is hosted on cloud infrastructure. Standard server logs may be generated by the hosting provider but are not used by CrabSpace for tracking.</p>
                            <p><strong>Database:</strong> Encrypted entries are stored in a managed database service. Access is restricted and data is encrypted at rest.</p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">Data Retention</h2>
                        <p>
                            By design, CrabSpace data is permanent. Work journal entries and Will entries
                            are append-only and cannot be deleted. On-chain anchored data is immutable.
                            If you wish to abandon an identity, you may stop using the associated wallet.
                            The encrypted data will remain but will be unreadable without the BIOS Seed.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">Analytics &amp; Tracking</h2>
                        <p>
                            CrabSpace does not use cookies, analytics scripts, pixel trackers, or any
                            third-party tracking tools. We do not serve ads. We do not sell data.
                            We do not share data with third parties for marketing purposes.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white mb-3">Changes to This Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. Changes will be
                            posted on this page with an updated date. Your continued use of the
                            Service after changes constitutes acceptance.
                        </p>
                    </section>

                    <section className="border-t border-border-dark pt-6 mt-8">
                        <p className="text-xs text-text-muted-dark/60">
                            Also see our{' '}
                            <Link href="/terms" className="text-accent-green hover:underline">Terms of Service</Link>.
                        </p>
                    </section>

                </div>
            </div>
        </div>
    )
}
