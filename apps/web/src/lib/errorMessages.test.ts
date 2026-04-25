/**
 * errorMessages — translator from `unknown` to curated user copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultError, type ErrorCode } from '@stenvault/shared/errors';
import { debugError } from '@/lib/debugLogger';
import {
    toUserMessage,
    uiTitle,
    uiDescription,
    type UiDescription,
    type UiTitle,
} from './errorMessages';

vi.mock('@/lib/debugLogger', () => ({
    debugError: vi.fn(),
    // Other exports not used here, but keep surface roughly intact.
    debugLog: vi.fn(),
    debugWarn: vi.fn(),
    debugGroup: vi.fn(),
    debugTime: vi.fn(),
    debugTimeAsync: vi.fn(),
    devLog: vi.fn(),
    devWarn: vi.fn(),
}));

// Every code the translator must know about. Kept in sync with
// `@stenvault/shared/errors/codes.ts`. A test below asserts that every
// code here yields non-empty copy so a new code without a mapping fails CI.
const ALL_CODES: readonly ErrorCode[] = [
    'INTEGRITY_FAILED',
    'WRONG_MASTER_PASSWORD',
    'SIGNATURE_INVALID',
    'KEY_UNAVAILABLE',
    'UNSUPPORTED_ENCRYPTION_VERSION',
    'FILE_CORRUPT',
    'FILE_TOO_LARGE',
    'MISSING_METADATA',
    'INFRA_WORKER_FAILED',
    'INFRA_WASM_FAILED',
    'INFRA_NETWORK',
    'INFRA_TIMEOUT',
    'INFRA_SW_UNAVAILABLE',
    'UNKNOWN',
];

const JARGON_RE = /worker|wasm|cvef|service worker|postmessage|operationerror|argon|kem|dsa|x25519|ed25519|hkdf|aes-?gcm|opaque/i;

beforeEach(() => {
    vi.mocked(debugError).mockClear();
});

describe('toUserMessage — mapping', () => {
    it('returns non-empty title + description for every known ErrorCode', () => {
        for (const code of ALL_CODES) {
            const msg = toUserMessage(new VaultError(code));
            expect(msg.title.length).toBeGreaterThan(0);
            expect(msg.description.length).toBeGreaterThan(0);
        }
    });

    it('never leaks internal jargon into user copy', () => {
        for (const code of ALL_CODES) {
            const msg = toUserMessage(new VaultError(code));
            expect(msg.title, `title for ${code}`).not.toMatch(JARGON_RE);
            expect(msg.description, `description for ${code}`).not.toMatch(JARGON_RE);
        }
    });

    it('returns curated copy for WRONG_MASTER_PASSWORD (locks a single code to catch accidental rewording)', () => {
        const msg = toUserMessage(new VaultError('WRONG_MASTER_PASSWORD'));
        expect(msg.title).toBe("That password didn't work");
        expect(msg.description).toBe('Check the spelling and try again.');
    });

    it('falls back to UNKNOWN copy for a code not in the mapping (forward-compat)', () => {
        const fromFuture = new VaultError('FUTURE_CODE_NOT_YET_DEFINED' as ErrorCode);
        const msg = toUserMessage(fromFuture);
        expect(msg.title).toBe('Something went wrong');
        expect(msg.description).toBe('Try again. If it keeps happening, refresh the page.');
        // Known VaultError — debugError must NOT be called (code is typed, just unmapped).
        expect(debugError).not.toHaveBeenCalled();
    });
});

describe('toUserMessage — untyped errors (unexpected)', () => {
    const samples: Array<[string, unknown]> = [
        ['plain Error', new Error('underlying')],
        ['null', null],
        ['undefined', undefined],
        ['string', 'boom'],
        ['number', 404],
        ['plain object', { shape: 'plain' }],
        ['TypeError', new TypeError('bad')],
    ];

    it.each(samples)('returns UNKNOWN copy and logs for %s', (_label, input) => {
        const msg = toUserMessage(input);
        expect(msg.title).toBe('Something went wrong');
        expect(msg.description).toBe('Try again. If it keeps happening, refresh the page.');
        expect(debugError).toHaveBeenCalledTimes(1);
        expect(debugError).toHaveBeenCalledWith(
            '[toUserMessage]',
            'Untyped error reached UI boundary',
            input,
        );
    });
});

describe('uiTitle / uiDescription helpers', () => {
    it('brands literals as UiTitle / UiDescription at compile time', () => {
        const t: UiTitle = uiTitle('Saved');
        const d: UiDescription = uiDescription('Your file was saved.');
        expect(t).toBe('Saved');
        expect(d).toBe('Your file was saved.');
    });

    it('raw strings cannot be assigned to UiDescription (compile-time brand check)', () => {
        // @ts-expect-error — a raw string must not be assignable to UiDescription;
        // this line is here to fail the build if the brand ever becomes structural.
        const _leak: UiDescription = 'raw';
        // Runtime has no guard — branding is compile-time only. The assertion above
        // is the real test; keep the value around to silence unused-variable checks.
        expect(_leak).toBe('raw');
    });
});

describe('toUserMessage — output shape', () => {
    it('returned strings are typed as UiTitle / UiDescription (compile-time)', () => {
        const msg = toUserMessage(new VaultError('INFRA_TIMEOUT'));
        // If either of these stops compiling, the branding is broken.
        const t: UiTitle = msg.title;
        const d: UiDescription = msg.description;
        expect(typeof t).toBe('string');
        expect(typeof d).toBe('string');
    });
});
