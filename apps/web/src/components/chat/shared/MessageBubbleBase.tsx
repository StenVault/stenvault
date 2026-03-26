/**
 * MessageBubbleBase - Layout base para bolhas de mensagem
 *
 * Componente primitivo que fornece a estrutura comum para mensagens.
 * Específicos (copy, encryption, streaming) são passados via slots/children.
 *
 * Usado por:
 * - AI Chat MessageBubble
 * - P2P Chat MessageBubble
 */
import { ReactNode, memo } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, Bot } from "lucide-react";

export type SenderType = "user" | "assistant" | "other";
export type BubbleVariant = "default" | "gradient" | "minimal";

interface MessageBubbleBaseProps {
    sender: SenderType;
    children: ReactNode;
    avatar?: ReactNode;
    avatarInitials?: string;
    showAvatar?: boolean;
    actions?: ReactNode;
    metadata?: ReactNode;
    headerContent?: ReactNode;
    indicator?: ReactNode;
    variant?: BubbleVariant;
    className?: string;
    bubbleClassName?: string;
    animate?: boolean;
}

export const MessageBubbleBase = memo(function MessageBubbleBase({
    sender,
    children,
    avatar,
    avatarInitials,
    showAvatar = true,
    actions,
    metadata,
    headerContent,
    indicator,
    variant = "default",
    className,
    bubbleClassName,
    animate = false,
}: MessageBubbleBaseProps) {
    const isUser = sender === "user";
    const isAssistant = sender === "assistant";

    const getBubbleStyles = () => {
        const base = "relative px-4 py-2.5 rounded-2xl text-sm";
        const corner = isUser ? "rounded-br-sm" : "rounded-bl-sm";

        switch (variant) {
            case "gradient":
                return cn(
                    base,
                    corner,
                    "shadow-sm transition-all duration-200 hover:shadow-md",
                    isUser
                        ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                );
            case "minimal":
                return cn(
                    base,
                    corner,
                    isUser
                        ? "bg-primary/10 text-foreground"
                        : "bg-muted text-foreground"
                );
            default:
                return cn(
                    base,
                    corner,
                    isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                );
        }
    };

    const renderDefaultAvatar = () => {
        if (avatar) return avatar;

        const avatarClasses = cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
            isUser
                ? "bg-primary text-primary-foreground"
                : isAssistant
                    ? "bg-muted"
                    : "bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-700 dark:to-slate-600"
        );

        if (avatarInitials) {
            return (
                <Avatar className="h-8 w-8 border-2 border-white dark:border-slate-800 shadow-sm">
                    <AvatarFallback className={avatarClasses}>
                        {avatarInitials}
                    </AvatarFallback>
                </Avatar>
            );
        }

        return (
            <div className={avatarClasses}>
                {isUser ? (
                    <User className="w-4 h-4" />
                ) : (
                    <Bot className="w-4 h-4" />
                )}
            </div>
        );
    };

    return (
        <div
            className={cn(
                "flex gap-3",
                isUser ? "flex-row-reverse" : "flex-row",
                animate && "animate-in slide-in-from-bottom-2 duration-300",
                className
            )}
        >
            {showAvatar && (
                <div className="flex-shrink-0">
                    {renderDefaultAvatar()}
                </div>
            )}

            <div
                className={cn(
                    "flex-1 max-w-[80%]",
                    isUser ? "text-right" : "text-left"
                )}
            >
                {headerContent && (
                    <div
                        className={cn(
                            "flex flex-wrap gap-2 mb-2",
                            isUser ? "justify-end" : "justify-start"
                        )}
                    >
                        {headerContent}
                    </div>
                )}

                <div className={cn(getBubbleStyles(), bubbleClassName)}>
                    {indicator}
                    {children}

                    {metadata && variant === "gradient" && (
                        <div
                            className={cn(
                                "flex items-center gap-1.5 mt-1 text-xs",
                                isUser ? "text-white/80" : "text-slate-500 dark:text-slate-400"
                            )}
                        >
                            {metadata}
                        </div>
                    )}
                </div>

                {(actions || (metadata && variant !== "gradient")) && (
                    <div
                        className={cn(
                            "flex items-center gap-2 mt-1.5",
                            isUser ? "justify-end" : "justify-start"
                        )}
                    >
                        {actions}
                        {metadata && variant !== "gradient" && (
                            <span className="text-[10px] text-muted-foreground">
                                {metadata}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

interface MessageContentProps {
    content: string;
    isStreaming?: boolean;
    className?: string;
}

export const MessageContent = memo(function MessageContent({ content, isStreaming, className }: MessageContentProps) {
    return (
        <p className={cn("whitespace-pre-wrap break-words leading-relaxed", className)}>
            {content}
            {isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-primary/70 animate-pulse rounded-sm" />
            )}
        </p>
    );
});
