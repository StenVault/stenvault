/**
 * Input Component
 *
 * Design System: Nocturne
 * Premium input with gold focus effects.
 * Supports IME composition for CJK languages.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { useDialogComposition } from "@/components/ui/dialog";
import { useComposition } from "@/hooks/useComposition";
import { cn } from "@/lib/utils";

const inputVariants = cva(
  [
    // Base styles
    "flex w-full min-w-0",
    "bg-input border border-border",
    "text-foreground placeholder:text-foreground-muted",
    "transition-all duration-200",
    // Focus - Gold glow
    "outline-none",
    "focus-visible:border-[rgba(212,175,55,0.5)]",
    "focus-visible:ring-2 focus-visible:ring-[rgba(212,175,55,0.15)]",
    "focus-visible:shadow-[0_0_15px_rgba(212,175,55,0.1)]",
    // Selection - Gold
    "selection:bg-[rgba(212,175,55,0.2)] selection:text-foreground",
    // Disabled
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    // Invalid
    "aria-invalid:border-destructive aria-invalid:focus-visible:ring-[rgba(199,80,80,0.2)]",
    // File input
    "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
  ],
  {
    variants: {
      size: {
        sm: "h-8 px-3 text-sm rounded-md",
        default: "h-10 px-3 py-2 text-sm rounded-lg",
        lg: "h-12 px-4 text-base rounded-lg",
      },
      variant: {
        default: "",
        ghost: "border-transparent bg-transparent focus-visible:bg-input",
        filled: "bg-secondary border-transparent",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
);

export interface InputProps
  extends Omit<React.ComponentProps<"input">, "size">,
    VariantProps<typeof inputVariants> {
  /**
   * Icon to display on the left side
   */
  leftIcon?: React.ReactNode;
  /**
   * Icon or element to display on the right side
   */
  rightElement?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      size,
      variant,
      leftIcon,
      rightElement,
      onKeyDown,
      onCompositionStart,
      onCompositionEnd,
      ...props
    },
    ref
  ) => {
    // Get dialog composition context if available
    const dialogComposition = useDialogComposition();

    // IME composition handling for CJK languages
    const {
      onCompositionStart: handleCompositionStart,
      onCompositionEnd: handleCompositionEnd,
      onKeyDown: handleKeyDown,
    } = useComposition<HTMLInputElement>({
      onKeyDown: (e) => {
        const isComposing =
          (e.nativeEvent as KeyboardEvent & { isComposing?: boolean })
            .isComposing || dialogComposition.justEndedComposing();

        if (e.key === "Enter" && isComposing) {
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

    // If we have icons/elements, wrap in a container
    if (leftIcon || rightElement) {
      return (
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-foreground-muted">
              {leftIcon}
            </div>
          )}
          <input
            type={type}
            ref={ref}
            data-slot="input"
            className={cn(
              inputVariants({ size, variant }),
              leftIcon && "pl-10",
              rightElement && "pr-10",
              className
            )}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onKeyDown={handleKeyDown}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 flex items-center">
              {rightElement}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        ref={ref}
        data-slot="input"
        className={cn(inputVariants({ size, variant }), className)}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

/**
 * Search Input - Pre-configured input with search icon
 */
interface SearchInputProps extends Omit<InputProps, "leftIcon" | "type"> {
  onClear?: () => void;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onClear, value, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="search"
        leftIcon={
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        }
        rightElement={
          value && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="text-foreground-muted hover:text-foreground transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : undefined
        }
        value={value}
        {...props}
      />
    );
  }
);

SearchInput.displayName = "SearchInput";

export { Input, SearchInput, inputVariants };
