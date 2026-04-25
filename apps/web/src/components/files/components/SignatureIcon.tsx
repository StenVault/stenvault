/**
 * Compact badge used in file list rows to flag a file as cryptographically
 * signed. Mirrors TimestampIcon for visual consistency.
 */

import { ShieldCheck } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@stenvault/shared/ui/tooltip";
import { cn } from "@stenvault/shared/utils";
import { formatDate } from "@stenvault/shared";

interface SignatureIconProps {
    signedAt?: Date | null;
    className?: string;
}

export function SignatureIcon({ signedAt, className }: SignatureIconProps) {
    return (
        <TooltipProvider>
            <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                    <div
                        className={cn(
                            "flex items-center justify-center w-5 h-5 rounded-full",
                            "bg-green-100 dark:bg-green-900/30",
                            className
                        )}
                        aria-label="File is signed"
                    >
                        <ShieldCheck className="h-3 w-3 text-green-600 dark:text-green-400" />
                    </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                    <p className="text-xs">
                        Signed{signedAt ? ` on ${formatDate(new Date(signedAt))}` : ""}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
