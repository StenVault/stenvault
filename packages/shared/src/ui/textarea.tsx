import * as React from "react";

import { cn } from "../utils/cn";
import { useComposition } from "../hooks/useComposition";
import { useDialogComposition } from "./dialog";

function Textarea({
    className,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
    ...props
}: React.ComponentProps<"textarea">) {
    const dialogComposition = useDialogComposition();

    const {
        onCompositionStart: handleCompositionStart,
        onCompositionEnd: handleCompositionEnd,
        onKeyDown: handleKeyDown,
    } = useComposition<HTMLTextAreaElement>({
        onKeyDown: (e) => {
            const isComposing =
                (e.nativeEvent as KeyboardEvent & { isComposing?: boolean })
                    .isComposing || dialogComposition.justEndedComposing();

            if (e.key === "Enter" && !e.shiftKey && isComposing) {
                return;
            }

            onKeyDown?.(e);
        },
        onCompositionStart: (e) => {
            dialogComposition.setComposing(true);
            onCompositionStart?.(e);
        },
        onCompositionEnd: (e) => {
            dialogComposition.markCompositionEnd();
            setTimeout(() => {
                dialogComposition.setComposing(false);
            }, 100);
            onCompositionEnd?.(e);
        },
    });

    return (
        <textarea
            data-slot="textarea"
            className={cn(
                "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-0 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-slate-950/50 flex field-sizing-content min-h-16 w-full rounded-sm border px-3 py-2 text-base shadow-none transition-[color,border-color] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                className,
            )}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onKeyDown={handleKeyDown}
            {...props}
        />
    );
}

export { Textarea };
