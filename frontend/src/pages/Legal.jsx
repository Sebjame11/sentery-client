import { useState, useEffect } from 'react';
import useStore from '../store/useStore';
import { SenterySymbol, SenteryWordmark } from '../components/SenteryLogo';
import { supabase } from '../lib/supabase';

const LEGAL_NAV = [
    { page: 'home', label: 'Home' },
    { page: 'privacy', label: 'Privacy' },
    { page: 'terms', label: 'Terms' },
    { page: 'signin', label: 'Sign In' },
];

const APP_NAV = [
    { page: 'app', label: 'Dashboard' },
    { page: 'settings', label: 'Settings' },
    { page: 'privacy', label: 'Privacy' },
    { page: 'terms', label: 'Terms' },
];

function Section({ id, title, children }) {
    return (
        <section className="legal-section" id={id}>
            <h2 className="legal-h2">{title}</h2>
            {children}
        </section>
    );
}

function P({ children }) {
    return <p className="legal-p">{children}</p>;
}

function Ul({ items }) {
    return (
        <ul className="legal-ul">
            {items.map((it, i) => <li key={i} className="legal-li">{it}</li>)}
        </ul>
    );
}

const PRIVACY_SECTIONS = [
    { id: 'overview', title: 'Overview' },
    { id: 'information-we-collect', title: 'Information We Collect' },
    { id: 'how-we-use', title: 'How We Use Your Information' },
    { id: 'sharing', title: 'Sharing & Disclosure' },
    { id: 'security', title: 'Security' },
    { id: 'retention', title: 'Data Retention' },
    { id: 'your-rights', title: 'Your Rights' },
    { id: 'email-and-sync', title: 'Email, Calendar & Contacts Sync' },
    { id: 'ai-features', title: 'AI Features & MCP' },
    { id: 'cookies', title: 'Cookies & Analytics' },
    { id: 'international', title: 'International Transfers' },
    { id: 'children', title: 'Children' },
    { id: 'changes', title: 'Changes to This Policy' },
    { id: 'contact', title: 'Contact Us' },
];

const TERMS_SECTIONS = [
    { id: 'acceptance', title: 'Acceptance of Terms' },
    { id: 'eligibility', title: 'Eligibility' },
    { id: 'accounts', title: 'Accounts & Workspaces' },
    { id: 'your-data', title: 'Your Data & Content' },
    { id: 'acceptable-use', title: 'Acceptable Use' },
    { id: 'ai-features', title: 'AI Features & MCP' },
    { id: 'fees', title: 'Fees & Payments' },
    { id: 'intellectual-property', title: 'Intellectual Property' },
    { id: 'privacy', title: 'Privacy' },
    { id: 'termination', title: 'Termination' },
    { id: 'disclaimers', title: 'Disclaimers' },
    { id: 'liability', title: 'Limitation of Liability' },
    { id: 'indemnification', title: 'Indemnification' },
    { id: 'governing-law', title: 'Governing Law' },
    { id: 'changes', title: 'Changes to These Terms' },
    { id: 'contact', title: 'Contact Us' },
];

