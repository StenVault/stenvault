/**
 * toast wrapper — typed delegate for sonner.
 *
 * Two concerns:
 *   1. Runtime: each wrapped method forwards to the underlying sonner call
 *      with the title + options unchanged.
 *   2. Types: `description` slot accepts only `UiDescription` (branded) —
 *      raw strings fail to compile.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultError } from '@stenvault/shared/errors';
import { toast } from './toast';
import { toUserMessage, uiDescription } from './errorMessages';
import { toast as sonnerToast } from 'sonner';

vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), {
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        promise: vi.fn(),
        dismiss: vi.fn(),
        loading: vi.fn(),
        custom: vi.fn(),
    }),
}));

beforeEach(() => {
    vi.mocked(sonnerToast).mockClear();
    vi.mocked(sonnerToast.error).mockClear();
    vi.mocked(sonnerToast.warning).mockClear();
    vi.mocked(sonnerToast.info).mockClear();
    vi.mocked(sonnerToast.success).mockClear();
});

describe('toast wrapper — runtime delegation', () => {
    it('toast.error forwards title to sonner without a phantom options arg', () => {
        toast.error('Boom');
        expect(sonnerToast.error).toHaveBeenCalledWith('Boom');
    });

    it('toast.error forwards non-description options (duration, id)', () => {
        toast.error('Boom', { duration: 5000, id: 'err-1' });
        expect(sonnerToast.error).toHaveBeenCalledWith('Boom', { duration: 5000, id: 'err-1' });
    });

    it('toast.error forwards a branded description produced by toUserMessage', () => {
        const copy = toUserMessage(new VaultError('INFRA_TIMEOUT'));
        toast.error(copy.title, { description: copy.description });
        expect(sonnerToast.error).toHaveBeenCalledWith(copy.title, { description: copy.description });
    });

    it('toast.error forwards a branded description produced by uiDescription', () => {
        toast.error('Heads up', { description: uiDescription('Saved to your vault.') });
        expect(sonnerToast.error).toHaveBeenCalledWith('Heads up', {
            description: 'Saved to your vault.',
        });
    });

    it('warning / info / success / message all forward to the matching sonner method', () => {
        toast.warning('w');
        toast.info('i');
        toast.success('s');
        toast.message('m');
        expect(sonnerToast.warning).toHaveBeenCalledWith('w');
        expect(sonnerToast.info).toHaveBeenCalledWith('i');
        expect(sonnerToast.success).toHaveBeenCalledWith('s');
        expect(sonnerToast).toHaveBeenCalledWith('m');
    });
});

describe('toast wrapper — compile-time description guard', () => {
    it('refuses raw strings in description (compile-time only)', () => {
        // @ts-expect-error — a raw string is not a UiDescription. This line
        // exists to fail the build if the brand guard regresses.
        toast.error('Boom', { description: 'raw leak' });
        // The call above still executes at runtime (TS is stripped) — drain
        // the mock so test counts stay stable.
        vi.mocked(sonnerToast.error).mockClear();
        expect(true).toBe(true);
    });
});
