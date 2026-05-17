/**
 * useTurnstile — auto-solve fallback contract.
 *
 * Cloudflare's auto-solve fails on VPN/Tor/ad-blockers/IP allowlists. The
 * widget normally surfaces an interactive challenge in that case, but the
 * SendPage container is rendered invisible by default. The `errored` flag
 * is what flips the container visible so the user can complete the
 * challenge — without it, the auto-solve timeout silently produces an
 * `undefined` token and the user sees a "Security check failed" toast
 * with no widget to interact with.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { useTurnstile } from './useTurnstile';

interface CapturedRenderOptions {
    sitekey: string;
    callback?: (token: string) => void;
    'error-callback'?: () => void;
}

function TestHarness({
    siteKey,
    onErrored,
}: {
    siteKey?: string;
    onErrored: (errored: boolean) => void;
}) {
    const { containerRef, errored } = useTurnstile(siteKey);
    onErrored(errored);
    return <div ref={containerRef} />;
}

describe('useTurnstile', () => {
    let renderOptions: CapturedRenderOptions | null = null;
    let originalHeadAppendChild: typeof document.head.appendChild;

    beforeEach(() => {
        renderOptions = null;
        (window as unknown as { turnstile?: unknown }).turnstile = {
            render: vi.fn((_el: HTMLElement, opts: CapturedRenderOptions) => {
                renderOptions = opts;
                return 'widget-id';
            }),
            getResponse: vi.fn(),
            reset: vi.fn(),
            remove: vi.fn(),
        };
        // The hook lazy-loads challenges.cloudflare.com/turnstile/v0/api.js
        // by appending a <script> tag and resolves on onload. happy-dom's
        // built-in script loader fires onerror because it can't reach the
        // network, so intercept appendChild for the turnstile script and
        // fire onload synchronously instead.
        originalHeadAppendChild = document.head.appendChild.bind(document.head);
        document.head.appendChild = ((node: Node) => {
            if (
                node instanceof HTMLScriptElement &&
                node.src.includes('turnstile')
            ) {
                queueMicrotask(() => {
                    if (node.onload) node.onload(new Event('load'));
                });
                return node;
            }
            return originalHeadAppendChild(node);
        }) as typeof document.head.appendChild;
    });

    afterEach(() => {
        document.head.appendChild = originalHeadAppendChild;
        delete (window as unknown as { turnstile?: unknown }).turnstile;
    });

    it('is a no-op when siteKey is undefined', async () => {
        let lastErrored = false;
        render(<TestHarness siteKey={undefined} onErrored={(e) => { lastErrored = e; }} />);
        // Effect should early-return; no render called, no errored flip.
        await new Promise((r) => queueMicrotask(() => r(undefined)));
        expect(renderOptions).toBeNull();
        expect(lastErrored).toBe(false);
    });

    it('errored starts false and flips to true when error-callback fires', async () => {
        let lastErrored = false;
        render(<TestHarness siteKey="site-key-test" onErrored={(e) => { lastErrored = e; }} />);

        await waitFor(() => expect(renderOptions).not.toBeNull());
        expect(lastErrored).toBe(false);

        act(() => {
            renderOptions!['error-callback']!();
        });

        expect(lastErrored).toBe(true);
    });

    it('errored returns to false when the user completes the challenge', async () => {
        let lastErrored = false;
        render(<TestHarness siteKey="site-key-test" onErrored={(e) => { lastErrored = e; }} />);
        await waitFor(() => expect(renderOptions).not.toBeNull());

        act(() => renderOptions!['error-callback']!());
        expect(lastErrored).toBe(true);

        act(() => renderOptions!.callback!('token-after-interactive-solve'));
        expect(lastErrored).toBe(false);
    });
});