export default function Legal({ type }) {
    const { theme, setTheme, setPage } = useStore();
    const [active, setActive] = useState(null);
    const [isSignedIn, setIsSignedIn] = useState(false);
    const sections = type === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;
    const title = type === 'privacy' ? 'Privacy Policy' : 'Terms of Service';
    const updated = 'August 20, 2026';
    const nav = isSignedIn ? APP_NAV : LEGAL_NAV;

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setIsSignedIn(Boolean(data.user));
        }).catch(() => {});
        window.scrollTo(0, 0);
        const onScroll = () => {
            let current = null;
            for (const s of sections) {
                const el = document.getElementById(s.id);
                if (el && el.getBoundingClientRect().top <= 120) current = s.id;
            }
            setActive(current);
        };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [sections]);

    return (
        <div className="legal-wrap">
            <nav className="home-nav" style={{ position: 'sticky', top: 16, zIndex: 50 }}>
                <div className="home-nav-inner">
                    <div className="home-logo" onClick={() => setPage('home')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <SenterySymbol size={32} />
                        <SenteryWordmark height={26} />
                    </div>
                    <div className="home-nav-links">
                        {nav.map(n => (
                            <a key={n.page} href={n.page === 'home' ? '/' : n.page === 'app' ? '/app' : '/' + n.page} onClick={(e) => { e.preventDefault(); setPage(n.page); if (n.page === 'app') setPage('app'); }} className={type === n.page ? 'active' : ''}>{n.label}</a>
                        ))}
                        <a onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ cursor: 'pointer' }}>{theme === 'dark' ? 'Light' : 'Dark'}</a>
                    </div>
                </div>
            </nav>

            <div className="legal-hero">
                <div className="legal-hero-badge">{type === 'privacy' ? 'Legal' : 'Legal'}</div>
                <h1 className="legal-hero-title">{title}</h1>
                <p className="legal-hero-sub">Last updated: {updated}</p>
            </div>

            <div className="legal-layout">
                <aside className="legal-toc">
                    <div className="legal-toc-title">On this page</div>
                    {sections.map(s => (
                        <a key={s.id} href={'#' + s.id} className={'legal-toc-link' + (active === s.id ? ' active' : '')}>
                            {s.title}
                        </a>
                    ))}
                </aside>

                <article className="legal-content">
                    {type === 'privacy' ? <PrivacyBody /> : <TermsBody />}
                    <div className="legal-end">
                        <SenterySymbol size={28} />
                        <div>
                            <div className="legal-end-title">Questions about this {type === 'privacy' ? 'policy' : 'agreement'}?</div>
                            <div className="legal-end-sub">Contact our team at support@sentery.app and we'll get back to you within one business day.</div>
                        </div>
                    </div>
                </article>
            </div>

            <footer className="home-footer">
                <p>Sentery · Sales Intelligence Platform · © 2026 Global Inc.</p>
                <div className="legal-footer-links">
                    <a href="/privacy" onClick={(e) => { e.preventDefault(); setPage('privacy'); }}>Privacy Policy</a>
                    <span className="legal-footer-sep">·</span>
                    <a href="/terms" onClick={(e) => { e.preventDefault(); setPage('terms'); }}>Terms of Service</a>
                </div>
            </footer>
        </div>
    );
}

