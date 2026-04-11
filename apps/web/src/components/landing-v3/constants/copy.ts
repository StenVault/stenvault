/**
 * Marketing Copy — StenVault Landing Page
 *
 * Structure: emotion → substance → proof → emotion
 * "Sten" = stone (Scandinavian). Moments carved in stone, safe in the cloud.
 * No competitor attacks. Focus on what WE offer. Back it up with real architecture.
 */

export const HEADER = {
    nav: [
        { label: 'Features', href: '#features' },
        { label: 'Security', href: '#security' },
        { label: 'How It Works', href: '#how-it-works' },
        { label: 'Pricing', href: '/pricing', isRoute: true },
    ],
} as const;

export const HERO = {
    headline: {
        line1: 'Carved in stone.',
        line2: 'Safe in the cloud.',
    },
    subheadline:
        'Your photos, documents, and memories — encrypted on your device before they ever touch our servers. Built so that not even we can reach them.',
    cta: 'Start protecting what matters',
    ctaSecondary: 'See How It Works',
    trustBadges: [
        'Zero-knowledge architecture',
        'Post-quantum encryption',
        'Open source',
    ],
} as const;

export const VALUE = {
    label: 'WHY STENVAULT',
    headline: 'Security you can\nverify, not just believe.',
    subheadline:
        'We believe your family photos deserve exactly the same protection as a top-classified government document. Here\u2019s how we make that real.',
    cards: [
        {
            id: 'zeroknowledge',
            icon: 'lock' as const,
            title: 'Encrypted before it leaves',
            description:
                'Every file is sealed with AES-256-GCM on your device before upload. Your master key is derived locally via Argon2id and never leaves your device. OPAQUE (RFC 9807) means your password isn\u2019t transmitted \u2014 not even as a hash. Our servers only ever see ciphertext.',
        },
        {
            id: 'postquantum',
            icon: 'shield' as const,
            title: 'Quantum-safe today',
            description:
                'Hybrid X25519 + ML-KEM-768 key exchange, HKDF-SHA256 derivation, and Ed25519 + ML-DSA-65 signatures. Protected against both classical and quantum attacks \u2014 no future update required.',
        },
        {
            id: 'verifiable',
            icon: 'code' as const,
            title: 'Open and verifiable',
            description:
                'Open security architecture. Every cryptographic claim is auditable. Don\u2019t take our word for it \u2014 read the code, verify the proofs, check the math.',
        },
    ],
} as const;

export const FEATURES = {
    label: 'WHAT WE BUILT',
    headline: 'The care your\ndata deserves.',
    subheadline:
        'Every feature exists for one reason: your moments stay yours.',
    cards: [
        {
            id: 'encrypted',
            icon: 'lock' as const,
            title: 'Sealed before it leaves',
            description:
                'AES-256-GCM encryption happens on your device. Each file gets a unique key, wrapped with your master key via AES-KW. Our servers only ever see ciphertext.',
        },
        {
            id: 'key',
            icon: 'key' as const,
            title: 'Your key. Only your key.',
            description:
                'Your master key is derived from your password via Argon2id (47 MiB, 1 iteration). It never leaves your device. No backdoor. No recovery access for us. No override.',
        },
        {
            id: 'futureproof',
            icon: 'shield' as const,
            title: 'Built for what\u2019s coming',
            description:
                'Hybrid X25519 + ML-KEM-768 key exchange with Ed25519 + ML-DSA-65 signatures. Your files are quantum-safe today, not in some future update.',
        },
        {
            id: 'devices',
            icon: 'smartphone' as const,
            title: 'Devices you trust',
            description:
                'Each device is uniquely authorized with its own encryption key. New devices require your explicit approval via an existing trusted device before they can access your vault.',
        },
        {
            id: 'localsend',
            icon: 'wifi' as const,
            title: 'Direct, no cloud',
            description:
                'Transfer files between your devices over your local network using WebRTC with end-to-end encryption. No servers involved, no internet required.',
        },
        {
            id: 'zeroknowledge',
            icon: 'fingerprint' as const,
            title: 'Zero-knowledge authentication',
            description:
                'OPAQUE protocol (RFC 9807) \u2014 your password is never transmitted, not even as a hash. The server proves it knows nothing about your credentials.',
        },
    ],
} as const;

export const VISUAL_SECURITY = {
    label: 'HOW IT WORKS',
    headline: 'From your device.\nTo stone.',
    subheadline: 'A simple path that keeps your moments completely private.',
    steps: [
        {
            id: 'select',
            icon: 'file' as const,
            label: 'Your File',
            description: 'Any file, on your device',
        },
        {
            id: 'encrypt',
            icon: 'lock' as const,
            label: 'Sealed',
            description: 'Encrypted with your key before upload',
        },
        {
            id: 'store',
            icon: 'cloud' as const,
            label: 'Stored',
            description: 'Unreadable data on our servers',
        },
        {
            id: 'decrypt',
            icon: 'unlock' as const,
            label: 'Unlocked',
            description: 'Decrypted only on your device',
        },
        {
            id: 'access',
            icon: 'check' as const,
            label: 'Yours',
            description: 'Perfectly intact. Completely private.',
        },
    ],
    caption:
        'Everything happens on your device. The server only ever touches encrypted data it can\u2019t read. When you need your files back, they\u2019re decrypted locally \u2014 because only you hold the key.',
} as const;

export const SOCIAL_PROOF = {
    label: 'BUILT DIFFERENT',
    quote:
        'Your family photos deserve the same protection as a state secret. We built StenVault because your moments matter \u2014 carved in stone, not left to chance.',
    trustSignals: [
        { label: 'Open Source', icon: 'github' as const, href: 'https://github.com/StenVault/stenvault' },
        { label: 'GDPR Compliant', icon: 'scale' as const },
        { label: 'EU Hosted', icon: 'flag' as const },
        { label: 'Post-Quantum', icon: 'shield' as const },
    ],
    guarantees: [
        'We can\u2019t read your files \u2014 not because of policy, because of math',
        'We can\u2019t comply with data requests \u2014 we have nothing readable to give',
        'We can\u2019t lock you out \u2014 your keys, your data, your control',
        'We can\u2019t hide our code \u2014 the entire security architecture is auditable',
    ],
    stats: [
        {
            stat: '0',
            unit: 'bytes',
            label: 'of plaintext on our servers',
        },
        {
            stat: '100%',
            unit: 'client',
            label: 'encryption happens on your device',
        },
        {
            stat: 'Open',
            unit: 'source',
            label: 'every line of security code is public',
        },
    ],
} as const;

export const CTA = {
    headline: 'Your moments deserve\nto last forever.',
    subheadline:
        'Start protecting what matters. Free. No credit card.',
    cta: 'Create your vault',
} as const;

export const FOOTER = {
    brand: {
        name: 'StenVault',
        tagline: 'Your moments. Carved in stone.',
    },
    columns: [
        {
            title: 'Product',
            links: [
                { label: 'Features', href: '/landing#features' },
                { label: 'Secure Send', href: '/send' },
                { label: 'Local Transfer', href: '/send/local' },
                { label: 'Pricing', href: '/pricing' },
            ],
        },
        {
            title: 'Security',
            links: [
                { label: 'How It Works', href: '/landing#how-it-works' },
                { label: 'Our Promise', href: '/landing#security' },
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
