/**
 * ChatInputBase - Componente base para input de chat
 *
 * Fornece funcionalidade comum:
 * - Textarea com auto-resize
 * - Keyboard handling (Enter/Shift+Enter)
 * - File input trigger
 * - Send button
 *
 * Usado por:
 * - AI Chat ChatInput
 * - P2P Chat ChatInput
 */
import { useRef, ReactNode, KeyboardEvent, ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Loader2 } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatInputBaseProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onFileSelect?: (files: File[]) => void;
    isSending?: boolean;
    isUploading?: boolean;
    canSend?: boolean;
    placeholder?: string;
    minHeight?: number;
    maxHeight?: number;
    multipleFiles?: boolean;
    acceptFileTypes?: string;
    leftControls?: ReactNode;
    rightControls?: ReactNode;
    headerContent?: ReactNode;
    footerContent?: ReactNode;
    sendButtonVariant?: "default" | "amber" | "primary";
    className?: string;
    attachTooltip?: string;
}

export function ChatInputBase({
    value,
    onChange,
    onSend,
    onFileSelect,
    isSending = false,
    isUploading = false,
    canSend: canSendOverride,
    placeholder = "Type a message...",
    minHeight = 44,
    maxHeight = 200,
    multipleFiles = true,
    acceptFileTypes,
    leftControls,
    rightControls,
    headerContent,
    footerContent,
    sendButtonVariant = "default",
    className,
    attachTooltip = "Attach files",
}: ChatInputBaseProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const canSend = canSendOverride !== undefined
        ? canSendOverride
        : value.trim().length > 0 && !isSending;

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSend) {
                onSend();
            }
        }
    };

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && onFileSelect) {
            onFileSelect(Array.from(e.target.files));
            e.target.value = "";
        }
    };

    const getSendButtonStyle = () => {
        switch (sendButtonVariant) {
            case "amber":
                return "bg-amber-500 hover:bg-amber-600 text-white";
            case "primary":
                return "bg-primary hover:bg-primary/90 text-primary-foreground";
            default:
                return "";
        }
    };

    return (
        <div className={cn("space-y-2", className)}>
            {headerContent}

            <div className="flex items-end gap-2">
                {leftControls}

                {onFileSelect && (
                    <>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple={multipleFiles}
                            accept={acceptFileTypes}
                            className="hidden"
                            onChange={handleFileChange}
                            aria-label="Upload file"
                        />
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="flex-shrink-0"
                                        disabled={isUploading}
                                        onClick={() => fileInputRef.current?.click()}
                                        aria-label={isUploading ? "Uploading file..." : attachTooltip}
                                    >
                                        {isUploading ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : (
                                            <Paperclip className="h-5 w-5" />
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{attachTooltip}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </>
                )}

                <Textarea
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="flex-1 resize-none"
                    style={{ minHeight, maxHeight }}
                    rows={1}
                    aria-label="Message input"
                />

                {rightControls}

                <Button
                    onClick={onSend}
                    disabled={!canSend}
                    size="icon"
                    className={cn("flex-shrink-0", getSendButtonStyle())}
                    aria-label={isSending ? "Sending message..." : "Send message"}
                >
                    {isSending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        <Send className="h-5 w-5" />
                    )}
                </Button>
            </div>

            {footerContent}
        </div>
    );
}

export function useChatInput(options?: {
    onTypingStart?: () => void;
    onTypingStop?: () => void;
    typingTimeout?: number;
}) {
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleTextChange = (value: string, setValue: (v: string) => void) => {
        setValue(value);

        if (options?.onTypingStart) {
            options.onTypingStart();
        }

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        if (options?.onTypingStop) {
            typingTimeoutRef.current = setTimeout(
                options.onTypingStop,
                options.typingTimeout || 1000
            );
        }
    };

    const handleKeyDown = (
        e: KeyboardEvent<HTMLTextAreaElement>,
        onSend: () => void,
        canSend: boolean
    ) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSend) {
                onSend();
            }
        }
    };

    return {
        handleTextChange,
        handleKeyDown,
    };
}
