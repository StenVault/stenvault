/**
 * Marketing Copy — StenVault Landing Page
 * Emotional, conversion-focused copywriting.
 * NO technical jargon — translate features into human benefits.
 */

export const HEADER = {
    nav: [
        { label: 'Features', href: '#features' },
        { label: 'Security', href: '#security' },
        { label: 'How It Works', href: '#how-it-works' },
        { label: 'Pricing', href: '/pricing', isRoute: true },
        { label: 'Send', href: '/send', isRoute: true },
        { label: 'Local Transfer', href: '/send/local', isRoute: true },
    ],
} as const;

export const HERO = {
    headline: {
        line1: 'Your files.',
        line2: 'Truly yours.',
    },
    subheadline:
        'The only cloud storage where not even we can see your data. Your files are encrypted before they leave your device — and only you hold the key.',
    cta: 'Get Started Free',
    ctaSecondary: 'See How It Works',
    trustBadges: [
        'Zero-knowledge encryption',
        'End-to-end encrypted',
        'Open security architecture',
    ],
} as const;

export const PROBLEM = {
    label: 'THE PROBLEM',
    headline: "Most cloud storage\nisn't truly private.",
    subheadline:
        'Your files might feel safe, but most cloud providers have full access to everything you store.',
    cards: [
        {
            id: 'access',
            icon: 'eye' as const,
            title: 'Your provider can read your files',
            description:
                'Most cloud storage companies can access, scan, and analyze every file you upload. Your privacy depends on their promise — not on real protection.',
        },
        {
            id: 'breach',
            icon: 'alert' as const,
            title: 'Data breaches expose everything',
            description:
                'When servers store your files unencrypted, a single breach can expose your most sensitive documents to the world.',
        },
        {
            id: 'thirdparty',
            icon: 'users' as const,
            title: 'Third parties can request access',
            description:
                'Government agencies, legal requests, and internal employees can all potentially access your private files stored on traditional cloud platforms.',
        },
    ],
} as const;

export const SOLUTION = {
    label: 'THE STENVAULT DIFFERENCE',
    headline: 'Private by design.\nNot by promise.',
    subheadline:
        'StenVault encrypts everything on your device before it ever reaches our servers. We literally cannot see your files — even if we wanted to.',
    traditional: {
        title: 'Traditional Cloud',
        points: [
            'Provider can read your files',
            'Files scanned and analyzed',
            'Backdoor access possible',
            'Breaches expose your data',
            'Trust us to be good',
        ],
    },
    stenvault: {
        title: 'StenVault',
        points: [
            'Zero access to your data',
            'Fully encrypted, unreadable',
            'Mathematically impossible without your key',
            'Only encrypted data — useless',
            'Trust-free by design',
        ],
    },
} as const;

export const FEATURES = {
    label: 'FEATURES',
    headline: 'Everything you need\nto feel truly safe.',
    subheadline:
        'Built from the ground up to protect what matters most to you.',
    cards: [
        {
            id: 'encrypted',
            icon: 'lock' as const,
            title: 'Encrypted before upload',
            description:
                'Your files are locked on your device before they leave. The server only ever stores encrypted data it can never read.',
        },
        {
            id: 'key',
            icon: 'key' as const,
            title: 'Only you hold the key',
            description:
                'Your encryption key never leaves your device. No master backdoor. No recovery access for us. No way to bypass your protection.',
        },
        {
            id: 'futureproof',
            icon: 'shield' as const,
            title: 'Quantum-safe encryption',
            description:
                'Protected by hybrid post-quantum cryptography that defends your files against both current and emerging threats — including quantum computers.',
        },
        {
            id: 'devices',
            icon: 'smartphone' as const,
            title: 'Trusted devices only',
            description:
                'Each device is uniquely authorized. New devices require your explicit approval before they can access your vault.',
        },
        {
            id: 'localsend',
            icon: 'wifi' as const,
            title: 'Direct device transfer',
            description:
                'Send files between your devices over Wi-Fi — no cloud, no internet required. Encrypted end-to-end, every time.',
        },
        {
            id: 'zeroknowledge',
            icon: 'fingerprint' as const,
            title: 'Zero-knowledge login',
            description:
                'We verify your identity without ever seeing your password. It never leaves your device — not even during authentication.',
        },
    ],
} as const;

export const VISUAL_SECURITY = {
    label: 'HOW IT WORKS',
    headline: 'See your security\nin action.',
    subheadline: 'A simple process that keeps your files completely private.',
    steps: [
        {
            id: 'select',
            icon: 'file' as const,
            label: 'Your File',
            description: 'Select any file from your device',
        },
        {
            id: 'encrypt',
            icon: 'lock' as const,
            label: 'Encrypted',
            description: 'Locked on your device before upload',
        },
        {
            id: 'store',
            icon: 'cloud' as const,
            label: 'Secure Cloud',
            description: 'Stored as unreadable encrypted data',
        },
        {
            id: 'decrypt',
            icon: 'unlock' as const,
            label: 'Decrypted',
            description: 'Unlocked only on your device',
        },
        {
            id: 'access',
            icon: 'check' as const,
            label: 'Your File',
            description: 'Perfectly intact, fully private',
        },
    ],
    caption:
        'Your files are encrypted before they leave your device. The server only stores encrypted data it can never read. When you download, files are decrypted locally — only you can see them.',
} as const;

export const TRUST = {
    label: 'OUR PROMISE',
    quote:
        'We built StenVault because we believe privacy is a right, not a feature. Your data belongs to you — completely and forever.',
    pillars: [
        {
            stat: 'Zero',
            unit: 'access',
            label: 'Server-side visibility',
            description:
                'Not even we can see your files, filenames, or content. Everything is encrypted before it reaches our servers.',
        },
        {
            stat: 'AES-256',
            unit: 'standard',
            label: 'Encryption standard',
            description:
                'Your files are protected with AES-256-GCM — the same encryption standard trusted by banks and security agencies worldwide.',
        },
        {
            stat: 'Future',
            unit: 'proof',
            label: 'Quantum-safe security',
            description:
                'Hybrid post-quantum cryptography ensures your files remain secure even as quantum computing advances.',
        },
    ],
    guarantees: [
        'Open security architecture — independently verifiable',
        'No tracking, no profiling, no data mining',
        'Your encryption keys never leave your device',
        'We cannot comply with data requests — we have nothing to give',
    ],
} as const;

export const CTA = {
    headline: 'Take back control\nof your data.',
    subheadline:
        'Start protecting your files in seconds. No credit card required.',
    cta: 'Create your secure vault',
} as const;

export const FOOTER = {
    brand: {
        name: 'StenVault',
        tagline: 'Private by design. Not by promise.',
    },
    columns: [
        {
            title: 'Product',
            links: [
                { label: 'Features', href: '#features' },
                { label: 'Secure Send', href: '/send' },
                { label: 'Local Transfer', href: '/send/local' },
                { label: 'Pricing', href: '/pricing' },
            ],
        },
        {
            title: 'Security',
            links: [
                { label: 'How It Works', href: '#how-it-works' },
                { label: 'Our Promise', href: '#security' },
                { label: 'Security Whitepaper', href: 'https://github.com/StenVault/stenvault/blob/main/SECURITY_WHITEPAPER.md' },
            ],
        },
        {
            title: 'Legal',
            links: [
                { label: 'Terms of Service', href: '/terms' },
                { label: 'Privacy Policy', href: '/privacy' },
                { label: 'Contact', href: 'mailto:privacy@stenvault.com' },
            ],
        },
    ],
} as const;
