/**
 * uiMessage — branded string primitives for user-facing UI copy.
 */
import { describe, it, expect } from 'vitest';
import {
    uiTitle,
    uiDescription,
    type UiDescription,
    type UiTitle,
} from './uiMessage';

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

    it('raw strings cannot be assigned to UiTitle (compile-time brand check)', () => {
        // @ts-expect-error — a raw string must not be assignable to UiTitle.
        const _leak: UiTitle = 'raw';
        expect(_leak).toBe('raw');
    });
});
