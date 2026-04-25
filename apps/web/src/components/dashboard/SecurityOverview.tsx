/**
 * Security overview card for the Home dashboard. Three rows for MFA,
 * email verification, and E2E encryption, plus a header that summarises
 * the overall posture in a single glance.
 */

import { motion } from 'framer-motion';
import {
    Shield,
    ShieldCheck,
    ShieldAlert,
    CheckCircle2,
    XCircle,
    AlertCircle,
} from 'lucide-react';
import { cn } from '@stenvault/shared/utils';
import { AuroraCard } from '@stenvault/shared/ui/aurora-card';
import { Badge } from '@stenvault/shared/ui/badge';

interface SecurityItem {
    id: string;
    label: string;
    status: 'enabled' | 'disabled' | 'warning';
    description?: string;
}

interface SecurityOverviewProps {
    mfaEnabled: boolean;
    emailVerified: boolean;
    encryptionEnabled?: boolean;
    lastLoginDate?: Date | null;
    className?: string;
    isLoading?: boolean;
}

const statusConfig = {
    enabled: {
        icon: CheckCircle2,
        color: 'text-[var(--theme-success)]',
        bgColor: 'bg-[var(--theme-success)]/10',
        label: 'Active',
    },
    disabled: {
        icon: XCircle,
        color: 'text-[var(--theme-error)]',
        bgColor: 'bg-[var(--theme-error)]/10',
        label: 'Inactive',
    },
    warning: {
        icon: AlertCircle,
        color: 'text-[var(--theme-warning)]',
        bgColor: 'bg-[var(--theme-warning)]/10',
        label: 'Warning',
    },
};

function SecurityItemRow({ item, index }: { item: SecurityItem; index: number }) {
    const config = statusConfig[item.status];
    const StatusIcon = config.icon;

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05, duration: 0.2 }}
            className={cn(
                'flex items-center justify-between py-2.5 px-1 rounded-lg',
                'hover:bg-secondary/50 transition-colors'
            )}
        >
            <div className="flex items-center gap-3">
                <div className={cn('p-1.5 rounded-md', config.bgColor)}>
                    <StatusIcon className={cn('h-4 w-4', config.color)} />
                </div>
                <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    {item.description && (
                        <p className="text-xs text-foreground-muted">{item.description}</p>
                    )}
                </div>
            </div>
            <Badge
                variant="secondary"
                className={cn(
                    'text-xs min-w-[52px] justify-center',
                    config.bgColor,
                    config.color,
                )}
            >
                {config.label}
            </Badge>
        </motion.div>
    );
}

function SecuritySkeleton() {
    return (
        <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-secondary" />
                        <div className="space-y-1">
                            <div className="h-4 w-24 bg-secondary rounded" />
                            <div className="h-3 w-32 bg-secondary rounded" />
                        </div>
                    </div>
                    <div className="h-5 w-12 bg-secondary rounded" />
                </div>
            ))}
        </div>
    );
}

export function SecurityOverview({
    mfaEnabled,
    emailVerified,
    encryptionEnabled = true,
    lastLoginDate,
    className,
    isLoading = false,
}: SecurityOverviewProps) {
    const securityItems: SecurityItem[] = [
        {
            id: 'mfa',
            label: '2FA Authentication',
            status: mfaEnabled ? 'enabled' : 'disabled',
            description: mfaEnabled ? 'TOTP code active' : 'Recommended to enable',
        },
        {
            id: 'email',
            label: 'Email Verified',
            status: emailVerified ? 'enabled' : 'warning',
            description: emailVerified ? 'Verified' : 'Please verify your email',
        },
        {
            id: 'encryption',
            label: 'E2E Encryption',
            status: encryptionEnabled ? 'enabled' : 'disabled',
            description: 'Files encrypted locally',
        },
    ];

    const securityScore = securityItems.filter(i => i.status === 'enabled').length;
    const totalItems = securityItems.length;
    const scorePercentage = Math.round((securityScore / totalItems) * 100);

    const overallStatus = scorePercentage === 100
        ? 'excellent'
        : scorePercentage >= 66
            ? 'good'
            : 'needs_attention';

    const overallConfig = {
        excellent: {
            icon: ShieldCheck,
            color: 'text-[var(--theme-success)]',
            bgColor: 'bg-[var(--theme-success)]/10',
            borderColor: 'border-[var(--theme-success)]/20',
            label: 'Excellent',
        },
        good: {
            icon: Shield,
            color: 'text-[var(--theme-warning)]',
            bgColor: 'bg-[var(--theme-warning)]/10',
            borderColor: 'border-[var(--theme-warning)]/20',
            label: 'Good',
        },
        needs_attention: {
            icon: ShieldAlert,
            color: 'text-[var(--theme-error)]',
            bgColor: 'bg-[var(--theme-error)]/10',
            borderColor: 'border-[var(--theme-error)]/20',
            label: 'Attention',
        },
    };

    const currentOverall = overallConfig[overallStatus];
    const OverallIcon = currentOverall.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <AuroraCard variant="default" className={cn(currentOverall.borderColor, className)}>
                <div className="flex flex-row items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className={cn('p-1.5 rounded-lg', currentOverall.bgColor)}>
                            <OverallIcon className={cn('h-5 w-5', currentOverall.color)} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-foreground text-base">Security</h3>
                            <p className="text-xs text-foreground-muted">
                                {currentOverall.label} • {scorePercentage}%
                            </p>
                        </div>
                    </div>
                    <Badge
                        variant="secondary"
                        className={cn('font-mono', currentOverall.bgColor, currentOverall.color)}
                    >
                        {securityScore}/{totalItems}
                    </Badge>
                </div>

                <div className="space-y-0.5">
                    {isLoading ? (
                        <SecuritySkeleton />
                    ) : (
                        securityItems.map((item, index) => (
                            <SecurityItemRow key={item.id} item={item} index={index} />
                        ))
                    )}

                    {lastLoginDate && (
                        <div className="pt-2 mt-2 border-t border-border">
                            <p className="text-xs text-foreground-muted text-center">
                                Last login: {new Date(lastLoginDate).toLocaleDateString('en-US', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </p>
                        </div>
                    )}
                </div>
            </AuroraCard>
        </motion.div>
    );
}
