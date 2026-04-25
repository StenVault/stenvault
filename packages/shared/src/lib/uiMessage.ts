/**
 * Branded string primitives for user-facing UI copy.
 *
 * `UiTitle` and `UiDescription` are nominal brands over `string`. A raw
 * string cannot be assigned to either — callers must construct branded
 * values through `uiTitle()` / `uiDescription()` (for literals) or
 * through a translator like `toUserMessage(err)` (for caught values).
 *
 * The brand's job is compile-time only: it forces a reviewer to look at
 * every place we put text on screen. This prevents internal jargon
 * ("Worker", "WASM", "OperationError") from leaking into toasts and
 * alert dialogs. There is no runtime guard.
 *
 * Paired with `./toast.ts` — the typed sonner wrapper's `description`
 * slot accepts only `UiDescription`, so raw strings fail to compile at
 * the call site.
 */

declare const uiTitleBrand: unique symbol;
declare const uiDescriptionBrand: unique symbol;

export type UiTitle = string & { readonly [uiTitleBrand]: true };
export type UiDescription = string & { readonly [uiDescriptionBrand]: true };

export interface UiMessage {
    readonly title: UiTitle;
    readonly description: UiDescription;
}

/** Brand a literal for a static toast title (non-error-derived copy). */
export function uiTitle(literal: string): UiTitle {
    return literal as UiTitle;
}

/** Brand a literal for a static toast description (non-error-derived copy). */
export function uiDescription(literal: string): UiDescription {
    return literal as UiDescription;
}
