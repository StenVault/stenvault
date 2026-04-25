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
import { cn } from "@stenvault/shared/utils";
import { Button } from "@stenvault/shared/ui/button";
import { Textarea } from "@stenvault/shared/ui/textarea";
import { Send, Paperclip, Loader2 } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@stenvault/shared/ui/tooltip";

interface ChatInputBaseProps {
    /** Valor do input */
    value: string;
    /** Callback de mudança */
    onChange: (value: string) => void;
    /** Callback de envio */
    onSend: () => void;
    /** Callback de seleção de arquivos */
    onFileSelect?: (files: File[]) => void;
    /** Se está enviando */
    isSending?: boolean;
    /** Se está fazendo upload */
    isUploading?: boolean;
    /** Se pode enviar (override automático baseado em value) */
    canSend?: boolean;
    /** Input placeholder */
    placeholder?: string;
    /** Minimum textarea height */
    minHeight?: number;
    /** Maximum textarea height */
    maxHeight?: number;
    /** Accept multiple files */
    multipleFiles?: boolean;
    /** Accepted file types */
    acceptFileTypes?: string;
    /** Slot for extra controls on the left (model selectors, etc) */
    leftControls?: ReactNode;
    /** Slot for extra controls on the right (before send) */
    rightControls?: ReactNode;
    /** Slot para conteúdo acima do input (attachments preview) */
    headerContent?: ReactNode;
    /** Slot para conteúdo abaixo do input (helper text) */
    footerContent?: ReactNode;
    /** Variante do botão de enviar */
    sendButtonVariant?: "default" | "amber" | "primary";
    /** Classes adicionais para o container */
    className?: string;
    /** Tooltip para botão de anexo */
    attachTooltip?: string;
}

/**
 * Componente base reutilizável para input de chat
 */
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

    // Determina se pode enviar
    const canSend = canSendOverride !== undefined
        ? canSendOverride
        : value.trim().length > 0 && !isSending;

    // Handler de teclado
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSend) {
                onSend();
            }
        }
    };

    // Handler de mudança
    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
    };

    // Handler de arquivo
    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && onFileSelect) {
            onFileSelect(Array.from(e.target.files));
            e.target.value = "";
        }
    };

    // Estilo do botão send
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
            {/* Header content (attachments preview) */}
            {headerContent}

            {/* Input Row */}
            <div className="flex items-end gap-2">
                {/* Left controls (model selectors, etc) */}
                {leftControls}

                {/* Attachment button (if file select enabled) */}
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

                {/* Text Input */}
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

                {/* Right controls */}
                {rightControls}

                {/* Send Button */}
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

            {/* Footer content (helper text) */}
            {footerContent}
        </div>
    );
}

/**
 * Hook para lógica de input de chat
 * Pode ser usado quando não se quer o componente base completo
 */
export function useChatInput(options?: {
    onTypingStart?: () => void;
    onTypingStop?: () => void;
    typingTimeout?: number;
}) {
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleTextChange = (value: string, setValue: (v: string) => void) => {
        setValue(value);

        // Typing indicator logic
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