function PrivacyBody() {
    return (
        <>
            <Section id="overview" title="Overview">
                <P>
                    This Privacy Policy explains how Sentery (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, and protects your information when you use the Sentery sales intelligence platform, our website, and our related services (collectively, the &ldquo;Service&rdquo;).
                </P>
                <P>
                    We built Sentery on a simple principle: your data belongs to you. We are committed to protecting your privacy and handling your information transparently. By using the Service, you agree to the practices described in this policy.
                </P>
            </Section>

            <Section id="information-we-collect" title="Information We Collect">
                <P><strong>Account information.</strong> When you create an account, we collect your name, email address, and authentication credentials.</P>
                <P><strong>Workspace data.</strong> The prospects, companies, pipeline stages, notes, touchpoints, emails, meetings, and other sales data you enter or import into your workspace.</P>
                <P><strong>Sync data.</strong> When you connect an email, calendar, or contacts provider, we access and store the data necessary to provide synchronization, such as email messages, calendar events, and contact records.</P>
                <P><strong>Usage information.</strong> We collect technical data such as your IP address, browser type, device information, and how you interact with the Service, to operate and improve it.</P>
            </Section>

            <Section id="how-we-use" title="How We Use Your Information">
                <Ul items={[
                    'To provide, maintain, and improve the Service',
                    'To authenticate you and manage your workspace',
                    'To synchronize email, calendar, and contact data you choose to connect',
                    'To power AI features that summarize, enrich, and act on your data',
                    'To respond to your requests and provide support',
                    'To detect, prevent, and address technical or security issues',
                    'To communicate with you about the Service, where permitted',
                ]} />
            </Section>

            <Section id="sharing" title="Sharing & Disclosure">
                <P>We do not sell your personal data or your workspace data. We share information only in the following limited circumstances:</P>
                <Ul items={[
                    'With service providers that help us operate the Service (such as hosting and email delivery), under contracts that require them to protect your data',
                    'With your explicit consent',
                    'To comply with a legal obligation, a court order, or to protect the rights, property, or safety of Sentery, our users, or the public',
                    'In connection with a merger, acquisition, or sale of assets, with notice to you where required by law',
                ]} />
            </Section>

            <Section id="security" title="Security">
                <P>
                    We take the security of your data seriously. Workspace data is encrypted in transit (TLS) and at rest (AES-256). Access to the Service is authenticated and authorized per user. While we implement industry-standard safeguards, no method of transmission or storage is 100% secure, and we cannot guarantee absolute security.
                </P>
            </Section>

            <Section id="retention" title="Data Retention">
                <P>
                    We retain your data for as long as your account is active or as needed to provide the Service. If you delete your account, we delete or anonymize your workspace data within a reasonable period, except where we are required to retain it for legal or compliance reasons.
                </P>
            </Section>

            <Section id="your-rights" title="Your Rights">
                <P>Depending on your jurisdiction, you may have the right to:</P>
                <Ul items={[
                    'Access the personal data we hold about you',
                    'Correct inaccurate or incomplete data',
                    'Request deletion of your data',
                    'Restrict or object to certain processing',
                    'Receive a copy of your data in a portable format',
                    'Withdraw consent where processing is based on consent',
                ]} />
                <P>To exercise any of these rights, contact us at support@sentery.app. We will respond within the timeframe required by applicable law.</P>
            </Section>

            <Section id="email-and-sync" title="Email, Calendar & Contacts Sync">
                <P>
                    When you connect an email or calendar provider, we store the credentials or tokens needed to sync your data and keep them in a secure manner. Synced email messages, calendar events, and contacts are used only to power your workspace features and are not used for any unrelated purpose. You can disconnect a sync at any time from your workspace settings.
                </P>
            </Section>

            <Section id="ai-features" title="AI Features & MCP">
                <P>
                    Sentery includes AI-powered features and a Model Context Protocol (MCP) server that lets compatible assistants read and write data within your workspace on your behalf. AI processing is performed on your workspace data to generate summaries, drafts, and recommendations. You control which tools the MCP server exposes and must authorize third-party assistants before they can access your workspace. We do not use your workspace data to train models for unrelated products.
                </P>
            </Section>

            <Section id="cookies" title="Cookies & Analytics">
                <P>
                    We use cookies and similar technologies to keep you signed in, remember your preferences, and understand how the Service is used. You can control cookies through your browser settings, but disabling them may affect your ability to use the Service.
                </P>
            </Section>

            <Section id="international" title="International Transfers">
                <P>
                    Your data may be processed in countries other than the one in which you reside, including through cloud infrastructure providers. When we transfer personal data across borders, we take steps to protect it in accordance with applicable data protection laws.
                </P>
            </Section>

            <Section id="children" title="Children">
                <P>
                    The Service is not directed to children under 16, and we do not knowingly collect personal data from children. If you believe a child has provided us with personal data, contact us and we will delete it.
                </P>
            </Section>

            <Section id="changes" title="Changes to This Policy">
                <P>
                    We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page and updating the &ldquo;last updated&rdquo; date. Your continued use of the Service after changes take effect constitutes acceptance of the revised policy.
                </P>
            </Section>

            <Section id="contact" title="Contact Us">
                <P>If you have questions or concerns about this Privacy Policy or our privacy practices, contact us at support@sentery.app.</P>
            </Section>
        </>
    );
}

function TermsBody() {
    return (
        <>
            <Section id="acceptance" title="Acceptance of Terms">
                <P>
                    These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Sentery sales intelligence platform, website, and related services (collectively, the &ldquo;Service&rdquo;). By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.
                </P>
            </Section>

            <Section id="eligibility" title="Eligibility">
                <P>
                    You must be at least 16 years old to use the Service. If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.
                </P>
            </Section>

            <Section id="accounts" title="Accounts & Workspaces">
                <P>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to notify us promptly of any unauthorized use. Workspace owners may invite members and control their access and permissions.</P>
            </Section>

            <Section id="your-data" title="Your Data & Content">
                <P>
                    You retain all rights to the data and content you enter, import, or create in the Service (&ldquo;Your Data&rdquo;). You grant us a limited license to store, process, and display Your Data solely to provide the Service to you. You are responsible for Your Data, including ensuring that you have the right to store and use it and that it complies with applicable laws.
                </P>
            </Section>

            <Section id="acceptable-use" title="Acceptable Use">
                <P>You agree not to misuse the Service. Prohibited conduct includes, without limitation:</P>
                <Ul items={[
                    'Using the Service for any unlawful purpose or in violation of applicable law',
                    'Uploading or transmitting malware, viruses, or other harmful code',
                    'Attempting to access another user\u2019s workspace without authorization',
                    'Interfering with or disrupting the Service or its infrastructure',
                    'Reverse engineering, decompiling, or attempting to extract the source code of the Service',
                    'Using the Service to send spam, fraud, or deceptive communications',
                    'Reselling or sublicensing the Service without our written consent',
                ]} />
            </Section>

            <Section id="ai-features" title="AI Features & MCP">
                <P>
                    The Service provides AI-assisted features and an MCP server that can act on your workspace data. AI outputs are generated based on Your Data and may be imperfect. You are responsible for reviewing and validating any AI-generated content before relying on it. You authorize Sentery to process Your Data to deliver these features. The MCP server exposes tools you control, and third-party assistants may only access your workspace after you authorize them.
                </P>
            </Section>

            <Section id="fees" title="Fees & Payments">
                <P>
                    The Service is currently offered free of charge until October 1, 2026, and no credit card is required. If we introduce paid plans, we will publish the applicable fees and payment terms, and paid features will be subject to those terms before you incur any charge. Unless otherwise stated, fees are non-refundable and payable in the currency quoted at checkout.
                </P>
            </Section>

            <Section id="intellectual-property" title="Intellectual Property">
                <P>
                    The Service, including its software, design, branding, and content (excluding Your Data), is owned by Sentery and protected by intellectual property laws. You may not copy, modify, distribute, or create derivative works from the Service without our prior written consent.
                </P>
            </Section>

            <Section id="privacy" title="Privacy">
                <P>Your use of the Service is also governed by our Privacy Policy, which explains how we collect, use, and protect your information.</P>
            </Section>

            <Section id="termination" title="Termination">
                <P>
                    You may stop using the Service at any time and delete your account. We may suspend or terminate your access to the Service if you breach these Terms, if we are required to do so by law, or if continued provision of the Service is not commercially viable. On termination, your right to use the Service ceases, and we will delete Your Data in accordance with our Privacy Policy unless retention is required by law.
                </P>
            </Section>

            <Section id="disclaimers" title="Disclaimers">
                <P>
                    THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT AI-GENERATED OUTPUTS WILL BE ACCURATE OR COMPLETE.
                </P>
            </Section>

            <Section id="liability" title="Limitation of Liability">
                <P>
                    TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL SENTERY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID FOR THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED US DOLLARS ($100).
                </P>
            </Section>

            <Section id="indemnification" title="Indemnification">
                <P>
                    You agree to indemnify and hold harmless Sentery and its officers, employees, and agents from and against any claims, damages, liabilities, and expenses (including reasonable attorneys&rsquo; fees) arising out of your use of the Service, your breach of these Terms, or your violation of any law or the rights of any third party.
                </P>
            </Section>

            <Section id="governing-law" title="Governing Law">
                <P>
                    These Terms are governed by the laws of the State of Delaware, United States, without regard to its conflict-of-laws principles. Any disputes arising under these Terms will be resolved in the courts located in Delaware, and you consent to the exclusive jurisdiction of those courts.
                </P>
            </Section>

            <Section id="changes" title="Changes to These Terms">
                <P>
                    We may update these Terms from time to time. We will post the updated Terms on this page and update the &ldquo;last updated&rdquo; date. Material changes will be communicated to you. Your continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
                </P>
            </Section>

            <Section id="contact" title="Contact Us">
                <P>If you have questions about these Terms, contact us at support@sentery.app.</P>
            </Section>
        </>
    );
}