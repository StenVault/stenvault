/**
 * ═══════════════════════════════════════════════════════════════
 * SECURITY OVERVIEW COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * Shows security status overview including MFA, encryption,
 * and account protection status.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { motion } from 'framer-motion';
import {
    Shield,
    ShieldCheck,
    ShieldAlert,
    Lock,
    Unlock,
    Key,
    Fingerprint,
    CheckCircle2,
    XCircle,
    AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        label: 'Active',
    },
    disabled: {
        icon: XCircle,
        color: 'text-rose-400',
        bgColor: 'bg-rose-500/10',
        label: 'Inactive',
    },
    warning: {
        icon: AlertCircle,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
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
                'flex items-center justify-between p-3 rounded-lg',
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
                    'text-xs',
                    item.status === 'enabled' && 'bg-emerald-500/10 text-emerald-400',
                    item.status === 'disabled' && 'bg-rose-500/10 text-rose-400',
                    item.status === 'warning' && 'bg-amber-500/10 text-amber-400'
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
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/10',
            borderColor: 'border-emerald-500/20',
            label: 'Excellent',
        },
        good: {
            icon: Shield,
            color: 'text-amber-400',
            bgColor: 'bg-amber-500/10',
            borderColor: 'border-amber-500/20',
            label: 'Good',
        },
        needs_attention: {
            icon: ShieldAlert,
            color: 'text-rose-400',
            bgColor: 'bg-rose-500/10',
            borderColor: 'border-rose-500/20',
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
            <Card className={cn(currentOverall.borderColor, className)}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-2">
                        <div className={cn('p-2 rounded-lg', currentOverall.bgColor)}>
                            <OverallIcon className={cn('h-5 w-5', currentOverall.color)} />
                        </div>
                        <div>
                            <CardTitle className="text-base">Security</CardTitle>
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
                </CardHeader>

                <CardContent className="space-y-1">
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
                </CardContent>
            </Card>
        </motion.div>
    );
}
