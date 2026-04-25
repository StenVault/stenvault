/**
 * Typed sonner wrapper.
 *
 * Sonner's `toast.error(title, { description })` accepts any string in the
 * `description` slot — which is how internal strings like "Worker error:
 * timed out" end up in user copy. This wrapper re-types `description` to
 * accept only `UiDescription`, a branded type produced by `toUserMessage(err)`
 * or `uiDescription('literal')`. Everything else on sonner's options
 * (`duration`, `id`, `action`, `position`, `onDismiss`, …) passes through
 * unchanged.
 *
 * Drop-in replacement: modules migrate from `import { toast } from 'sonner'`
 * to `import { toast } from '@/lib/toast'` one at a time. Each migration
 * surfaces any raw-string `description` as a TypeScript error at the
 * call site.
 */
import { toast as sonnerToast, type ExternalToast } from 'sonner';
import type { UiDescription } from '@/lib/errorMessages';

type SafeToastOptions = Omit<ExternalToast, 'description'> & {
    description?: UiDescription;
};

export const toast = {
    error: (title: string, options?: SafeToastOptions) =>
        options === undefined ? sonnerToast.error(title) : sonnerToast.error(title, options as ExternalToast),
    warning: (title: string, options?: SafeToastOptions) =>
        options === undefined ? sonnerToast.warning(title) : sonnerToast.warning(title, options as ExternalToast),
    info: (title: string, options?: SafeToastOptions) =>
        options === undefined ? sonnerToast.info(title) : sonnerToast.info(title, options as ExternalToast),
    success: (title: string, options?: SafeToastOptions) =>
        options === undefined ? sonnerToast.success(title) : sonnerToast.success(title, options as ExternalToast),
    message: (title: string, options?: SafeToastOptions) =>
        options === undefined ? sonnerToast(title) : sonnerToast(title, options as ExternalToast),
    // Sonner APIs that do not take a `description` string cannot leak and
    // are forwarded lazily so partial mocks in tests don't crash at module load.
    promise: ((...args: Parameters<typeof sonnerToast.promise>) =>
        sonnerToast.promise(...args)) as typeof sonnerToast.promise,
    dismiss: ((...args: Parameters<typeof sonnerToast.dismiss>) =>
        sonnerToast.dismiss(...args)) as typeof sonnerToast.dismiss,
    loading: ((...args: Parameters<typeof sonnerToast.loading>) =>
        sonnerToast.loading(...args)) as typeof sonnerToast.loading,
    custom: ((...args: Parameters<typeof sonnerToast.custom>) =>
        sonnerToast.custom(...args)) as typeof sonnerToast.custom,
};
